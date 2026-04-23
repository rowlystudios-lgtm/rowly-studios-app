import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { createServiceClient } from '@/lib/supabase-service'
import {
  notifyJobOffer,
  notifyConfirmation,
} from '@/lib/notifications'
import { sendTransactionalEmail } from '@/lib/email'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * POST /api/notifications
 *
 * Central dispatcher for v1.2 notification flows. Accepts:
 *   { action: 'job-offer', bookingId }
 *   { action: 'talent-confirmed-to-client', bookingId }
 *   { action: 'job-wrapped-to-client', jobId }
 *   { action: 'booking-conflict', bookingId, releasedJobId, affectedClientId,
 *       talentName? }
 *
 * Auth: either an authenticated user (server actions calling this via
 * cookies) or a valid x-cron-secret / Authorization Bearer header (so
 * cron jobs can use it too).
 */
export async function POST(req: NextRequest) {
  const authed = await isAuthorized(req)
  if (!authed) {
    return new NextResponse('Unauthorized', { status: 401 })
  }

  let body: Record<string, unknown>
  try {
    body = (await req.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const action = typeof body.action === 'string' ? body.action : ''
  try {
    switch (action) {
      case 'job-offer': {
        const bookingId = stringArg(body, 'bookingId')
        if (!bookingId) return badRequest('Missing bookingId')
        await notifyJobOffer(bookingId)
        return NextResponse.json({ ok: true })
      }
      case 'talent-confirmed-to-client': {
        const bookingId = stringArg(body, 'bookingId')
        if (!bookingId) return badRequest('Missing bookingId')
        // notifyConfirmation already emails the client in addition to
        // the talent / admin copy. Reusing keeps the copy consistent.
        await notifyConfirmation(bookingId)
        return NextResponse.json({ ok: true })
      }
      case 'job-wrapped-to-client': {
        const jobId = stringArg(body, 'jobId')
        if (!jobId) return badRequest('Missing jobId')
        const result = await sendJobWrappedToClient(jobId)
        return NextResponse.json(result)
      }
      case 'booking-conflict': {
        const jobId = stringArg(body, 'releasedJobId')
        const clientId = stringArg(body, 'affectedClientId')
        const talentName = stringArg(body, 'talentName') || 'A confirmed talent'
        if (!jobId || !clientId) {
          return badRequest('Missing releasedJobId or affectedClientId')
        }
        const result = await sendBookingConflictToClient({
          jobId,
          clientId,
          talentName,
        })
        return NextResponse.json(result)
      }
      default:
        return badRequest(`Unknown action: ${action || '(empty)'}`)
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[api/notifications] failed:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'dispatch_failed' },
      { status: 500 }
    )
  }
}

function stringArg(body: Record<string, unknown>, key: string): string | null {
  const v = body[key]
  return typeof v === 'string' && v.trim() ? v.trim() : null
}

function badRequest(msg: string) {
  return NextResponse.json({ error: msg }, { status: 400 })
}

async function isAuthorized(req: NextRequest): Promise<boolean> {
  // Header-secret path (cron, server-to-server).
  const secret = process.env.CRON_SECRET
  const headerSecret =
    req.headers.get('x-cron-secret') ||
    req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ||
    ''
  if (secret && headerSecret === secret) return true

  // Authenticated-user path (server actions using cookies).
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return Boolean(user)
}

/* ─── job-wrapped-to-client ─── */

async function sendJobWrappedToClient(
  jobId: string
): Promise<{ ok: boolean; emailed?: boolean; reason?: string }> {
  const svc = createServiceClient()
  const { data: job } = await svc
    .from('jobs')
    .select(
      `id, title, end_date, wrapped_at, client_id,
       profiles!jobs_client_id_fkey (full_name, email,
         client_profiles (company_name, billing_email))`
    )
    .eq('id', jobId)
    .maybeSingle()
  if (!job) return { ok: false, reason: 'job_not_found' }

  type CP = { company_name: string | null; billing_email: string | null } | null
  const profile = (job as unknown as {
    profiles:
      | { full_name: string | null; email: string | null; client_profiles: CP | CP[] }
      | { full_name: string | null; email: string | null; client_profiles: CP | CP[] }[]
      | null
  }).profiles
  const p = Array.isArray(profile) ? (profile[0] ?? null) : profile
  const cp: CP = Array.isArray(p?.client_profiles)
    ? (p?.client_profiles[0] ?? null)
    : (p?.client_profiles ?? null)
  const to = cp?.billing_email || p?.email || null
  const clientName = cp?.company_name || p?.full_name || 'there'

  // Always record an in-app notification for the client.
  if (job.client_id) {
    await svc.from('notifications').insert({
      user_id: job.client_id,
      type: 'job_wrapped',
      title: `Wrap: ${job.title}`,
      body: `Your shoot "${job.title}" has been wrapped by the Rowly Studios team. An invoice will follow shortly.`,
      link: `/app`,
      action_url: `/app`,
      priority: 'normal',
      clearable: true,
    })
  }

  if (!to) return { ok: true, emailed: false, reason: 'no_billing_email' }

  const wrapDate = job.wrapped_at
    ? new Date(job.wrapped_at).toLocaleDateString('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      })
    : 'today'
  const res = await sendTransactionalEmail({
    to,
    subject: `Wrap: ${job.title}`,
    html: `
      <p>Hi ${clientName},</p>
      <p>Your shoot <strong>${job.title}</strong> has been wrapped (${wrapDate}). Thank you for working with Rowly Studios.</p>
      <p>An invoice will follow shortly via email and through your dashboard.</p>
      <p>— Rowly Studios</p>
    `,
  })
  return { ok: true, emailed: !res.error }
}

/* ─── booking-conflict (per affected client) ─── */

async function sendBookingConflictToClient(args: {
  jobId: string
  clientId: string
  talentName: string
}): Promise<{ ok: boolean; emailed?: boolean; reason?: string }> {
  const svc = createServiceClient()
  const [jobRes, clientRes] = await Promise.all([
    svc
      .from('jobs')
      .select('id, title, start_date')
      .eq('id', args.jobId)
      .maybeSingle(),
    svc
      .from('profiles')
      .select(
        `id, full_name, email,
         client_profiles (company_name, billing_email)`
      )
      .eq('id', args.clientId)
      .maybeSingle(),
  ])
  const job = jobRes.data
  const client = clientRes.data as unknown as
    | {
        full_name: string | null
        email: string | null
        client_profiles:
          | { company_name: string | null; billing_email: string | null }
          | { company_name: string | null; billing_email: string | null }[]
          | null
      }
    | null
  if (!job || !client) return { ok: false, reason: 'not_found' }

  const cp = Array.isArray(client.client_profiles)
    ? (client.client_profiles[0] ?? null)
    : client.client_profiles
  const to = cp?.billing_email || client.email || null
  const clientName = cp?.company_name || client.full_name || 'there'

  if (!to) return { ok: true, emailed: false, reason: 'no_billing_email' }

  const startDate = job.start_date
    ? new Date(job.start_date).toLocaleDateString('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      })
    : 'your booked dates'

  const res = await sendTransactionalEmail({
    to,
    subject: `Talent change: ${job.title}`,
    html: `
      <p>Hi ${clientName},</p>
      <p><strong>${args.talentName}</strong> has confirmed another booking on overlapping dates and is no longer available for <strong>${job.title}</strong> (${startDate}).</p>
      <p>The Rowly Studios team is already re-crewing — you'll hear from us shortly with a replacement suggestion.</p>
      <p>— Rowly Studios</p>
    `,
  })
  return { ok: true, emailed: !res.error }
}

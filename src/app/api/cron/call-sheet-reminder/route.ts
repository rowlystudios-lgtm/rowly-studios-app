import { NextResponse, type NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase-service'
import { sendTransactionalEmail } from '@/lib/email'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

/**
 * Daily call-sheet reminder. Scheduled 0 1 * * * UTC (6pm PT) in
 * vercel.json. Finds jobs whose start_date is tomorrow (LA time) and
 * status='confirmed', then emails the client's billing address + every
 * confirmed talent with the call-sheet recap.
 *
 * Best-effort on jobs.call_sheet_sent_at — updates if the column exists,
 * otherwise skips the stamp silently.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  const headerSecret =
    req.headers.get('x-cron-secret') ||
    req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ||
    ''
  if (!secret || headerSecret !== secret) {
    return new NextResponse('Unauthorized', { status: 401 })
  }

  const tomorrow = laTomorrowIso()
  const svc = createServiceClient()

  const { data: jobs, error } = await svc
    .from('jobs')
    .select(
      `id, title, start_date, call_time, location, address_line,
       address_city, address_state, client_id,
       profiles!jobs_client_id_fkey (full_name, email,
         client_profiles (company_name, billing_email)),
       job_bookings (id, status, talent_id,
         profiles!job_bookings_talent_id_fkey (first_name, last_name, full_name,
           email, phone))`
    )
    .eq('start_date', tomorrow)
    .eq('status', 'confirmed')

  if (error) {
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 }
    )
  }

  type CP = { company_name: string | null; billing_email: string | null } | null
  type TalentP = {
    first_name: string | null
    last_name: string | null
    full_name: string | null
    email: string | null
    phone: string | null
  } | null
  type BRow = {
    id: string
    status: string
    talent_id: string
    profiles: TalentP | TalentP[] | null
  }
  type JobRow = {
    id: string
    title: string
    start_date: string | null
    call_time: string | null
    location: string | null
    address_line: string | null
    address_city: string | null
    address_state: string | null
    client_id: string | null
    profiles:
      | {
          full_name: string | null
          email: string | null
          client_profiles: CP | CP[]
        }
      | {
          full_name: string | null
          email: string | null
          client_profiles: CP | CP[]
        }[]
      | null
    job_bookings: BRow[] | null
  }

  const rows = (jobs ?? []) as unknown as JobRow[]
  let emailed = 0
  let skipped = 0
  let errors = 0

  for (const job of rows) {
    try {
      const crew = (job.job_bookings ?? []).filter(
        (b) => b.status === 'confirmed'
      )
      if (crew.length === 0) {
        skipped += 1
        continue
      }

      const crewNames = crew
        .map((b) => {
          const p = Array.isArray(b.profiles) ? (b.profiles[0] ?? null) : b.profiles
          return (
            [p?.first_name, p?.last_name].filter(Boolean).join(' ') ||
            p?.full_name ||
            'Talent'
          )
        })
        .join(', ')

      const locationLine =
        [job.address_line, job.address_city, job.address_state]
          .filter(Boolean)
          .join(', ') ||
        job.location ||
        'TBD'
      const call = job.call_time ? job.call_time.slice(0, 5) : 'TBD'

      const htmlBody = `
        <p>Hi <RECIPIENT>,</p>
        <p>Quick reminder that <strong>${job.title}</strong> shoots tomorrow.</p>
        <ul style="font-size:14px;line-height:1.6">
          <li><strong>Call time:</strong> ${call}</li>
          <li><strong>Location:</strong> ${locationLine}</li>
          <li><strong>Crew:</strong> ${crewNames}</li>
        </ul>
        <p>Questions? Reply directly and we'll sort it.</p>
        <p>— Rowly Studios</p>
      `

      // Client email.
      const p = Array.isArray(job.profiles) ? (job.profiles[0] ?? null) : job.profiles
      const cp: CP = Array.isArray(p?.client_profiles)
        ? (p?.client_profiles[0] ?? null)
        : (p?.client_profiles ?? null)
      const clientTo = cp?.billing_email || p?.email || null
      const clientName = cp?.company_name || p?.full_name || 'there'
      if (clientTo) {
        await sendTransactionalEmail({
          to: clientTo,
          subject: `Tomorrow's call sheet — ${job.title}`,
          html: htmlBody.replace('<RECIPIENT>', clientName),
        })
        emailed += 1
      }

      // Talent emails.
      for (const b of crew) {
        const t = Array.isArray(b.profiles) ? (b.profiles[0] ?? null) : b.profiles
        const to = t?.email ?? null
        if (!to) continue
        const firstName =
          t?.first_name ||
          t?.full_name?.split(' ')[0] ||
          'there'
        await sendTransactionalEmail({
          to,
          subject: `Tomorrow's call sheet — ${job.title}`,
          html: htmlBody.replace('<RECIPIENT>', firstName),
        })
        emailed += 1
      }

      // Stamp call_sheet_sent_at if the column exists. Guarded because
      // the v1.2 migration's addition of this column may not have
      // landed in every environment yet.
      try {
        await svc
          .from('jobs')
          .update({ call_sheet_sent_at: new Date().toISOString() })
          .eq('id', job.id)
      } catch {
        // column missing — non-fatal
      }
    } catch {
      errors += 1
    }
  }

  return NextResponse.json({
    ok: true,
    tomorrow,
    jobs: rows.length,
    emailed,
    skipped,
    errors,
  })
}

/** YYYY-MM-DD for tomorrow in LA time. */
function laTomorrowIso(): string {
  const nowIn = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Los_Angeles',
  }).format(new Date())
  const parts = nowIn.split('-').map(Number)
  const d = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]))
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
}

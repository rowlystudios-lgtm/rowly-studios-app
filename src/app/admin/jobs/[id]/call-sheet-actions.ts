'use server'

import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/admin-auth'
import { createServiceClient } from '@/lib/supabase-service'
import { sendTransactionalEmail } from '@/lib/email'

export type CallSheetMode = 'client_only' | 'everyone'

type TalentRow = {
  id: string
  name: string
  role: string
  email: string | null
  phone: string | null
  avatarUrl: string | null
}

type CallSheetContext = {
  jobId: string
  jobTitle: string
  jobCode: string | null
  clientName: string
  clientEmail: string | null
  shootDate: string | null
  shootDateLong: string | null
  callTime12: string | null
  locationDisplay: string | null
  fullAddress: string | null
  mapsUrl: string | null
  productionNotes: string | null
  team: TalentRow[]
}

type ClientJoin = {
  full_name: string | null
  email: string | null
  client_profiles:
    | { company_name: string | null; billing_email: string | null }
    | { company_name: string | null; billing_email: string | null }[]
    | null
}

function unwrap<T>(v: T | T[] | null | undefined): T | null {
  if (v == null) return null
  return Array.isArray(v) ? (v[0] ?? null) : v
}

function fmtLongDate(iso: string | null): string | null {
  if (!iso) return null
  const parts = iso.split('-').map(Number)
  if (parts.length !== 3 || parts.some(Number.isNaN)) return null
  const d = new Date(parts[0], parts[1] - 1, parts[2])
  return d.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
}

function fmt12h(time24: string | null): string | null {
  if (!time24) return null
  const m = time24.match(/^(\d{1,2}):(\d{2})/)
  if (!m) return null
  const h = parseInt(m[1], 10)
  const mins = m[2]
  const ampm = h < 12 ? 'AM' : 'PM'
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h
  return `${h12}:${mins} ${ampm}`
}

function buildAddress(job: {
  address_line: string | null
  address_city: string | null
  address_state: string | null
  address_zip: string | null
  location: string | null
}): { display: string | null; full: string | null; mapsUrl: string | null } {
  const parts = [
    job.address_line,
    job.address_city,
    [job.address_state, job.address_zip].filter(Boolean).join(' '),
  ].filter((s): s is string => Boolean(s && s.trim()))
  const full = parts.length > 0 ? parts.join(', ') : null
  const display = job.location ?? job.address_city ?? full
  const mapsUrl = full
    ? `https://maps.apple.com/?q=${encodeURIComponent(full)}`
    : null
  return { display, full, mapsUrl }
}

function escapeHtml(v: string | null | undefined): string {
  if (!v) return ''
  return v
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).slice(0, 2)
  return parts.map((p) => p[0]?.toUpperCase() ?? '').join('') || '?'
}

async function loadCallSheetContext(jobId: string): Promise<CallSheetContext | null> {
  const svc = createServiceClient()
  const [jobRes, bookingsRes] = await Promise.all([
    svc
      .from('jobs')
      .select(
        `id, title, job_code, start_date, call_time, location,
         address_line, address_city, address_state, address_zip,
         description, client_notes,
         profiles!jobs_client_id_fkey (full_name, email,
           client_profiles (company_name, billing_email))`
      )
      .eq('id', jobId)
      .maybeSingle(),
    svc
      .from('job_bookings')
      .select(
        `id, status,
         profiles!job_bookings_talent_id_fkey (id, full_name, first_name, last_name,
           email, phone, avatar_url,
           talent_profiles (department, primary_role))`
      )
      .eq('job_id', jobId)
      .eq('status', 'confirmed'),
  ])
  const job = jobRes.data as
    | (Record<string, unknown> & { profiles: ClientJoin | ClientJoin[] | null })
    | null
  if (!job) return null

  const clientProfile = unwrap(job.profiles)
  const cp = clientProfile ? unwrap(clientProfile.client_profiles) : null
  const clientName = cp?.company_name || clientProfile?.full_name || 'Client'
  const clientEmail = cp?.billing_email || clientProfile?.email || null

  const addr = buildAddress({
    address_line: (job.address_line as string | null) ?? null,
    address_city: (job.address_city as string | null) ?? null,
    address_state: (job.address_state as string | null) ?? null,
    address_zip: (job.address_zip as string | null) ?? null,
    location: (job.location as string | null) ?? null,
  })

  type TalentJoin = {
    id: string
    full_name: string | null
    first_name: string | null
    last_name: string | null
    email: string | null
    phone: string | null
    avatar_url: string | null
    talent_profiles:
      | { department: string | null; primary_role: string | null }
      | { department: string | null; primary_role: string | null }[]
      | null
  }
  type BookingRow = {
    id: string
    status: string
    profiles: TalentJoin | TalentJoin[] | null
  }

  const team: TalentRow[] = []
  for (const b of (bookingsRes.data ?? []) as unknown as BookingRow[]) {
    const t = unwrap(b.profiles)
    if (!t) continue
    const name =
      [t.first_name, t.last_name].filter(Boolean).join(' ') ||
      t.full_name ||
      'Talent'
    const tp = unwrap(t.talent_profiles)
    const role = [tp?.department, tp?.primary_role].filter(Boolean).join(' · ') ||
      'Crew'
    team.push({
      id: t.id,
      name,
      role,
      email: t.email,
      phone: t.phone,
      avatarUrl: t.avatar_url,
    })
  }

  const productionNotesParts = [
    (job.description as string | null) ?? null,
    (job.client_notes as string | null) ?? null,
  ].filter((x): x is string => Boolean(x && x.trim()))

  return {
    jobId: job.id as string,
    jobTitle: (job.title as string) ?? 'Job',
    jobCode: (job.job_code as string | null) ?? null,
    clientName,
    clientEmail,
    shootDate: (job.start_date as string | null) ?? null,
    shootDateLong: fmtLongDate((job.start_date as string | null) ?? null),
    callTime12: fmt12h((job.call_time as string | null) ?? null),
    locationDisplay: addr.display,
    fullAddress: addr.full,
    mapsUrl: addr.mapsUrl,
    productionNotes:
      productionNotesParts.length > 0 ? productionNotesParts.join('\n\n') : null,
    team,
  }
}

/**
 * Render the branded HTML body for the call-sheet email.
 * Same body for client + talent recipients — only the subject + greeting differ
 * via the `recipientLabel` slot inserted by sendCallSheet().
 *
 * Internal-only because Next 14 'use server' files can only export async
 * functions. Move to a sibling file if external callers ever need it.
 */
function callSheetHtml(ctx: CallSheetContext): string {
  const NAVY = '#1E3A6B'
  const AMBER = '#F0A500'
  const CREAM = '#FBF5E4'
  const RULE = '#E5E7EB'
  const MUTED = '#7A90AA'

  const code = ctx.jobCode ? `<div style="font-family:ui-monospace,Menlo,monospace;font-size:11px;color:rgba(255,255,255,0.7);letter-spacing:0.06em;margin-top:4px">JOB ${escapeHtml(ctx.jobCode)}</div>` : ''
  const callTimeRow = ctx.callTime12
    ? `<tr><td style="padding:6px 0;width:120px;color:${MUTED};font-size:12px;text-transform:uppercase;letter-spacing:0.08em;font-weight:700">Call time</td>
        <td style="padding:6px 0;font-size:14px;font-weight:600;color:${NAVY}">${escapeHtml(ctx.callTime12)}</td></tr>`
    : ''
  const dateRow = ctx.shootDateLong
    ? `<tr><td style="padding:6px 0;color:${MUTED};font-size:12px;text-transform:uppercase;letter-spacing:0.08em;font-weight:700">Shoot date</td>
        <td style="padding:6px 0;font-size:14px;font-weight:600;color:${NAVY}">${escapeHtml(ctx.shootDateLong)}</td></tr>`
    : ''
  const clientRow = `<tr><td style="padding:6px 0;color:${MUTED};font-size:12px;text-transform:uppercase;letter-spacing:0.08em;font-weight:700">Client</td>
        <td style="padding:6px 0;font-size:14px;color:${NAVY}">${escapeHtml(ctx.clientName)}</td></tr>`

  const locationCell = (() => {
    if (!ctx.locationDisplay && !ctx.fullAddress) return ''
    const display = escapeHtml(ctx.locationDisplay ?? ctx.fullAddress ?? '')
    const addrLine =
      ctx.fullAddress && ctx.fullAddress !== ctx.locationDisplay
        ? `<div style="font-size:13px;color:${MUTED};margin-top:2px">${escapeHtml(ctx.fullAddress)}</div>`
        : ''
    const link = ctx.mapsUrl
      ? `<div style="margin-top:6px"><a href="${ctx.mapsUrl}" style="font-size:12px;color:${NAVY};text-decoration:underline;font-weight:600">Open in Apple Maps →</a></div>`
      : ''
    return `<tr><td style="padding:6px 0;color:${MUTED};font-size:12px;text-transform:uppercase;letter-spacing:0.08em;font-weight:700;vertical-align:top">Location</td>
        <td style="padding:6px 0;font-size:14px;color:${NAVY}"><div style="font-weight:600">${display}</div>${addrLine}${link}</td></tr>`
  })()

  const teamRows = ctx.team.length === 0
    ? `<tr><td style="padding:14px;font-size:13px;color:${MUTED};text-align:center" colspan="3">No confirmed talent yet.</td></tr>`
    : ctx.team
        .map((t) => {
          const avatar = t.avatarUrl
            ? `<img src="${escapeHtml(t.avatarUrl)}" alt="" width="44" height="44" style="border-radius:22px;object-fit:cover;display:block" />`
            : `<div style="width:44px;height:44px;border-radius:22px;background:${NAVY};color:#fff;font-weight:700;font-size:14px;display:flex;align-items:center;justify-content:center;line-height:44px;text-align:center">${escapeHtml(initials(t.name))}</div>`
          const emailLink = t.email
            ? `<a href="mailto:${escapeHtml(t.email)}" style="color:${NAVY};text-decoration:none">${escapeHtml(t.email)}</a>`
            : '<span style="color:#999">—</span>'
          const phoneLink = t.phone
            ? `<a href="tel:${escapeHtml(t.phone.replace(/[^+\d]/g, ''))}" style="color:${NAVY};text-decoration:none">${escapeHtml(t.phone)}</a>`
            : '<span style="color:#999">—</span>'
          return `
            <tr>
              <td style="padding:12px 0;border-top:1px solid ${RULE};vertical-align:middle;width:60px">${avatar}</td>
              <td style="padding:12px 0;border-top:1px solid ${RULE};vertical-align:middle">
                <div style="font-size:14px;font-weight:600;color:${NAVY}">${escapeHtml(t.name)}</div>
                <div style="font-size:12px;color:${MUTED};margin-top:2px">${escapeHtml(t.role)}</div>
              </td>
              <td style="padding:12px 0;border-top:1px solid ${RULE};vertical-align:middle;text-align:right;font-size:12px">
                <div>${emailLink}</div>
                <div style="margin-top:3px">${phoneLink}</div>
              </td>
            </tr>`
        })
        .join('')

  const notesBlock = ctx.productionNotes
    ? `<div style="margin-top:32px;padding:16px;background:${CREAM};border-left:4px solid ${AMBER};border-radius:4px">
        <div style="font-size:11px;font-weight:700;color:${NAVY};text-transform:uppercase;letter-spacing:0.1em;margin-bottom:8px">Production notes</div>
        <div style="font-size:13px;color:#333;line-height:1.6;white-space:pre-wrap">${escapeHtml(ctx.productionNotes)}</div>
      </div>`
    : ''

  const generated = new Date().toLocaleString('en-US', {
    timeZone: 'America/Los_Angeles',
    dateStyle: 'medium',
    timeStyle: 'short',
  })

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Call Sheet — ${escapeHtml(ctx.jobTitle)}</title></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;color:#1a1a1a">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f5f5f5">
    <tr><td align="center" style="padding:24px 12px">
      <table role="presentation" width="640" cellspacing="0" cellpadding="0" style="max-width:640px;background:#fff;border-radius:12px;overflow:hidden;border:1px solid ${RULE}">
        <!-- Navy header -->
        <tr><td style="background:${NAVY};padding:24px 28px;color:#fff">
          <div style="font-size:11px;font-weight:700;letter-spacing:0.18em;color:${AMBER};text-transform:uppercase">Rowly Studios · Call Sheet</div>
          <div style="font-size:22px;font-weight:700;margin-top:8px;line-height:1.2">${escapeHtml(ctx.jobTitle)}</div>
          ${code}
        </td></tr>

        <!-- Production info grid -->
        <tr><td style="padding:24px 28px">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
            ${clientRow}
            ${dateRow}
            ${callTimeRow}
            ${locationCell}
          </table>

          <!-- Team table -->
          <div style="margin-top:28px;padding-bottom:8px;border-bottom:2px solid ${NAVY}">
            <span style="font-size:11px;font-weight:700;color:${NAVY};text-transform:uppercase;letter-spacing:0.12em">Team</span>
          </div>
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
            ${teamRows}
          </table>

          ${notesBlock}
        </td></tr>

        <!-- Footer -->
        <tr><td style="padding:18px 28px;background:#fafafa;border-top:1px solid ${RULE};font-size:11px;color:${MUTED};text-align:center;line-height:1.6">
          Rowly Studios&trade; · Confidential · Generated ${escapeHtml(generated)} PT<br/>
          rowlystudios.com · Los Angeles, CA
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`
}

/**
 * Send the call sheet. Two modes:
 *   - 'client_only': emails the client billing_email only
 *   - 'everyone':    emails the client AND every confirmed talent
 *
 * On success, stamps jobs.call_sheet_sent_at = now() (best-effort if the
 * column doesn't exist yet) and revalidates the detail page. Returns
 * { success, sentTo[] } or { error }.
 */
export async function sendCallSheet(
  formData: FormData
): Promise<{ success?: true; sentTo?: string[]; error?: string }> {
  const { user } = await requireAdmin()
  if (!user) return { error: 'Not signed in' }

  const jobId = ((formData.get('jobId') as string) ?? '').trim()
  const modeRaw = ((formData.get('mode') as string) ?? '').trim()
  if (!jobId) return { error: 'Missing jobId' }
  if (modeRaw !== 'client_only' && modeRaw !== 'everyone') {
    return { error: 'Invalid mode' }
  }
  const mode = modeRaw as CallSheetMode

  const ctx = await loadCallSheetContext(jobId)
  if (!ctx) return { error: 'Job not found' }

  if (!ctx.clientEmail) {
    return { error: 'No billing email on file for this client.' }
  }
  if (mode === 'everyone' && ctx.team.length === 0) {
    return { error: 'No confirmed talent to send to.' }
  }

  const dateBit = ctx.shootDateLong ?? ctx.shootDate ?? ''
  const subjectClient = `Call Sheet — ${ctx.jobTitle}${dateBit ? ` · ${dateBit}` : ''}`
  const subjectTalent = `Your Call Sheet — ${ctx.jobTitle}${dateBit ? ` · ${dateBit}` : ''}`
  const html = callSheetHtml(ctx)

  const sentTo: string[] = []

  // Client send
  const clientResult = await sendTransactionalEmail({
    to: ctx.clientEmail,
    subject: subjectClient,
    html,
  })
  if (clientResult.error && clientResult.error !== 'not_configured') {
    return { error: `Client email failed: ${clientResult.error}` }
  }
  sentTo.push(ctx.clientEmail)

  // Talent send (everyone mode)
  if (mode === 'everyone') {
    for (const t of ctx.team) {
      if (!t.email) continue
      const r = await sendTransactionalEmail({
        to: t.email,
        subject: subjectTalent,
        html,
      })
      if (!r.error || r.error === 'not_configured') {
        sentTo.push(t.email)
      }
    }
  }

  // Stamp the job. Guarded — if call_sheet_sent_at column is missing
  // in this environment, the update no-ops instead of breaking the send.
  const svc = createServiceClient()
  try {
    await svc
      .from('jobs')
      .update({ call_sheet_sent_at: new Date().toISOString() })
      .eq('id', jobId)
  } catch {
    // non-fatal
  }

  revalidatePath(`/admin/jobs/${jobId}`)
  return { success: true, sentTo }
}

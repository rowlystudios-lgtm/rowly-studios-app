import { createServiceClient } from '@/lib/supabase-service'
import {
  sendTransactionalEmail,
  EmailTemplates,
  isEmailConfigured,
} from '@/lib/email'
import { sendSMS, SmsTemplates, isSmsConfigured } from '@/lib/sms'

export type NotificationChannel = 'in_app' | 'email' | 'sms'

export type NotificationPayload = {
  userId: string
  type: string
  title: string
  body: string
  actionUrl?: string | null
  bookingId?: string | null
  jobId?: string | null
  channels?: NotificationChannel[]
  /** If provided, replaces the generic wrap() body for email. */
  emailHtml?: string
  /** Overrides `body` for SMS (kept short). */
  smsBody?: string
}

const APP_URL =
  process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.rowlystudios.com'

function absolute(actionUrl: string | null | undefined): string | null {
  if (!actionUrl) return null
  if (actionUrl.startsWith('http')) return actionUrl
  return `${APP_URL}${actionUrl.startsWith('/') ? '' : '/'}${actionUrl}`
}

/**
 * Unified notification sender. Writes an in_app row, queues email + SMS
 * via notification_queue, and best-effort dispatches through Resend /
 * Twilio. Every external send is wrapped in try/catch so the primary
 * server action never blocks on an outbound failure.
 */
export async function sendNotification(payload: NotificationPayload) {
  const supabase = createServiceClient()
  const channels = payload.channels ?? ['in_app', 'email']

  // ─── Load recipient profile for email/phone + personalisation ───
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, email, phone, first_name, full_name')
    .eq('id', payload.userId)
    .maybeSingle()

  const actionAbs = absolute(payload.actionUrl ?? null)

  // ─── In-app row ───
  if (channels.includes('in_app')) {
    try {
      await supabase.from('notifications').insert({
        user_id: payload.userId,
        type: payload.type,
        title: payload.title,
        body: payload.body,
        action_url: payload.actionUrl ?? null,
        channel: 'in_app',
        clearable: true,
      })
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[notify] in_app insert failed', err)
    }
  }

  // ─── Email ───
  if (channels.includes('email') && profile?.email) {
    const subject = payload.title
    const html =
      payload.emailHtml ??
      defaultEmailHtml(payload.title, payload.body, actionAbs)
    // Log the queue row up-front so we have a record even if the send hangs.
    let queueId: string | null = null
    try {
      const { data } = await supabase
        .from('notification_queue')
        .insert({
          user_id: payload.userId,
          channel: 'email',
          to_address: profile.email,
          subject,
          body: html,
          action_url: payload.actionUrl ?? null,
          status: isEmailConfigured() ? 'pending' : 'skipped',
          booking_id: payload.bookingId ?? null,
          job_id: payload.jobId ?? null,
          attempts: 0,
        })
        .select('id')
        .single()
      queueId = data?.id ?? null
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[notify] email queue insert failed', err)
    }
    if (isEmailConfigured()) {
      const result = await sendTransactionalEmail({
        to: profile.email,
        subject,
        html,
      })
      try {
        if (queueId) {
          await supabase
            .from('notification_queue')
            .update({
              status: result.error ? 'failed' : 'sent',
              sent_at: result.error ? null : new Date().toISOString(),
              failed_reason: result.error ?? null,
              attempts: 1,
            })
            .eq('id', queueId)
        }
      } catch {
        // ignore
      }
    }
  }

  // ─── SMS ───
  if (channels.includes('sms') && profile?.phone) {
    const smsBody = payload.smsBody ?? payload.body
    let queueId: string | null = null
    try {
      const { data } = await supabase
        .from('notification_queue')
        .insert({
          user_id: payload.userId,
          channel: 'sms',
          to_address: profile.phone,
          subject: payload.title,
          body: smsBody,
          action_url: payload.actionUrl ?? null,
          status: isSmsConfigured() ? 'pending' : 'skipped',
          booking_id: payload.bookingId ?? null,
          job_id: payload.jobId ?? null,
          attempts: 0,
        })
        .select('id')
        .single()
      queueId = data?.id ?? null
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[notify] sms queue insert failed', err)
    }
    if (isSmsConfigured()) {
      const result = await sendSMS({ to: profile.phone, body: smsBody })
      try {
        if (queueId) {
          await supabase
            .from('notification_queue')
            .update({
              status: result.error ? 'failed' : 'sent',
              sent_at: result.error ? null : new Date().toISOString(),
              failed_reason: result.error ?? null,
              attempts: 1,
            })
            .eq('id', queueId)
        }
      } catch {
        // ignore
      }
    }
  }
}

function defaultEmailHtml(
  title: string,
  body: string,
  actionUrl: string | null
): string {
  const btn = actionUrl
    ? `<div style="text-align:center;margin:24px 0">
         <a href="${actionUrl}" style="display:inline-block;padding:12px 22px;border-radius:10px;background:#1E3A6B;color:#fff;font-weight:600;text-decoration:none">
           Open Rowly Studios
         </a>
       </div>`
    : ''
  return `<!DOCTYPE html><html><body style="margin:0;background:#F5F6F8;font-family:-apple-system,BlinkMacSystemFont,sans-serif;color:#1a1a1a">
    <div style="max-width:560px;margin:0 auto;padding:24px 16px">
      <div style="background:#0F1B2E;color:#fff;padding:24px 28px;border-radius:14px 14px 0 0">
        <p style="margin:0;font-family:Georgia,serif;font-style:italic;font-size:22px">Rowly Studios</p>
      </div>
      <div style="background:#fff;padding:28px;border-radius:0 0 14px 14px">
        <h1 style="margin:0 0 14px;font-size:20px;color:#0F1B2E">${title}</h1>
        <p style="font-size:14px;line-height:1.6;color:#374151">${body}</p>
        ${btn}
      </div>
    </div>
  </body></html>`
}

/* ─────────── Higher-level event helpers ─────────── */

import { fmtUsd, clientRateCents } from '@/lib/rates'

function fmtDateShort(iso: string | null): string {
  if (!iso) return 'TBD'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return 'TBD'
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function fmtDateRange(start: string | null, end: string | null): string {
  if (!start) return 'TBD'
  if (!end || end === start) return fmtDateShort(start)
  return `${fmtDateShort(start)} – ${fmtDateShort(end)}`
}

function fmtDateTime(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'America/Los_Angeles',
  })
}

/**
 * Format a single HH:MM (24h) call time as 12-hour US format, e.g. "8:00 AM".
 * Returns empty string if input is null/invalid.
 */
function fmtTime12(hhmm: string | null | undefined): string {
  if (!hhmm) return ''
  const [hStr, mStr] = hhmm.split(':')
  const h = Number(hStr)
  const m = Number(mStr ?? '0')
  if (!Number.isFinite(h) || !Number.isFinite(m)) return ''
  const period = h >= 12 ? 'PM' : 'AM'
  const h12 = ((h + 11) % 12) + 1
  return `${h12}:${String(m).padStart(2, '0')} ${period}`
}

function fmtWeekdayDate(iso: string | null): string {
  if (!iso) return ''
  const [y, m, d] = iso.split('-').map(Number)
  const dt = new Date(y, (m ?? 1) - 1, d ?? 1)
  if (Number.isNaN(dt.getTime())) return ''
  return dt.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })
}

/**
 * Email-ready human date label.
 *
 *   Single-day w/ call_time, 10h default   → "Wed Apr 30, 8:00 AM – 6:00 PM"
 *   Multi-day  w/ call_time                → "Wed Apr 30, 8:00 AM – Thu May 1, 6:00 PM"
 *   Single-day w/o call_time               → "Wed Apr 30"
 *   Multi-day  w/o call_time               → "Wed Apr 30 – Thu May 1"
 *
 * Shoot duration is read from shoot_duration_hours, with is_half_day
 * collapsing to 4h. Defaults to 10h if neither is set.
 */
export function formatJobDateLabel(job: {
  start_date: string | null
  end_date: string | null
  call_time: string | null
  shoot_duration_hours?: number | null
  is_half_day?: boolean | null
}): string {
  const start = job.start_date
  if (!start) return ''
  const end = job.end_date && job.end_date !== start ? job.end_date : null
  const startLabel = fmtWeekdayDate(start)
  const endLabel = end ? fmtWeekdayDate(end) : ''

  if (!job.call_time) {
    return end ? `${startLabel} – ${endLabel}` : startLabel
  }

  const [hStr, mStr] = job.call_time.split(':')
  const startHour = Number(hStr)
  const startMin = Number(mStr ?? '0')
  const duration = job.is_half_day ? 4 : job.shoot_duration_hours ?? 10
  const totalMinutes = startHour * 60 + startMin + duration * 60
  const endHour = Math.min(23, Math.floor(totalMinutes / 60))
  const endMinute = totalMinutes % 60
  const startTimeLabel = fmtTime12(job.call_time)
  const endTimeLabel = fmtTime12(
    `${String(endHour).padStart(2, '0')}:${String(endMinute).padStart(2, '0')}`
  )

  if (end) {
    return `${startLabel}, ${startTimeLabel} – ${endLabel}, ${endTimeLabel}`
  }
  return `${startLabel}, ${startTimeLabel} – ${endTimeLabel}`
}

type BookingContext = {
  bookingId: string
  talentUserId: string
  talentName: string
  talentFirstName: string
  talentEmail: string | null
  clientUserId: string | null
  clientName: string
  clientFirstName: string
  clientEmail: string | null
  jobId: string
  jobTitle: string
  jobCode: string | null
  jobStart: string | null
  jobEnd: string | null
  jobLocation: string | null
  jobCallTime: string | null
  jobShootDurationHours: number | null
  jobIsHalfDay: boolean | null
  offeredRateCents: number | null
  confirmedRateCents: number | null
  isShortShoot: boolean
  durationHours: number | null
  createdAt: string | null
  responseDeadlineAt: string | null
  talentReviewedAt: string | null
}

/**
 * Shape the rate label consistently across all emails. Short shoots bill
 * as a flat fee, so don't suffix "/day".
 *
 * STRICT RATE RULE: cents stored on bookings is the talent net.
 *   forTalent=true  → display the talent net (their take-home).
 *   forTalent=false → display the client-facing rate (talentNet × 1.15).
 * Defaults to false because most surfaces (client emails, admin digests
 * paired with explicit dual labels) expect client-facing.
 */
function rateLabel(
  cents: number | null | undefined,
  isShort: boolean,
  forTalent = false
): string {
  if (!cents && cents !== 0) return 'Rate TBD'
  const display = forTalent ? cents : clientRateCents(cents)
  const usd = fmtUsd(display)
  return isShort ? `Flat fee: ${usd}` : `${usd}/day`
}

/**
 * Named helpers for client / talent rate labels — wrap rateLabel to make
 * intent obvious at the call site. Equivalent to rateLabel(cents, false)
 * and rateLabel(cents, false, true) respectively. New code should prefer
 * these over the boolean-flag form.
 */
export function rateLabelForClient(talentNetCents: number | null): string {
  if (!talentNetCents) return 'TBD'
  return `$${(clientRateCents(talentNetCents) / 100).toLocaleString('en-US', { maximumFractionDigits: 0 })}/day`
}

export function rateLabelForTalent(talentNetCents: number | null): string {
  if (!talentNetCents) return 'TBD'
  return `$${(talentNetCents / 100).toLocaleString('en-US', { maximumFractionDigits: 0 })}/day`
}

function durationLabel(ctx: BookingContext): string {
  if (ctx.isShortShoot) {
    return ctx.durationHours
      ? `Short shoot (${ctx.durationHours} hours)`
      : 'Short shoot'
  }
  return 'Full day'
}

async function loadBookingContext(
  bookingId: string
): Promise<BookingContext | null> {
  const supabase = createServiceClient()
  const { data } = await supabase
    .from('job_bookings')
    .select(
      `id, offered_rate_cents, confirmed_rate_cents, talent_id,
       is_short_shoot, shoot_duration_hours,
       created_at, response_deadline_at, talent_reviewed_at,
       profiles!job_bookings_talent_id_fkey (full_name, first_name, last_name, email),
       jobs (id, title, job_code, start_date, end_date, location, call_time,
         shoot_duration_hours, is_half_day, client_id,
         profiles!jobs_client_id_fkey (full_name, first_name, email,
           client_profiles (company_name, billing_email)))`
    )
    .eq('id', bookingId)
    .maybeSingle()
  if (!data) return null

  type ClientProfiles = {
    company_name: string | null
    billing_email: string | null
  }
  type ClientProfile = {
    full_name: string | null
    first_name: string | null
    email: string | null
    client_profiles: ClientProfiles | ClientProfiles[] | null
  }
  type Job = {
    id: string
    title: string
    job_code: string | null
    start_date: string | null
    end_date: string | null
    location: string | null
    call_time: string | null
    shoot_duration_hours: number | null
    is_half_day: boolean | null
    client_id: string | null
    profiles: ClientProfile | ClientProfile[] | null
  }
  type Talent = {
    full_name: string | null
    first_name: string | null
    last_name: string | null
    email: string | null
  }
  type Row = {
    id: string
    offered_rate_cents: number | null
    confirmed_rate_cents: number | null
    talent_id: string | null
    is_short_shoot: boolean | null
    shoot_duration_hours: number | null
    created_at: string | null
    response_deadline_at: string | null
    talent_reviewed_at: string | null
    profiles: Talent | Talent[] | null
    jobs: Job | Job[] | null
  }

  const row = data as unknown as Row
  const talent = Array.isArray(row.profiles) ? row.profiles[0] ?? null : row.profiles
  const job = Array.isArray(row.jobs) ? row.jobs[0] ?? null : row.jobs
  if (!job) return null
  const clientProfile = Array.isArray(job.profiles)
    ? job.profiles[0] ?? null
    : job.profiles
  const cp = clientProfile
    ? Array.isArray(clientProfile.client_profiles)
      ? clientProfile.client_profiles[0] ?? null
      : clientProfile.client_profiles
    : null

  // Short-shoot flag: either the booking itself is flagged, or the parent
  // job has a duration under 4 hours. Duration is read from the booking
  // first, falling back to the job.
  const jobDuration = job.shoot_duration_hours ?? null
  const bookingDuration = row.shoot_duration_hours ?? jobDuration
  const isShortShoot =
    row.is_short_shoot === true ||
    (bookingDuration != null && bookingDuration < 4)

  return {
    bookingId: row.id,
    talentUserId: row.talent_id ?? '',
    talentName:
      [talent?.first_name, talent?.last_name].filter(Boolean).join(' ') ||
      talent?.full_name ||
      'Talent',
    talentFirstName:
      talent?.first_name ||
      (talent?.full_name ? talent.full_name.split(/\s+/)[0] : '') ||
      '',
    talentEmail: talent?.email ?? null,
    clientUserId: job.client_id ?? null,
    clientName: cp?.company_name || clientProfile?.full_name || 'Client',
    clientFirstName:
      clientProfile?.first_name ||
      (clientProfile?.full_name
        ? clientProfile.full_name.split(/\s+/)[0]
        : '') ||
      '',
    clientEmail: cp?.billing_email || clientProfile?.email || null,
    jobId: job.id,
    jobTitle: job.title,
    jobCode: job.job_code,
    jobStart: job.start_date,
    jobEnd: job.end_date,
    jobLocation: job.location,
    jobCallTime: job.call_time,
    jobShootDurationHours: job.shoot_duration_hours,
    jobIsHalfDay: job.is_half_day,
    offeredRateCents: row.offered_rate_cents,
    confirmedRateCents: row.confirmed_rate_cents,
    isShortShoot,
    durationHours: bookingDuration,
    createdAt: row.created_at,
    responseDeadlineAt: row.response_deadline_at,
    talentReviewedAt: row.talent_reviewed_at,
  }
}

function jobDateLabelFromCtx(ctx: BookingContext): string {
  return formatJobDateLabel({
    start_date: ctx.jobStart,
    end_date: ctx.jobEnd,
    call_time: ctx.jobCallTime,
    shoot_duration_hours: ctx.jobShootDurationHours,
    is_half_day: ctx.jobIsHalfDay,
  })
}

function icsUrlFor(bookingId: string): string {
  return `${APP_URL}/api/ics/${bookingId}`
}

/**
 * Fan out the admin-status digest to every admin role in the profiles
 * table. Safe to call in fire-and-forget — errors are swallowed.
 */
async function notifyAdminStatus(
  ctx: BookingContext,
  statusLabel: string
): Promise<void> {
  try {
    const supabase = createServiceClient()
    const { data: admins } = await supabase
      .from('profiles')
      .select('id')
      .eq('role', 'admin')

    const dateLabel = fmtDateRange(ctx.jobStart, ctx.jobEnd)
    // Admin digests show BOTH talent net and client-facing rate so ops
    // can see margins at a glance.
    const dualLabel = (cents: number | null | undefined) =>
      cents == null
        ? 'Pending'
        : `Talent: ${fmtUsd(cents)}/day · Client: ${fmtUsd(clientRateCents(cents))}/day`
    const offered = dualLabel(ctx.offeredRateCents)
    const confirmed = ctx.confirmedRateCents
      ? dualLabel(ctx.confirmedRateCents)
      : 'Pending'
    const actionUrl = `${APP_URL}/admin/jobs/${ctx.jobId}`
    const html = EmailTemplates.adminStatus({
      firstName: '',
      statusLabel,
      jobTitle: ctx.jobTitle,
      jobCode: ctx.jobCode,
      jobDateLabel: dateLabel,
      jobLocation: ctx.jobLocation,
      talentName: ctx.talentName,
      talentEmail: ctx.talentEmail,
      clientName: ctx.clientName,
      clientEmail: ctx.clientEmail,
      offeredLabel: offered,
      confirmedLabel: confirmed,
      durationLabel: durationLabel(ctx),
      offerSentLabel: fmtDateTime(ctx.createdAt) || null,
      deadlineLabel: fmtDateTime(ctx.responseDeadlineAt) || null,
      respondedLabel: fmtDateTime(ctx.talentReviewedAt) || null,
      actionUrl,
    })
    const subject = `${statusLabel.toUpperCase()}: ${ctx.talentName} → ${
      ctx.jobCode ?? ctx.jobTitle
    }`

    for (const a of (admins ?? []) as Array<{ id: string }>) {
      await sendNotification({
        userId: a.id,
        type: 'admin_status',
        title: subject,
        body: `${statusLabel} — ${ctx.talentName} / ${ctx.jobTitle}`,
        actionUrl: `/admin/jobs/${ctx.jobId}`,
        bookingId: ctx.bookingId,
        jobId: ctx.jobId,
        channels: ['in_app', 'email'],
        emailHtml: html,
      })
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[notify] admin status failed', err)
  }
}

export async function notifyJobOffer(bookingId: string) {
  try {
    const ctx = await loadBookingContext(bookingId)
    if (!ctx || !ctx.talentUserId) return
    const dateLabel = jobDateLabelFromCtx(ctx)
    const shortDateLabel = fmtDateRange(ctx.jobStart, ctx.jobEnd)
    const ics = icsUrlFor(bookingId)
    // Talent sees their net rate; client sees the +15% client-facing rate.
    const talentRate = rateLabel(ctx.offeredRateCents, ctx.isShortShoot, true)
    const clientRate = rateLabel(ctx.offeredRateCents, ctx.isShortShoot)

    // Email 1: talent
    const talentHtml = EmailTemplates.jobOffer({
      firstName: ctx.talentFirstName,
      jobTitle: ctx.jobTitle,
      dateLabel,
      location: ctx.jobLocation ?? '',
      rateLabel: talentRate,
      actionUrl: `${APP_URL}/app`,
      icsUrl: ics,
    })
    await sendNotification({
      userId: ctx.talentUserId,
      type: 'job_offer',
      title: `New job offer: ${ctx.jobTitle}`,
      body: `You have been offered ${ctx.jobTitle} on ${shortDateLabel} at ${talentRate}. Tap to respond.`,
      actionUrl: '/app',
      bookingId,
      jobId: ctx.jobId,
      channels: ['in_app', 'email', 'sms'],
      emailHtml: talentHtml,
      smsBody: SmsTemplates.jobOffer(
        ctx.jobTitle,
        fmtDateShort(ctx.jobStart),
        fmtUsd(ctx.offeredRateCents)
      ),
    })

    // Email 2: client — receipt that we've sent their request
    if (ctx.clientUserId) {
      const clientHtml = EmailTemplates.clientBookingSent({
        firstName: ctx.clientFirstName,
        talentName: ctx.talentName,
        jobTitle: ctx.jobTitle,
        dateLabel,
        location: ctx.jobLocation,
        rateLabel: clientRate,
        actionUrl: `${APP_URL}/app`,
      })
      await sendNotification({
        userId: ctx.clientUserId,
        type: 'booking_sent',
        title: `Booking request sent: ${ctx.jobTitle}`,
        body: `We've sent your booking request to ${ctx.talentName}. You'll be notified when they respond.`,
        actionUrl: '/app',
        bookingId,
        jobId: ctx.jobId,
        channels: ['in_app', 'email'],
        emailHtml: clientHtml,
      })
    }

    // Email 3: admin status digest
    await notifyAdminStatus(ctx, 'New offer')
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[notify] jobOffer failed', err)
  }
}

export async function notifyConfirmation(bookingId: string) {
  try {
    const ctx = await loadBookingContext(bookingId)
    if (!ctx) return
    const dateLabel = jobDateLabelFromCtx(ctx)
    const shortDateLabel = fmtDateRange(ctx.jobStart, ctx.jobEnd)
    const ics = icsUrlFor(bookingId)
    const confirmed = ctx.confirmedRateCents ?? ctx.offeredRateCents
    // Talent gets their net; client sees the +15% client-facing rate.
    const talentRate = rateLabel(confirmed, ctx.isShortShoot, true)
    const clientRate = rateLabel(confirmed, ctx.isShortShoot)

    // Email 1: talent
    if (ctx.talentUserId) {
      const talentHtml = EmailTemplates.talentConfirmation({
        firstName: ctx.talentFirstName,
        jobTitle: ctx.jobTitle,
        dateLabel,
        rateLabel: talentRate,
        location: ctx.jobLocation,
        callTime: ctx.jobCallTime,
        actionUrl: `${APP_URL}/app`,
        icsUrl: ics,
      })
      await sendNotification({
        userId: ctx.talentUserId,
        type: 'booking_confirmed',
        title: `Confirmed: ${ctx.jobTitle} — ${shortDateLabel}`,
        body: `You're confirmed for ${ctx.jobTitle} on ${shortDateLabel} at ${talentRate}.`,
        actionUrl: '/app',
        bookingId,
        jobId: ctx.jobId,
        channels: ['in_app', 'email'],
        emailHtml: talentHtml,
      })
    }

    // Email 2: client
    if (ctx.clientUserId) {
      const clientHtml = EmailTemplates.talentConfirmed({
        firstName: ctx.clientFirstName,
        talentName: ctx.talentName,
        jobTitle: ctx.jobTitle,
        dateLabel,
        location: ctx.jobLocation,
        rateLabel: clientRate,
        actionUrl: `${APP_URL}/app`,
        icsUrl: ics,
      })
      await sendNotification({
        userId: ctx.clientUserId,
        type: 'booking_confirmed',
        title: `${ctx.talentName} is confirmed for ${ctx.jobTitle}`,
        body: `${ctx.talentName} has confirmed for ${ctx.jobTitle} on ${shortDateLabel} at ${clientRate}.`,
        actionUrl: '/app',
        bookingId,
        jobId: ctx.jobId,
        channels: ['in_app', 'email'],
        emailHtml: clientHtml,
      })
    }

    // Email 3: admin status digest
    await notifyAdminStatus(ctx, 'Confirmed')
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[notify] confirmation failed', err)
  }
}

export async function notifyDecline(bookingId: string, reason: string | null) {
  try {
    const ctx = await loadBookingContext(bookingId)
    if (!ctx) return
    const supabase = createServiceClient()
    const dateLabel = jobDateLabelFromCtx(ctx)

    // Email to client — a soft "someone else will be found" note
    if (ctx.clientUserId) {
      const clientHtml = EmailTemplates.clientDecline({
        firstName: ctx.clientFirstName,
        talentName: ctx.talentName,
        jobTitle: ctx.jobTitle,
        dateLabel,
        location: ctx.jobLocation,
        actionUrl: `${APP_URL}/app`,
      })
      await sendNotification({
        userId: ctx.clientUserId,
        type: 'booking_declined',
        title: `Update on ${ctx.jobTitle}`,
        body: `${ctx.talentName} couldn't take this one — we're finding a replacement.`,
        actionUrl: '/app',
        bookingId,
        jobId: ctx.jobId,
        channels: ['in_app', 'email'],
        emailHtml: clientHtml,
      })
    }

    // Admin receipt — keep the per-admin in-app notification with reason
    const adminUrl = `${APP_URL}/admin/jobs/${ctx.jobId}`
    const adminHtml = EmailTemplates.adminDecline({
      firstName: '',
      talentName: ctx.talentName,
      jobTitle: ctx.jobTitle,
      dateLabel,
      location: ctx.jobLocation,
      reason,
      actionUrl: adminUrl,
    })
    const { data: admins } = await supabase
      .from('profiles')
      .select('id')
      .eq('role', 'admin')
    for (const a of (admins ?? []) as Array<{ id: string }>) {
      await sendNotification({
        userId: a.id,
        type: 'booking_declined',
        title: `${ctx.talentName} declined ${ctx.jobTitle}`,
        body: `${ctx.talentName} has declined. Reason: ${reason || 'Not provided'}`,
        actionUrl: `/admin/jobs/${ctx.jobId}`,
        bookingId,
        jobId: ctx.jobId,
        channels: ['in_app', 'email'],
        emailHtml: adminHtml,
      })
    }

    // Plus the structured admin-status digest
    await notifyAdminStatus(ctx, 'Declined')
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[notify] decline failed', err)
  }
}

export async function notifyNudge(bookingId: string) {
  try {
    const ctx = await loadBookingContext(bookingId)
    if (!ctx || !ctx.talentUserId) return
    const dateLabel = jobDateLabelFromCtx(ctx)
    const shortDateLabel = fmtDateRange(ctx.jobStart, ctx.jobEnd)
    // Nudge goes to the talent — show their net rate.
    const rate = rateLabel(ctx.offeredRateCents, ctx.isShortShoot, true)
    const html = EmailTemplates.nudge({
      firstName: ctx.talentFirstName,
      jobTitle: ctx.jobTitle,
      rateLabel: rate,
      dateLabel,
      location: ctx.jobLocation,
      actionUrl: `${APP_URL}/app`,
    })
    await sendNotification({
      userId: ctx.talentUserId,
      type: 'nudge',
      title: 'Reminder: Pending job offer',
      body: `Your response is needed for ${ctx.jobTitle} (${shortDateLabel}).`,
      actionUrl: '/app',
      bookingId,
      jobId: ctx.jobId,
      channels: ['in_app', 'email', 'sms'],
      emailHtml: html,
      smsBody: SmsTemplates.nudge(ctx.jobTitle),
    })
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[notify] nudge failed', err)
  }
}

export async function notifyCounterOffer(bookingId: string, notes: string | null) {
  try {
    const ctx = await loadBookingContext(bookingId)
    if (!ctx) return
    const actionUrl = `${APP_URL}/admin/jobs/${ctx.jobId}`
    // Counter-offer goes to admins — show both talent net (the stored
    // offered_rate_cents) and what the client would have been billed.
    const counterLabel = ctx.offeredRateCents
      ? `Talent: ${fmtUsd(ctx.offeredRateCents)}/day · Client: ${fmtUsd(clientRateCents(ctx.offeredRateCents))}/day (was offered)`
      : 'see notes'
    const html = EmailTemplates.counterOffer({
      firstName: '',
      talentName: ctx.talentName,
      jobTitle: ctx.jobTitle,
      dateLabel: jobDateLabelFromCtx(ctx),
      location: ctx.jobLocation,
      counterLabel,
      notes,
      actionUrl,
    })
    const supabase = createServiceClient()
    const { data: admins } = await supabase
      .from('profiles')
      .select('id')
      .eq('role', 'admin')
    for (const a of (admins ?? []) as Array<{ id: string }>) {
      await sendNotification({
        userId: a.id,
        type: 'counter_offer',
        title: `${ctx.talentName} has counter-offered on ${ctx.jobTitle}`,
        body: notes || 'Review the counter-offer in your admin.',
        actionUrl: `/admin/jobs/${ctx.jobId}`,
        bookingId,
        jobId: ctx.jobId,
        channels: ['in_app', 'email'],
        emailHtml: html,
      })
    }

    // Admin digest entry too
    await notifyAdminStatus(ctx, 'Counter-offer')
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[notify] counter failed', err)
  }
}

export async function notifyFullyCrewed(jobId: string) {
  try {
    const supabase = createServiceClient()
    const { data: job } = await supabase
      .from('jobs')
      .select(
        `id, title, job_code, start_date, end_date, location, call_time,
         shoot_duration_hours, is_half_day, client_id, num_talent,
         profiles!jobs_client_id_fkey (full_name, first_name, email,
           client_profiles (company_name, billing_email))`
      )
      .eq('id', jobId)
      .maybeSingle()
    if (!job) return

    const { data: confirmed } = await supabase
      .from('job_bookings')
      .select(
        `id, confirmed_rate_cents, is_short_shoot,
         profiles!job_bookings_talent_id_fkey (full_name, first_name, last_name,
          talent_profiles (primary_role))`
      )
      .eq('job_id', jobId)
      .eq('status', 'confirmed')

    type TalentJoin = {
      full_name: string | null
      first_name: string | null
      last_name: string | null
      talent_profiles:
        | { primary_role: string | null }
        | { primary_role: string | null }[]
        | null
    }
    type ConfirmedRow = {
      id: string
      confirmed_rate_cents: number | null
      is_short_shoot: boolean | null
      profiles: TalentJoin | TalentJoin[] | null
    }
    const confirmedRows = (confirmed ?? []) as ConfirmedRow[]
    const buildList = (forAdmin: boolean) =>
      confirmedRows
        .map((b) => {
          const p = Array.isArray(b.profiles)
            ? b.profiles[0] ?? null
            : b.profiles
          if (!p) return null
          const tp = p.talent_profiles
            ? Array.isArray(p.talent_profiles)
              ? p.talent_profiles[0] ?? null
              : p.talent_profiles
            : null
          const name =
            [p.first_name, p.last_name].filter(Boolean).join(' ') ||
            p.full_name ||
            'Talent'
          const role = tp?.primary_role ? ` — ${tp.primary_role}` : ''
          if (forAdmin && b.confirmed_rate_cents != null) {
            // Admin sees both rates so they can eyeball margin.
            const isShort = b.is_short_shoot === true
            const suffix = isShort ? '' : '/day'
            const dual = `Talent: ${fmtUsd(b.confirmed_rate_cents)}${suffix} · Client: ${fmtUsd(clientRateCents(b.confirmed_rate_cents))}${suffix}`
            return `${name}${role} — ${dual}`
          }
          // Client list: client-facing rate only (default forTalent=false).
          const rate = rateLabel(
            b.confirmed_rate_cents,
            b.is_short_shoot === true
          )
          return `${name}${role} — ${rate}`
        })
        .filter((x): x is string => Boolean(x))
    const talentList = buildList(false)
    const adminTalentList = buildList(true)

    type ClientJoin = {
      full_name: string | null
      first_name: string | null
      email: string | null
    }
    const jobRow = job as {
      id: string
      title: string
      job_code: string | null
      start_date: string | null
      end_date: string | null
      location: string | null
      call_time: string | null
      shoot_duration_hours: number | null
      is_half_day: boolean | null
      client_id: string | null
      profiles: ClientJoin | ClientJoin[] | null
    }
    const clientProfile = Array.isArray(jobRow.profiles)
      ? jobRow.profiles[0] ?? null
      : jobRow.profiles
    const clientFirstName =
      clientProfile?.first_name ||
      (clientProfile?.full_name
        ? clientProfile.full_name.split(/\s+/)[0]
        : '') ||
      ''
    const shortDateLabel = fmtDateRange(jobRow.start_date, jobRow.end_date)
    const dateLabel = formatJobDateLabel({
      start_date: jobRow.start_date,
      end_date: jobRow.end_date,
      call_time: jobRow.call_time,
      shoot_duration_hours: jobRow.shoot_duration_hours,
      is_half_day: jobRow.is_half_day,
    })
    // ICS endpoint is booking-keyed, so pick any confirmed booking's id —
    // all of them reference the same underlying job dates.
    const repBookingId = confirmedRows[0]?.id ?? null
    const ics = repBookingId ? icsUrlFor(repBookingId) : null
    const clientActionUrl = `${APP_URL}/app`
    const clientHtml = EmailTemplates.fullyCrewed({
      firstName: clientFirstName,
      jobTitle: jobRow.title,
      dateLabel,
      location: jobRow.location,
      talentList,
      actionUrl: clientActionUrl,
      icsUrl: ics,
      // TODO(chat-v2): once src/app/app/jobs/[id]/page.tsx exists, switch
      // this to `/app/jobs/${jobId}#chat` so the client lands directly in
      // the chat panel.
      chatUrl: `${APP_URL}/app/jobs#job-${jobId}`,
    })

    if (jobRow.client_id) {
      await sendNotification({
        userId: jobRow.client_id,
        type: 'job_fully_crewed',
        title: `${jobRow.title} is fully crewed!`,
        body: `All talent confirmed for ${jobRow.title} on ${shortDateLabel}.`,
        actionUrl: '/app',
        jobId,
        channels: ['in_app', 'email', 'sms'],
        emailHtml: clientHtml,
        smsBody: SmsTemplates.fullyCrewed(jobRow.title),
      })
    }

    // Admin digest: full crew summary with the talent list baked in.
    const { data: admins } = await supabase
      .from('profiles')
      .select('id')
      .eq('role', 'admin')
    const adminActionUrl = `${APP_URL}/admin/jobs/${jobId}`
    const adminHtml = EmailTemplates.fullyCrewed({
      firstName: '',
      jobTitle: jobRow.title,
      dateLabel: `${dateLabel} · ${jobRow.job_code ?? ''}`.trim(),
      location: jobRow.location,
      talentList: adminTalentList,
      actionUrl: adminActionUrl,
      icsUrl: ics,
      chatUrl: `${APP_URL}/admin/jobs/${jobId}#chat`,
    })
    const adminSubject = `✓ Fully crewed: ${jobRow.job_code ?? jobRow.title}`
    for (const a of (admins ?? []) as Array<{ id: string }>) {
      await sendNotification({
        userId: a.id,
        type: 'job_fully_crewed',
        title: adminSubject,
        body: `All ${talentList.length} talent confirmed for ${jobRow.title}.`,
        actionUrl: `/admin/jobs/${jobId}`,
        jobId,
        channels: ['in_app', 'email'],
        emailHtml: adminHtml,
      })
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[notify] fully crewed failed', err)
  }
}

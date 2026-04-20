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
  process.env.NEXT_PUBLIC_APP_URL ?? 'https://rowly-studios-app.vercel.app'

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

function fmtUsd(cents: number | null | undefined): string {
  if (!cents && cents !== 0) return '$0'
  return `$${(cents / 100).toLocaleString('en-US', { maximumFractionDigits: 0 })}`
}

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

type BookingContext = {
  bookingId: string
  talentUserId: string
  talentName: string
  clientUserId: string | null
  clientName: string
  jobId: string
  jobTitle: string
  jobStart: string | null
  jobEnd: string | null
  jobLocation: string | null
  offeredRateCents: number | null
  confirmedRateCents: number | null
}

async function loadBookingContext(
  bookingId: string
): Promise<BookingContext | null> {
  const supabase = createServiceClient()
  const { data } = await supabase
    .from('job_bookings')
    .select(
      `id, offered_rate_cents, confirmed_rate_cents, talent_id,
       profiles!job_bookings_talent_id_fkey (full_name, first_name, last_name),
       jobs (id, title, start_date, end_date, location, client_id,
         profiles!jobs_client_id_fkey (full_name,
           client_profiles (company_name)))`
    )
    .eq('id', bookingId)
    .maybeSingle()
  if (!data) return null

  type Row = {
    id: string
    offered_rate_cents: number | null
    confirmed_rate_cents: number | null
    talent_id: string | null
    profiles:
      | { full_name: string | null; first_name: string | null; last_name: string | null }
      | { full_name: string | null; first_name: string | null; last_name: string | null }[]
      | null
    jobs:
      | {
          id: string
          title: string
          start_date: string | null
          end_date: string | null
          location: string | null
          client_id: string | null
          profiles:
            | {
                full_name: string | null
                client_profiles:
                  | { company_name: string | null }
                  | { company_name: string | null }[]
                  | null
              }
            | {
                full_name: string | null
                client_profiles:
                  | { company_name: string | null }
                  | { company_name: string | null }[]
                  | null
              }[]
            | null
        }
      | {
          id: string
          title: string
          start_date: string | null
          end_date: string | null
          location: string | null
          client_id: string | null
          profiles:
            | {
                full_name: string | null
                client_profiles:
                  | { company_name: string | null }
                  | { company_name: string | null }[]
                  | null
              }
            | {
                full_name: string | null
                client_profiles:
                  | { company_name: string | null }
                  | { company_name: string | null }[]
                  | null
              }[]
            | null
        }[]
      | null
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

  return {
    bookingId: row.id,
    talentUserId: row.talent_id ?? '',
    talentName:
      [talent?.first_name, talent?.last_name].filter(Boolean).join(' ') ||
      talent?.full_name ||
      'Talent',
    clientUserId: job.client_id ?? null,
    clientName: cp?.company_name || clientProfile?.full_name || 'Client',
    jobId: job.id,
    jobTitle: job.title,
    jobStart: job.start_date,
    jobEnd: job.end_date,
    jobLocation: job.location,
    offeredRateCents: row.offered_rate_cents,
    confirmedRateCents: row.confirmed_rate_cents,
  }
}

export async function notifyJobOffer(bookingId: string) {
  try {
    const ctx = await loadBookingContext(bookingId)
    if (!ctx || !ctx.talentUserId) return
    const dateLabel = fmtDateRange(ctx.jobStart, ctx.jobEnd)
    const rateLabel = fmtUsd(ctx.offeredRateCents)
    const html = EmailTemplates.jobOffer({
      jobTitle: ctx.jobTitle,
      dateLabel,
      location: ctx.jobLocation ?? '',
      rateLabel: `${rateLabel}/day`,
      actionUrl: `${APP_URL}/app`,
    })
    await sendNotification({
      userId: ctx.talentUserId,
      type: 'job_offer',
      title: `New job offer: ${ctx.jobTitle}`,
      body: `You have been offered ${ctx.jobTitle} on ${dateLabel} at ${rateLabel}/day. Tap to respond.`,
      actionUrl: '/app',
      bookingId,
      jobId: ctx.jobId,
      channels: ['in_app', 'email', 'sms'],
      emailHtml: html,
      smsBody: SmsTemplates.jobOffer(
        ctx.jobTitle,
        fmtDateShort(ctx.jobStart),
        rateLabel
      ),
    })
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[notify] jobOffer failed', err)
  }
}

export async function notifyConfirmation(bookingId: string) {
  try {
    const ctx = await loadBookingContext(bookingId)
    if (!ctx || !ctx.clientUserId) return
    const dateLabel = fmtDateRange(ctx.jobStart, ctx.jobEnd)
    const rateLabel = fmtUsd(ctx.confirmedRateCents ?? ctx.offeredRateCents)
    const html = EmailTemplates.talentConfirmed({
      talentName: ctx.talentName,
      jobTitle: ctx.jobTitle,
      dateLabel,
      rateLabel: `${rateLabel}/day`,
      actionUrl: `${APP_URL}/app`,
    })
    await sendNotification({
      userId: ctx.clientUserId,
      type: 'booking_confirmed',
      title: `${ctx.talentName} confirmed`,
      body: `${ctx.talentName} has confirmed for ${ctx.jobTitle} on ${dateLabel} at ${rateLabel}/day.`,
      actionUrl: '/app',
      bookingId,
      jobId: ctx.jobId,
      channels: ['in_app', 'email'],
      emailHtml: html,
    })
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[notify] confirmation failed', err)
  }
}

export async function notifyDecline(bookingId: string, reason: string | null) {
  try {
    const ctx = await loadBookingContext(bookingId)
    if (!ctx) return
    const actionUrl = `${APP_URL}/admin/jobs/${ctx.jobId}`
    const html = EmailTemplates.declined({
      talentName: ctx.talentName,
      jobTitle: ctx.jobTitle,
      reason,
      actionUrl,
    })
    // Notify every admin — lightweight fan-out, tiny admin roster.
    const supabase = createServiceClient()
    const { data: admins } = await supabase
      .from('profiles')
      .select('id')
      .eq('role', 'admin')
    for (const a of (admins ?? []) as Array<{ id: string }>) {
      await sendNotification({
        userId: a.id,
        type: 'booking_declined',
        title: `${ctx.talentName} declined ${ctx.jobTitle}`,
        body: `${ctx.talentName} has declined the offer. Reason: ${
          reason || 'Not provided'
        }`,
        actionUrl: `/admin/jobs/${ctx.jobId}`,
        bookingId,
        jobId: ctx.jobId,
        channels: ['in_app', 'email'],
        emailHtml: html,
      })
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[notify] decline failed', err)
  }
}

export async function notifyNudge(bookingId: string) {
  try {
    const ctx = await loadBookingContext(bookingId)
    if (!ctx || !ctx.talentUserId) return
    const dateLabel = fmtDateRange(ctx.jobStart, ctx.jobEnd)
    const rateLabel = `${fmtUsd(ctx.offeredRateCents)}/day`
    const html = EmailTemplates.nudge({
      jobTitle: ctx.jobTitle,
      rateLabel,
      dateLabel,
      actionUrl: `${APP_URL}/app`,
    })
    await sendNotification({
      userId: ctx.talentUserId,
      type: 'nudge',
      title: 'Reminder: Pending job offer',
      body: `Your response is needed for ${ctx.jobTitle} (${dateLabel}).`,
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
    // Pull counter amount out of the notes string when possible.
    const counterLabel = ctx.offeredRateCents
      ? `${fmtUsd(ctx.offeredRateCents)}/day (was offered)`
      : 'see notes'
    const html = EmailTemplates.counterOffer({
      talentName: ctx.talentName,
      jobTitle: ctx.jobTitle,
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
        `id, title, start_date, end_date, client_id, num_talent,
         profiles!jobs_client_id_fkey (full_name,
           client_profiles (company_name))`
      )
      .eq('id', jobId)
      .maybeSingle()
    if (!job) return

    const { data: confirmed } = await supabase
      .from('job_bookings')
      .select(
        `profiles!job_bookings_talent_id_fkey (full_name, first_name, last_name,
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
    const talentList = ((confirmed ?? []) as Array<{
      profiles: TalentJoin | TalentJoin[] | null
    }>)
      .map((b) => {
        const p = Array.isArray(b.profiles) ? b.profiles[0] ?? null : b.profiles
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
        return tp?.primary_role ? `${name} — ${tp.primary_role}` : name
      })
      .filter((x): x is string => Boolean(x))

    const dateLabel = fmtDateRange(
      (job as { start_date: string | null }).start_date,
      (job as { end_date: string | null }).end_date
    )
    const html = EmailTemplates.fullyCrewed({
      jobTitle: (job as { title: string }).title,
      dateLabel,
      talentList,
      actionUrl: `${APP_URL}/app`,
    })

    const clientId = (job as { client_id: string | null }).client_id
    if (clientId) {
      await sendNotification({
        userId: clientId,
        type: 'job_fully_crewed',
        title: `${(job as { title: string }).title} is fully crewed!`,
        body: `All talent confirmed for ${(job as { title: string }).title} on ${dateLabel}.`,
        actionUrl: '/app',
        jobId,
        channels: ['in_app', 'email', 'sms'],
        emailHtml: html,
        smsBody: SmsTemplates.fullyCrewed((job as { title: string }).title),
      })
    }

    // Notify admins in-app.
    const { data: admins } = await supabase
      .from('profiles')
      .select('id')
      .eq('role', 'admin')
    for (const a of (admins ?? []) as Array<{ id: string }>) {
      await sendNotification({
        userId: a.id,
        type: 'job_fully_crewed',
        title: `${(job as { title: string }).title} — fully crewed`,
        body: `All ${talentList.length} talent confirmed.`,
        actionUrl: `/admin/jobs/${jobId}`,
        jobId,
        channels: ['in_app'],
      })
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[notify] fully crewed failed', err)
  }
}

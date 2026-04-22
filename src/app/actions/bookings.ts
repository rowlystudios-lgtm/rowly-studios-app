'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase-server'
import {
  notifyConfirmation,
  notifyDecline,
  notifyFullyCrewed,
} from '@/lib/notifications'
import { createServiceClient } from '@/lib/supabase-service'

async function requireTalent(bookingId: string) {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  // Ownership guard — the booking must belong to the caller.
  const { data } = await supabase
    .from('job_bookings')
    .select('id, talent_id')
    .eq('id', bookingId)
    .maybeSingle()
  if (!data || data.talent_id !== user.id) return null
  return { supabase, userId: user.id }
}

/** Record that talent has seen the offer — sets talent_reviewed_at once. */
export async function markBookingViewed(formData: FormData) {
  const bookingId = ((formData.get('bookingId') as string) ?? '').trim()
  if (!bookingId) return
  const ctx = await requireTalent(bookingId)
  if (!ctx) return
  await ctx.supabase
    .from('job_bookings')
    .update({ talent_reviewed_at: new Date().toISOString() })
    .eq('id', bookingId)
    .is('talent_reviewed_at', null)
}

/** Talent accepts at the offered rate. */
export async function acceptBookingOffer(formData: FormData) {
  const bookingId = ((formData.get('bookingId') as string) ?? '').trim()
  if (!bookingId) return
  const ctx = await requireTalent(bookingId)
  if (!ctx) return

  const { data: existing } = await ctx.supabase
    .from('job_bookings')
    .select(
      'offered_rate_cents, confirmed_rate_cents, status, talent_reviewed_at, job_id, talent_id'
    )
    .eq('id', bookingId)
    .maybeSingle()
  if (!existing) return

  await ctx.supabase
    .from('job_bookings')
    .update({
      status: 'confirmed',
      confirmed_rate_cents: existing.offered_rate_cents,
      talent_reviewed_at: existing.talent_reviewed_at ?? new Date().toISOString(),
    })
    .eq('id', bookingId)

  // ─── v1.2: calendar blocking + conflict resolution ───
  // Runs through the service client so we can read/write across talents
  // (for the admin-side conflict notifications) without tripping RLS.
  if (existing.job_id) {
    try {
      await blockCalendarAndResolveConflicts({
        bookingId,
        jobId: existing.job_id,
        talentId: existing.talent_id,
      })
    } catch {
      // Non-fatal — the confirm itself has already landed.
    }
  }

  // Activity log — admin surfaces read booking_events to show a timeline
  // of what happened without polling every booking row. Fire-and-forget;
  // the event log is passive audit, not a gate on the flow.
  try {
    const svc = createServiceClient()
    const { data: jobRow } = existing.job_id
      ? await svc
          .from('jobs')
          .select('client_id')
          .eq('id', existing.job_id)
          .maybeSingle()
      : { data: null }
    await svc.from('booking_events').insert({
      booking_id: bookingId,
      job_id: existing.job_id,
      talent_id: existing.talent_id,
      client_id: jobRow?.client_id ?? null,
      event_type: 'offer_accepted',
      old_status: existing.status,
      new_status: 'confirmed',
      rate_cents:
        existing.offered_rate_cents ?? existing.confirmed_rate_cents,
    })
  } catch {
    // non-fatal — the log is advisory
  }

  try {
    await notifyConfirmation(bookingId)
  } catch {
    // non-fatal
  }

  // Fully-crewed check runs through the service client (RLS-neutral).
  if (existing.job_id) {
    try {
      const svc = createServiceClient()
      const [{ data: job }, { count }] = await Promise.all([
        svc
          .from('jobs')
          .select('num_talent, crewed_at')
          .eq('id', existing.job_id)
          .maybeSingle(),
        svc
          .from('job_bookings')
          .select('id', { count: 'exact', head: true })
          .eq('job_id', existing.job_id)
          .eq('status', 'confirmed'),
      ])
      const needed = job?.num_talent ?? null
      if (
        needed != null &&
        needed > 0 &&
        (count ?? 0) >= needed &&
        !job?.crewed_at
      ) {
        await svc
          .from('jobs')
          .update({ crewed_at: new Date().toISOString() })
          .eq('id', existing.job_id)
        await notifyFullyCrewed(existing.job_id)
      }
    } catch {
      // non-fatal
    }
  }

  revalidatePath('/app')
}

/** Talent declines the offer. Optional reason stored on the booking. */
export async function declineBookingOffer(formData: FormData) {
  const bookingId = ((formData.get('bookingId') as string) ?? '').trim()
  const reason = ((formData.get('reason') as string) ?? '').trim() || null
  if (!bookingId) return
  const ctx = await requireTalent(bookingId)
  if (!ctx) return

  const { data: existing } = await ctx.supabase
    .from('job_bookings')
    .select(
      'offered_rate_cents, status, talent_reviewed_at, job_id, talent_id'
    )
    .eq('id', bookingId)
    .maybeSingle()

  await ctx.supabase
    .from('job_bookings')
    .update({
      status: 'declined',
      declined_reason: reason,
      talent_reviewed_at:
        existing?.talent_reviewed_at ?? new Date().toISOString(),
    })
    .eq('id', bookingId)

  // Passive audit log for admin timelines.
  const svc = createServiceClient()
  const { data: jobRow } = existing?.job_id
    ? await svc
        .from('jobs')
        .select('client_id, title')
        .eq('id', existing.job_id)
        .maybeSingle()
    : { data: null }

  try {
    await svc.from('booking_events').insert({
      booking_id: bookingId,
      job_id: existing?.job_id ?? null,
      talent_id: existing?.talent_id ?? null,
      client_id: jobRow?.client_id ?? null,
      event_type: 'offer_declined',
      old_status: existing?.status ?? null,
      new_status: 'declined',
      rate_cents: existing?.offered_rate_cents ?? null,
    })
  } catch {
    // non-fatal
  }

  // Direct in-app notifications for the client (so they see the decline
  // the moment it happens) and every admin (so the ops surface lights
  // up). These live alongside the notifyDecline()-driven email flow.
  try {
    const { data: talentRow } = existing?.talent_id
      ? await svc
          .from('profiles')
          .select('first_name, last_name')
          .eq('id', existing.talent_id)
          .maybeSingle()
      : { data: null }
    const talentName =
      [talentRow?.first_name, talentRow?.last_name]
        .filter(Boolean)
        .join(' ') || 'A talent'
    const jobTitle = jobRow?.title ?? 'a job'
    const rosterLink = `/app/roster?jobId=${existing?.job_id ?? ''}`

    if (jobRow?.client_id) {
      await svc.from('notifications').insert({
        user_id: jobRow.client_id,
        type: 'booking_declined',
        title: 'Offer declined',
        body: `${talentName} has declined your offer for "${jobTitle}". Go to the roster to make a new offer.`,
        link: rosterLink,
        action_url: rosterLink,
        metadata: {
          booking_id: bookingId,
          job_id: existing?.job_id,
          talent_id: existing?.talent_id,
          talent_name: talentName,
        },
      })
    }

    const { data: adminRows } = await svc
      .from('profiles')
      .select('id')
      .eq('role', 'admin')
    if (adminRows && adminRows.length > 0) {
      await svc.from('notifications').insert(
        adminRows.map((a: { id: string }) => ({
          user_id: a.id,
          type: 'booking_declined',
          title: 'Offer declined by talent',
          body: `${talentName} declined an offer for "${jobTitle}".`,
          link: `/app/jobs`,
          action_url: `/app/jobs`,
          metadata: {
            booking_id: bookingId,
            job_id: existing?.job_id,
            talent_id: existing?.talent_id,
          },
        }))
      )
    }
  } catch {
    // notifications are advisory — never block the decline on them
  }

  try {
    await notifyDecline(bookingId, reason)
  } catch {
    // non-fatal
  }

  revalidatePath('/app')
}

/** Mark a notification read (any role, as long as it's theirs). */
export async function markNotificationRead(formData: FormData) {
  const id = ((formData.get('id') as string) ?? '').trim()
  if (!id) return
  const supabase = createClient()
  await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('id', id)
    .is('read_at', null)
  revalidatePath('/app/notifications')
  revalidatePath('/app')
}

export async function markAllNotificationsRead() {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return
  await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('user_id', user.id)
    .is('read_at', null)
  revalidatePath('/app/notifications')
  revalidatePath('/app')
}

/**
 * After a talent confirms a booking: block their calendar for every shoot
 * day of the now-confirmed job, and mark any other 'requested' bookings
 * whose shoot dates overlap as 'unavailable'. Affected clients + all
 * admins get a notification so they can re-crew.
 *
 * Shoot dates are pulled from jobs.shoot_days[] when present, falling
 * back to the start_date..end_date range (inclusive) otherwise.
 */
async function blockCalendarAndResolveConflicts(args: {
  bookingId: string
  jobId: string
  talentId: string
}) {
  const { bookingId, jobId, talentId } = args
  const svc = createServiceClient()

  // 1. Load confirming job + determine its shoot dates.
  const { data: confirmedJob } = await svc
    .from('jobs')
    .select('id, title, job_code, start_date, end_date, shoot_days')
    .eq('id', jobId)
    .maybeSingle()
  if (!confirmedJob) return

  const confirmedDates = extractShootDates(confirmedJob)
  if (confirmedDates.length === 0) return

  // 2. UPSERT availability rows (one per date) with status='booked'.
  const availabilityRows = confirmedDates.map((date) => ({
    talent_id: talentId,
    date,
    status: 'booked',
  }))
  await svc
    .from('availability')
    .upsert(availabilityRows, { onConflict: 'talent_id,date' })

  // 3. Find other bookings for this talent that are still open
  //    (requested / negotiating) and whose job's shoot dates overlap.
  const { data: openBookings } = await svc
    .from('job_bookings')
    .select(
      `id, job_id, status,
       jobs!inner (id, title, job_code, start_date, end_date, shoot_days, client_id)`
    )
    .eq('talent_id', talentId)
    .in('status', ['requested', 'negotiating'])
    .neq('id', bookingId)

  type OpenBookingRow = {
    id: string
    job_id: string
    status: string
    jobs:
      | {
          id: string
          title: string
          job_code: string | null
          start_date: string | null
          end_date: string | null
          shoot_days: unknown
          client_id: string | null
        }
      | {
          id: string
          title: string
          job_code: string | null
          start_date: string | null
          end_date: string | null
          shoot_days: unknown
          client_id: string | null
        }[]
      | null
  }

  const rows = (openBookings ?? []) as unknown as OpenBookingRow[]
  const confirmedSet = new Set(confirmedDates)
  const conflicting: { bookingId: string; jobId: string; jobTitle: string; clientId: string | null }[] = []
  for (const r of rows) {
    const job = Array.isArray(r.jobs) ? (r.jobs[0] ?? null) : r.jobs
    if (!job) continue
    const dates = extractShootDates(job)
    if (dates.some((d) => confirmedSet.has(d))) {
      conflicting.push({
        bookingId: r.id,
        jobId: r.job_id,
        jobTitle: job.title,
        clientId: job.client_id,
      })
    }
  }

  if (conflicting.length === 0) return

  // 4. Mark conflicting bookings 'unavailable'.
  await svc
    .from('job_bookings')
    .update({ status: 'unavailable' })
    .in(
      'id',
      conflicting.map((c) => c.bookingId)
    )

  // 5. Load talent name for the notification copy.
  const { data: talentRow } = await svc
    .from('profiles')
    .select('first_name, last_name, full_name')
    .eq('id', talentId)
    .maybeSingle()
  const talentName =
    [talentRow?.first_name, talentRow?.last_name].filter(Boolean).join(' ') ||
    talentRow?.full_name ||
    'Talent'

  // 6. Notify each affected client (dedupe by client_id).
  const clientJobs = new Map<string, { jobId: string; jobTitle: string }[]>()
  for (const c of conflicting) {
    if (!c.clientId) continue
    const list = clientJobs.get(c.clientId) ?? []
    list.push({ jobId: c.jobId, jobTitle: c.jobTitle })
    clientJobs.set(c.clientId, list)
  }
  const clientRows: Record<string, unknown>[] = []
  for (const [clientId, jobs] of clientJobs) {
    for (const j of jobs) {
      clientRows.push({
        user_id: clientId,
        type: 'booking_conflict',
        title: 'Talent no longer available',
        body: `${talentName} confirmed another booking on overlapping dates and is no longer available for "${j.jobTitle}".`,
        link: `/app/roster?jobId=${j.jobId}`,
        action_url: `/app/roster?jobId=${j.jobId}`,
        priority: 'high',
        clearable: true,
        metadata: {
          action: 'booking-conflict',
          conflict_source_job_id: jobId,
          conflict_source_booking_id: bookingId,
          released_job_id: j.jobId,
          talent_id: talentId,
          talent_name: talentName,
        },
      })
    }
  }
  if (clientRows.length > 0) {
    await svc.from('notifications').insert(clientRows)
  }

  // 7. Notify all admins so ops can re-crew the released jobs.
  const { data: admins } = await svc
    .from('profiles')
    .select('id')
    .eq('role', 'admin')
  const adminIds = (admins ?? []).map((a: { id: string }) => a.id)
  if (adminIds.length > 0) {
    const jobTitles = conflicting.map((c) => `"${c.jobTitle}"`).join(', ')
    const adminRows = adminIds.map((id) => ({
      user_id: id,
      type: 'booking_conflict',
      title: `Re-crew needed: ${talentName} released from ${conflicting.length} job${conflicting.length === 1 ? '' : 's'}`,
      body: `${talentName} confirmed an overlapping booking. Released from: ${jobTitles}.`,
      link: `/admin/jobs/${conflicting[0].jobId}`,
      action_url: `/admin/jobs/${conflicting[0].jobId}`,
      priority: 'high',
      clearable: true,
      metadata: {
        action: 'booking-conflict',
        conflict_source_job_id: jobId,
        released_job_ids: conflicting.map((c) => c.jobId),
        released_booking_ids: conflicting.map((c) => c.bookingId),
        talent_id: talentId,
        talent_name: talentName,
      },
    }))
    await svc.from('notifications').insert(adminRows)
  }
}

type JobDateShape = {
  start_date: string | null
  end_date: string | null
  shoot_days: unknown
}

function extractShootDates(job: JobDateShape): string[] {
  const out = new Set<string>()
  if (Array.isArray(job.shoot_days)) {
    for (const d of job.shoot_days as Array<{ date?: string | null }>) {
      if (d && typeof d.date === 'string') out.add(d.date)
    }
  }
  if (out.size === 0 && job.start_date) {
    const end = job.end_date ?? job.start_date
    for (const d of isoDateRange(job.start_date, end)) out.add(d)
  }
  return Array.from(out)
}

function isoDateRange(startIso: string, endIso: string): string[] {
  const parts = (iso: string) => iso.split('-').map(Number)
  const s = parts(startIso)
  const e = parts(endIso)
  if (s.length !== 3 || e.length !== 3 || s.some(Number.isNaN) || e.some(Number.isNaN)) {
    return [startIso]
  }
  const startUTC = Date.UTC(s[0], s[1] - 1, s[2])
  const endUTC = Date.UTC(e[0], e[1] - 1, e[2])
  if (endUTC < startUTC) return [startIso]
  const out: string[] = []
  for (let t = startUTC; t <= endUTC; t += 86_400_000) {
    out.push(new Date(t).toISOString().slice(0, 10))
  }
  return out
}

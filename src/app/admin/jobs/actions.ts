'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/admin-auth'
import {
  notifyJobOffer,
  notifyConfirmation,
  notifyDecline,
  notifyNudge,
  notifyFullyCrewed,
  notifyCounterOffer,
} from '@/lib/notifications'

type JobStatus = 'crewing' | 'submitted' | 'confirmed' | 'wrapped' | 'cancelled'

const ALLOWED_JOB_STATUS: JobStatus[] = [
  'crewing',
  'submitted',
  'confirmed',
  'wrapped',
  'cancelled',
]

/** Update a job's status. Stamps cancelled_at / wrapped_at when appropriate. */
export async function updateJobStatus(formData: FormData) {
  const { supabase } = await requireAdmin()
  const jobId = (formData.get('jobId') as string) ?? ''
  const next = ((formData.get('status') as string) ?? '') as JobStatus
  if (!jobId || !ALLOWED_JOB_STATUS.includes(next)) return

  const patch: Record<string, unknown> = { status: next }
  const nowIso = new Date().toISOString()
  if (next === 'cancelled') patch.cancelled_at = nowIso
  if (next === 'wrapped') patch.wrapped_at = nowIso

  await supabase.from('jobs').update(patch).eq('id', jobId)
  revalidatePath(`/admin/jobs/${jobId}`)
  revalidatePath('/admin/jobs')
}

/**
 * Confirm a booking. Copies offered_rate_cents (or falls back to the
 * existing confirmed_rate_cents / job.day_rate_cents) into confirmed_rate_cents.
 * After confirm we check whether the job is now fully crewed and, if so,
 * stamp jobs.crewed_at and fan-out the "fully crewed" notifications.
 */
export async function confirmBooking(formData: FormData) {
  const { supabase } = await requireAdmin()
  const bookingId = (formData.get('bookingId') as string) ?? ''
  const jobId = (formData.get('jobId') as string) ?? ''
  if (!bookingId || !jobId) return

  const { data: existing } = await supabase
    .from('job_bookings')
    .select('confirmed_rate_cents, offered_rate_cents')
    .eq('id', bookingId)
    .maybeSingle()

  const patch: Record<string, unknown> = { status: 'confirmed' }
  if (existing && existing.confirmed_rate_cents == null) {
    if (existing.offered_rate_cents != null) {
      patch.confirmed_rate_cents = existing.offered_rate_cents
    } else {
      const { data: job } = await supabase
        .from('jobs')
        .select('day_rate_cents')
        .eq('id', jobId)
        .maybeSingle()
      if (job?.day_rate_cents != null) {
        patch.confirmed_rate_cents = job.day_rate_cents
      }
    }
  }

  await supabase.from('job_bookings').update(patch).eq('id', bookingId)

  // Fire the "you've been confirmed" notification (client + admin copy).
  try {
    await notifyConfirmation(bookingId)
  } catch {
    // non-fatal
  }

  // Check fully-crewed state — lightweight: count confirmed vs num_talent.
  try {
    const [{ data: job }, { count: confirmedCount }] = await Promise.all([
      supabase
        .from('jobs')
        .select('num_talent, crewed_at')
        .eq('id', jobId)
        .maybeSingle(),
      supabase
        .from('job_bookings')
        .select('id', { count: 'exact', head: true })
        .eq('job_id', jobId)
        .eq('status', 'confirmed'),
    ])
    const needed = job?.num_talent ?? null
    if (
      needed != null &&
      needed > 0 &&
      (confirmedCount ?? 0) >= needed &&
      !job?.crewed_at
    ) {
      await supabase
        .from('jobs')
        .update({ crewed_at: new Date().toISOString() })
        .eq('id', jobId)
      await notifyFullyCrewed(jobId)
    }
  } catch {
    // non-fatal
  }

  revalidatePath(`/admin/jobs/${jobId}`)
  revalidatePath('/admin/jobs')
}

export async function declineBooking(formData: FormData) {
  const { supabase } = await requireAdmin()
  const bookingId = (formData.get('bookingId') as string) ?? ''
  const jobId = (formData.get('jobId') as string) ?? ''
  const reason = ((formData.get('reason') as string) ?? '').trim() || null
  if (!bookingId || !jobId) return
  await supabase
    .from('job_bookings')
    .update({ status: 'declined', declined_reason: reason })
    .eq('id', bookingId)
  try {
    await notifyDecline(bookingId, reason)
  } catch {
    // non-fatal
  }
  revalidatePath(`/admin/jobs/${jobId}`)
}

/**
 * Nudge the talent on a requested booking. Disallowed before the
 * 24-hour response_deadline_at. Bumps nudge_count / nudged_at and
 * triggers in-app + email + SMS to the talent.
 */
export async function nudgeTalent(formData: FormData) {
  const { supabase } = await requireAdmin()
  const bookingId = (formData.get('bookingId') as string) ?? ''
  const jobId = (formData.get('jobId') as string) ?? ''
  if (!bookingId || !jobId) return

  const { data: b } = await supabase
    .from('job_bookings')
    .select('status, response_deadline_at, nudge_count')
    .eq('id', bookingId)
    .maybeSingle()
  if (!b) return

  const now = new Date()
  const deadline = b.response_deadline_at
    ? new Date(b.response_deadline_at)
    : null
  if (b.status !== 'requested' && b.status !== 'negotiating') return
  if (deadline && now < deadline) return

  await supabase
    .from('job_bookings')
    .update({
      nudge_count: (b.nudge_count ?? 0) + 1,
      nudged_at: now.toISOString(),
    })
    .eq('id', bookingId)

  try {
    await notifyNudge(bookingId)
  } catch {
    // non-fatal
  }
  revalidatePath(`/admin/jobs/${jobId}`)
}

/**
 * Admin updates the offered rate on an existing booking. If the booking
 * was in negotiating / declined, we flip it back to requested so the
 * talent sees a fresh offer to respond to.
 */
export async function updateOfferedRate(formData: FormData) {
  const { supabase } = await requireAdmin()
  const bookingId = (formData.get('bookingId') as string) ?? ''
  const jobId = (formData.get('jobId') as string) ?? ''
  const rateRaw = (formData.get('offered_rate') as string) ?? ''
  const notes = ((formData.get('notes') as string) ?? '').trim() || null
  if (!bookingId || !jobId || !rateRaw) return
  const cents = Math.round(parseFloat(rateRaw) * 100)
  if (!Number.isFinite(cents) || cents <= 0) return

  await supabase
    .from('job_bookings')
    .update({
      offered_rate_cents: cents,
      status: 'requested',
      rate_negotiation_notes: notes,
      nudged_at: null,
    })
    .eq('id', bookingId)

  try {
    await notifyJobOffer(bookingId)
  } catch {
    // non-fatal
  }
  revalidatePath(`/admin/jobs/${jobId}`)
}

/**
 * Admin accepts the talent's counter-offer. Confirms the booking at the
 * counter amount and triggers the confirmation notification.
 */
export async function acceptCounterOffer(formData: FormData) {
  const { supabase } = await requireAdmin()
  const bookingId = (formData.get('bookingId') as string) ?? ''
  const jobId = (formData.get('jobId') as string) ?? ''
  const counterRaw = (formData.get('counter') as string) ?? ''
  if (!bookingId || !jobId || !counterRaw) return
  const cents = Math.round(parseFloat(counterRaw) * 100)
  if (!Number.isFinite(cents) || cents <= 0) return

  await supabase
    .from('job_bookings')
    .update({
      status: 'confirmed',
      offered_rate_cents: cents,
      confirmed_rate_cents: cents,
    })
    .eq('id', bookingId)

  // Mirror the post-confirm fan-out from confirmBooking.
  try {
    await notifyConfirmation(bookingId)
  } catch {
    // non-fatal
  }
  try {
    const [{ data: job }, { count: confirmedCount }] = await Promise.all([
      supabase
        .from('jobs')
        .select('num_talent, crewed_at')
        .eq('id', jobId)
        .maybeSingle(),
      supabase
        .from('job_bookings')
        .select('id', { count: 'exact', head: true })
        .eq('job_id', jobId)
        .eq('status', 'confirmed'),
    ])
    const needed = job?.num_talent ?? null
    if (
      needed != null &&
      needed > 0 &&
      (confirmedCount ?? 0) >= needed &&
      !job?.crewed_at
    ) {
      await supabase
        .from('jobs')
        .update({ crewed_at: new Date().toISOString() })
        .eq('id', jobId)
      await notifyFullyCrewed(jobId)
    }
  } catch {
    // non-fatal
  }

  revalidatePath(`/admin/jobs/${jobId}`)
  revalidatePath('/admin/jobs')
}

export async function markBookingPaid(formData: FormData) {
  const { supabase } = await requireAdmin()
  const bookingId = (formData.get('bookingId') as string) ?? ''
  const jobId = (formData.get('jobId') as string) ?? ''
  if (!bookingId || !jobId) return
  await supabase
    .from('job_bookings')
    .update({ paid: true, paid_at: new Date().toISOString() })
    .eq('id', bookingId)
  revalidatePath(`/admin/jobs/${jobId}`)
}

export async function markBookingCompleted(formData: FormData) {
  const { supabase } = await requireAdmin()
  const bookingId = (formData.get('bookingId') as string) ?? ''
  const jobId = (formData.get('jobId') as string) ?? ''
  if (!bookingId || !jobId) return
  await supabase
    .from('job_bookings')
    .update({ status: 'completed' })
    .eq('id', bookingId)
  revalidatePath(`/admin/jobs/${jobId}`)
}

/** Count shoot days between start_date and end_date inclusive (minimum 1). */
function daysBetweenInclusive(start: string | null, end: string | null): number {
  if (!start) return 1
  const s = new Date(start)
  const e = end ? new Date(end) : s
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return 1
  const ms = e.getTime() - s.getTime()
  return Math.max(1, Math.round(ms / (1000 * 60 * 60 * 24)) + 1)
}

/**
 * Generate an invoice for a job. Inserts an invoice row, then one
 * invoice_line_items per confirmed booking, then updates invoice total.
 * Redirects to the new invoice's finance page.
 */
export async function generateInvoice(formData: FormData) {
  const { supabase, user } = await requireAdmin()
  const jobId = (formData.get('jobId') as string) ?? ''
  if (!jobId) return

  const { data: job } = await supabase
    .from('jobs')
    .select('id, client_id, start_date, end_date')
    .eq('id', jobId)
    .maybeSingle()
  if (!job) return

  // Sequential invoice number.
  const { count } = await supabase
    .from('invoices')
    .select('id', { count: 'exact', head: true })
  const next = (count ?? 0) + 1
  const invoiceNumber = `RS-INV-${String(next).padStart(4, '0')}`

  const due = new Date()
  due.setDate(due.getDate() + 14)
  const dueIso = `${due.getFullYear()}-${String(due.getMonth() + 1).padStart(2, '0')}-${String(due.getDate()).padStart(2, '0')}`

  const { data: inv, error: invErr } = await supabase
    .from('invoices')
    .insert({
      job_id: job.id,
      client_id: job.client_id ?? null,
      invoice_number: invoiceNumber,
      status: 'draft',
      total_cents: 0,
      due_date: dueIso,
      created_by: user.id,
    })
    .select('id')
    .single()
  if (invErr || !inv) return

  // Confirmed bookings → line items.
  const { data: bookings } = await supabase
    .from('job_bookings')
    .select(
      `id, confirmed_rate_cents, talent_id,
       profiles!job_bookings_talent_id_fkey (full_name, first_name, last_name,
         talent_profiles (primary_role))`
    )
    .eq('job_id', job.id)
    .eq('status', 'confirmed')

  const days = daysBetweenInclusive(job.start_date, job.end_date)
  const rows: Array<Record<string, unknown>> = []

  type TalentJoin = {
    full_name: string | null
    first_name: string | null
    last_name: string | null
    talent_profiles:
      | { primary_role: string | null }
      | { primary_role: string | null }[]
      | null
  }

  for (const b of (bookings ?? []) as unknown as Array<{
    id: string
    confirmed_rate_cents: number | null
    talent_id: string | null
    profiles: TalentJoin | TalentJoin[] | null
  }>) {
    const p = Array.isArray(b.profiles) ? b.profiles[0] : b.profiles
    const tp = p
      ? Array.isArray(p.talent_profiles)
        ? p.talent_profiles[0]
        : p.talent_profiles
      : null
    const name =
      [p?.first_name, p?.last_name].filter(Boolean).join(' ') ||
      p?.full_name ||
      'Talent'
    const role = tp?.primary_role ?? null
    const startLabel = job.start_date ?? ''
    const desc = [name, role].filter(Boolean).join(' — ') + (startLabel ? ` (${startLabel})` : '')
    const unit = b.confirmed_rate_cents ?? 0
    rows.push({
      invoice_id: inv.id,
      booking_id: b.id,
      talent_id: b.talent_id,
      description: desc,
      quantity: days,
      unit_price_cents: unit,
      total_cents: unit * days,
    })
  }

  if (rows.length > 0) {
    await supabase.from('invoice_line_items').insert(rows)
    const total = rows.reduce((s, r) => s + Number(r.total_cents ?? 0), 0)
    await supabase.from('invoices').update({ total_cents: total }).eq('id', inv.id)
  }

  redirect(`/admin/finance/${inv.id}`)
}

/**
 * Insert a new booking for this job with status='requested'. If the talent's
 * profile has a day rate, copy it into confirmed_rate_cents so the admin
 * sees a proposed rate immediately (it only becomes the "final" rate on confirm).
 */
/**
 * Admin adds a talent to a job. Caller supplies the offered rate (in
 * dollars). If omitted we fall back to client_budget_cents → job day
 * rate → talent day rate in that order. A 24-hour response deadline is
 * stamped so the nudge button unlocks after it expires.
 */
export async function addTalentToJob(formData: FormData) {
  const { supabase } = await requireAdmin()
  const jobId = (formData.get('jobId') as string) ?? ''
  const talentId = (formData.get('talentId') as string) ?? ''
  const offeredRaw = ((formData.get('offered_rate') as string) ?? '').trim()
  if (!jobId || !talentId) return

  const { data: existing } = await supabase
    .from('job_bookings')
    .select('id')
    .eq('job_id', jobId)
    .eq('talent_id', talentId)
    .maybeSingle()
  if (existing) {
    redirect(`/admin/jobs/${jobId}`)
  }

  const [{ data: tp }, { data: job }] = await Promise.all([
    supabase
      .from('talent_profiles')
      .select('day_rate_cents')
      .eq('id', talentId)
      .maybeSingle(),
    supabase
      .from('jobs')
      .select('day_rate_cents, client_budget_cents')
      .eq('id', jobId)
      .maybeSingle(),
  ])

  let offeredCents: number | null = null
  if (offeredRaw) {
    const parsed = Math.round(parseFloat(offeredRaw) * 100)
    if (Number.isFinite(parsed) && parsed > 0) offeredCents = parsed
  }
  if (offeredCents == null) {
    offeredCents =
      job?.client_budget_cents ??
      job?.day_rate_cents ??
      tp?.day_rate_cents ??
      null
  }

  const deadline = new Date()
  deadline.setHours(deadline.getHours() + 24)

  const { data: inserted } = await supabase
    .from('job_bookings')
    .insert({
      job_id: jobId,
      talent_id: talentId,
      status: 'requested',
      offered_rate_cents: offeredCents,
      confirmed_rate_cents: null,
      response_deadline_at: deadline.toISOString(),
    })
    .select('id')
    .single()

  if (inserted?.id) {
    try {
      await notifyJobOffer(inserted.id)
    } catch {
      // non-fatal
    }
  }
  redirect(`/admin/jobs/${jobId}`)
}

type JobInput = {
  title: string
  client_id: string | null
  status: JobStatus
  start_date: string | null
  end_date: string | null
  call_time: string | null
  day_rate_cents: number | null
  location: string | null
  address_line: string | null
  address_city: string | null
  address_state: string | null
  address_zip: string | null
  num_talent: number | null
  crew_needed: string[]
  description: string | null
  client_notes: string | null
  admin_notes: string | null
}

function parseFormJob(formData: FormData): JobInput {
  const dayRateRaw = (formData.get('day_rate') as string) ?? ''
  const numTalentRaw = (formData.get('num_talent') as string) ?? ''
  const crewRaw = (formData.get('crew_needed') as string) ?? '[]'
  let crew: string[] = []
  try {
    const parsed = JSON.parse(crewRaw)
    if (Array.isArray(parsed)) crew = parsed.filter((x) => typeof x === 'string')
  } catch {
    // ignore
  }
  const status = ((formData.get('status') as string) || 'submitted') as JobStatus

  return {
    title: ((formData.get('title') as string) ?? '').trim(),
    client_id: ((formData.get('client_id') as string) ?? '').trim() || null,
    status: ALLOWED_JOB_STATUS.includes(status) ? status : 'submitted',
    start_date: ((formData.get('start_date') as string) ?? '').trim() || null,
    end_date: ((formData.get('end_date') as string) ?? '').trim() || null,
    call_time: ((formData.get('call_time') as string) ?? '').trim() || null,
    day_rate_cents: dayRateRaw ? Math.round(parseFloat(dayRateRaw) * 100) : null,
    location: ((formData.get('location') as string) ?? '').trim() || null,
    address_line: ((formData.get('address_line') as string) ?? '').trim() || null,
    address_city: ((formData.get('address_city') as string) ?? '').trim() || null,
    address_state: ((formData.get('address_state') as string) ?? '').trim() || null,
    address_zip: ((formData.get('address_zip') as string) ?? '').trim() || null,
    num_talent: numTalentRaw ? parseInt(numTalentRaw, 10) : null,
    crew_needed: crew,
    description: ((formData.get('description') as string) ?? '').trim() || null,
    client_notes: ((formData.get('client_notes') as string) ?? '').trim() || null,
    admin_notes: ((formData.get('admin_notes') as string) ?? '').trim() || null,
  }
}

export async function createJob(formData: FormData) {
  const { supabase, user } = await requireAdmin()
  const input = parseFormJob(formData)
  if (!input.title) return
  const { data, error } = await supabase
    .from('jobs')
    .insert({
      ...input,
      approved_by:
        input.status === 'submitted' || input.status === 'crewing'
          ? user.id
          : null,
      approved_at:
        input.status === 'submitted' || input.status === 'crewing'
          ? new Date().toISOString()
          : null,
    })
    .select('id')
    .single()
  if (error || !data) return
  redirect(`/admin/jobs/${data.id}`)
}

export async function updateJob(formData: FormData) {
  const { supabase } = await requireAdmin()
  const jobId = (formData.get('jobId') as string) ?? ''
  if (!jobId) return
  const input = parseFormJob(formData)
  if (!input.title) return
  await supabase.from('jobs').update(input).eq('id', jobId)
  revalidatePath(`/admin/jobs/${jobId}`)
  revalidatePath('/admin/jobs')
  redirect(`/admin/jobs/${jobId}`)
}

/** Soft delete — flips status to 'cancelled' and stamps cancelled_at. */
export async function softDeleteJob(formData: FormData) {
  const { supabase } = await requireAdmin()
  const jobId = (formData.get('jobId') as string) ?? ''
  if (!jobId) return
  await supabase
    .from('jobs')
    .update({ status: 'cancelled', cancelled_at: new Date().toISOString() })
    .eq('id', jobId)
  revalidatePath('/admin/jobs')
  redirect('/admin/jobs')
}

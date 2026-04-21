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
  try {
    const svc = createServiceClient()
    const { data: jobRow } = existing?.job_id
      ? await svc
          .from('jobs')
          .select('client_id')
          .eq('id', existing.job_id)
          .maybeSingle()
      : { data: null }
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

'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase-server'
import {
  notifyConfirmation,
  notifyDecline,
  notifyCounterOffer,
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
    .select('offered_rate_cents, talent_reviewed_at, job_id')
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

/** Talent proposes a different rate — status → negotiating. */
export async function counterBookingOffer(formData: FormData) {
  const bookingId = ((formData.get('bookingId') as string) ?? '').trim()
  const counterRaw = ((formData.get('counter') as string) ?? '').trim()
  if (!bookingId || !counterRaw) return
  const ctx = await requireTalent(bookingId)
  if (!ctx) return
  const cents = Math.round(parseFloat(counterRaw) * 100)
  if (!Number.isFinite(cents) || cents <= 0) return

  const { data: existing } = await ctx.supabase
    .from('job_bookings')
    .select('talent_reviewed_at')
    .eq('id', bookingId)
    .maybeSingle()

  const note = `Talent proposed: $${(cents / 100).toLocaleString('en-US', {
    maximumFractionDigits: 0,
  })}/day`
  await ctx.supabase
    .from('job_bookings')
    .update({
      status: 'negotiating',
      rate_negotiation_notes: note,
      talent_reviewed_at:
        existing?.talent_reviewed_at ?? new Date().toISOString(),
    })
    .eq('id', bookingId)

  try {
    await notifyCounterOffer(bookingId, note)
  } catch {
    // non-fatal
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
    .select('talent_reviewed_at')
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

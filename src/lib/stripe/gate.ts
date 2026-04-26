import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Phase B-Gate helpers.
 *
 * These functions encapsulate the business rules for the Stripe-readiness
 * gate. They're written to be callable from your existing booking and job
 * endpoints — wrap them around your current "accept booking" / "send requests"
 * actions and the gate is enforced consistently everywhere.
 */

export type GateBlocked = {
  ok: false;
  reason: 'stripe_not_active' | 'no_payment_method' | 'invalid_state' | 'not_found' | 'forbidden';
  message: string;
  /** Where to send the user to fix it. */
  actionUrl?: string;
};

export type AcceptResult =
  | { ok: true; status: 'confirmed'; bookingId: string }
  | { ok: true; status: 'pending_stripe'; bookingId: string;
      windowType: 'standard' | 'immediate'; graceHours: number;
      graceExpiresAt: string; redirectToStripeOnboarding: true }
  | GateBlocked;

/**
 * Accept a booking on behalf of the talent. Decides between two outcomes:
 *
 *   - Talent has active Stripe → status flips to 'confirmed' immediately.
 *   - Talent has no active Stripe → status flips to 'pending_stripe' with
 *     an appropriate grace period (immediate=6h if job ≤ 3 days out,
 *     otherwise standard=48h). Caller should redirect to onboarding.
 *
 * The grace period and the "immediate vs standard" decision are computed
 * server-side via the `compute_stripe_grace` Postgres function so they
 * always stay in sync with admin_settings tunables.
 */
export async function acceptBooking(
  supabase: SupabaseClient,
  params: { bookingId: string; talentId: string },
): Promise<AcceptResult> {
  // 1. Load the booking + verify ownership + ensure it's in 'requested' state
  const { data: booking, error: bookingErr } = await supabase
    .from('job_bookings')
    .select('id, status, talent_id, job_id')
    .eq('id', params.bookingId)
    .single();

  if (bookingErr || !booking) {
    return { ok: false, reason: 'not_found', message: 'Booking not found' };
  }
  if (booking.talent_id !== params.talentId) {
    return { ok: false, reason: 'forbidden', message: 'Not your booking' };
  }
  if (booking.status !== 'requested') {
    return {
      ok: false, reason: 'invalid_state',
      message: `Booking is in status '${booking.status}', cannot accept`,
    };
  }

  // 2. Check talent's Stripe state
  const { data: talentProfile, error: tpErr } = await supabase
    .from('talent_profiles')
    .select('stripe_account_status')
    .eq('id', params.talentId)
    .single();

  const isStripeActive = !tpErr && talentProfile?.stripe_account_status === 'active';

  if (isStripeActive) {
    // 3a. Stripe ready → confirm immediately
    const { error: updErr } = await supabase
      .from('job_bookings')
      .update({ status: 'confirmed', updated_at: new Date().toISOString() })
      .eq('id', booking.id);
    if (updErr) {
      return { ok: false, reason: 'invalid_state', message: updErr.message };
    }
    return { ok: true, status: 'confirmed', bookingId: booking.id };
  }

  // 3b. Stripe NOT ready → pending_stripe + start grace
  const { data: graceRow, error: graceErr } = await supabase
    .rpc('compute_stripe_grace', { p_job_id: booking.job_id })
    .single();

  if (graceErr || !graceRow) {
    return {
      ok: false, reason: 'invalid_state',
      message: 'Could not compute grace period: ' + (graceErr?.message ?? 'unknown'),
    };
  }

  const grace = graceRow as { window_type: 'standard' | 'immediate'; grace_hours: number; expires_at: string };

  const { error: updErr } = await supabase
    .from('job_bookings')
    .update({
      status: 'pending_stripe',
      stripe_grace_started_at: new Date().toISOString(),
      stripe_grace_expires_at: grace.expires_at,
      stripe_grace_window_type: grace.window_type,
      updated_at: new Date().toISOString(),
    })
    .eq('id', booking.id);

  if (updErr) {
    return { ok: false, reason: 'invalid_state', message: updErr.message };
  }

  return {
    ok: true,
    status: 'pending_stripe',
    bookingId: booking.id,
    windowType: grace.window_type,
    graceHours: grace.grace_hours,
    graceExpiresAt: grace.expires_at,
    redirectToStripeOnboarding: true,
  };
}


/**
 * Decline a booking. No Stripe gate involved — talent can always decline.
 */
export async function declineBooking(
  supabase: SupabaseClient,
  params: { bookingId: string; talentId: string; reason?: string },
): Promise<{ ok: true } | GateBlocked> {
  const { data: booking, error } = await supabase
    .from('job_bookings')
    .select('id, status, talent_id')
    .eq('id', params.bookingId)
    .single();

  if (error || !booking) {
    return { ok: false, reason: 'not_found', message: 'Booking not found' };
  }
  if (booking.talent_id !== params.talentId) {
    return { ok: false, reason: 'forbidden', message: 'Not your booking' };
  }
  if (!['requested', 'pending_stripe'].includes(booking.status)) {
    return {
      ok: false, reason: 'invalid_state',
      message: `Cannot decline booking in status '${booking.status}'`,
    };
  }

  const { error: updErr } = await supabase
    .from('job_bookings')
    .update({ status: 'declined', updated_at: new Date().toISOString() })
    .eq('id', params.bookingId);

  if (updErr) return { ok: false, reason: 'invalid_state', message: updErr.message };
  return { ok: true };
}


/**
 * Gate check before a client can send talent requests for a job.
 * Returns ok:true if the client has an active payment method, or a structured
 * blocked response if they don't.
 *
 * Wrap this around your existing "Send team requests" action in the job
 * builder flow.
 */
export async function checkClientCanSendRequests(
  supabase: SupabaseClient,
  clientId: string,
): Promise<{ ok: true } | GateBlocked> {
  const { data, error } = await supabase
    .rpc('client_can_send_requests', { p_client_id: clientId })
    .single();

  if (error) {
    return { ok: false, reason: 'invalid_state', message: error.message };
  }

  if (data === true) return { ok: true };

  return {
    ok: false,
    reason: 'no_payment_method',
    message: 'Connect a payment method on Stripe before sending talent requests.',
    actionUrl: '/app/account#payment-settings',
  };
}

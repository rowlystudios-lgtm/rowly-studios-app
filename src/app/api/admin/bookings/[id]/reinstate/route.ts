import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/stripe/auth';

/**
 * POST /api/admin/bookings/[id]/reinstate
 *
 * Reinstates a cancelled, auto_released, or declined booking. Calls the
 * Postgres helper public.reinstate_booking which handles all the state
 * logic:
 *   - Talent Stripe-active        → status flips to 'confirmed' immediately
 *   - Talent NOT Stripe-active    → status flips to 'pending_stripe' with
 *                                   the appropriate grace window
 *   - Job starts within 2 hours
 *     AND talent not active       → throws (caught here as 400)
 *
 * Auth: admin only. Future enhancement: allow client to reinstate their
 * own job's bookings.
 *
 * Body: none
 *
 * Returns: { ok: true, status: 'confirmed' | 'pending_stripe', message: string }
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const { profile, supabase } = await requireAuth(['admin']);
    const { id: bookingId } = params;

    const { data, error } = await supabase
      .rpc('reinstate_booking', {
        p_booking_id: bookingId,
        p_actor_id: profile.id,
      });

    if (error) {
      // Postgres function uses RAISE EXCEPTION for known errors —
      // surface them as 400s with the message.
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 400 },
      );
    }

    const row = Array.isArray(data) ? data[0] : data;

    return NextResponse.json({
      ok: true,
      status: row?.new_status ?? 'unknown',
      message: row?.message ?? 'Booking reinstated',
    });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/stripe/auth';
import { declineBooking } from '@/lib/stripe/gate';

/**
 * POST /api/bookings/[id]/decline
 *
 * Talent declines a booking. No Stripe gate — declining is always allowed
 * regardless of Stripe state. Body: { reason?: string }
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const { profile, supabase } = await requireAuth(['talent']);
    const { id: bookingId } = params;
    const body = await req.json().catch(() => ({}));

    const result = await declineBooking(supabase, {
      bookingId,
      talentId: profile.id,
      reason: typeof body.reason === 'string' ? body.reason : undefined,
    });

    if (!result.ok) {
      const status =
        result.reason === 'forbidden' ? 403 :
        result.reason === 'not_found' ? 404 :
        400;
      return NextResponse.json(
        { error: result.message, reason: result.reason },
        { status },
      );
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

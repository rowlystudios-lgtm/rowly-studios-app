import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/stripe/auth';
import { acceptBooking } from '@/lib/stripe/gate';

/**
 * POST /api/bookings/[id]/accept
 *
 * Talent accepts a booking. Two outcomes:
 *   - Stripe active        → 200 { status: 'confirmed' }
 *   - Stripe NOT active    → 200 { status: 'pending_stripe', graceHours, ... }
 *                            UI then redirects to /api/stripe/connect/onboarding
 *
 * The gate logic lives in lib/stripe/gate.ts so this route is thin.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const { profile, supabase } = await requireAuth(['talent']);
    const { id: bookingId } = params;

    const result = await acceptBooking(supabase, {
      bookingId,
      talentId: profile.id,
    });

    if (!result.ok) {
      const status =
        result.reason === 'forbidden' ? 403 :
        result.reason === 'not_found' ? 404 :
        400;
      return NextResponse.json(
        { error: result.message, reason: result.reason, actionUrl: result.actionUrl },
        { status },
      );
    }

    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof NextResponse) return e;
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

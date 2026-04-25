import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/stripe/auth';
import { STRIPE_MODE, stripe } from '@/lib/stripe/client';

/**
 * GET /api/stripe/_diag
 *
 * Admin-only sanity check. Returns the Stripe mode the running server
 * is using (live | test) and the connected account ID. Useful after a
 * deploy to confirm Vercel injected the right env vars.
 */
export async function GET() {
  try {
    await requireAuth(['admin']);

    const account = await stripe.accounts.retrieve();
    return NextResponse.json({
      mode: STRIPE_MODE,
      accountId: account.id,
      accountEmail: account.email,
      chargesEnabled: account.charges_enabled,
      detailsSubmitted: account.details_submitted,
      vercelEnv: process.env.VERCEL_ENV ?? null,
      nodeEnv: process.env.NODE_ENV ?? null,
    });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

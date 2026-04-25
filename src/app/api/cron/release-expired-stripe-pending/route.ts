import { NextRequest, NextResponse } from 'next/server';
import { getServiceSupabase } from '@/lib/stripe/auth';

/**
 * GET /api/cron/release-expired-stripe-pending
 *
 * Vercel Cron endpoint. Runs hourly. For every booking in 'pending_stripe'
 * whose grace_expires_at has passed, flips status → 'auto_released' and
 * fires notifications to both talent (handled by trigger) and client
 * (handled inside the SQL function).
 *
 * Auth: Vercel Cron sends a Bearer token equal to CRON_SECRET. We require
 * it on this route — no other caller should hit this endpoint.
 */
export async function GET(req: NextRequest) {
  // Verify the cron secret (Vercel Cron + manual admin invocation supported)
  const authHeader = req.headers.get('authorization') ?? '';
  const expected = `Bearer ${process.env.CRON_SECRET ?? ''}`;
  if (!process.env.CRON_SECRET || authHeader !== expected) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const supabase = getServiceSupabase();
    const { data, error } = await supabase
      .rpc('release_expired_stripe_pending_bookings');

    if (error) {
      return NextResponse.json(
        { error: 'Database error', detail: error.message },
        { status: 500 },
      );
    }

    return NextResponse.json({
      ok: true,
      releasedCount: Array.isArray(data) ? data.length : 0,
      released: data ?? [],
      timestamp: new Date().toISOString(),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

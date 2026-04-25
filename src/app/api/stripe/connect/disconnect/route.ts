import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/stripe/auth';
import { rejectConnectAccount } from '@/lib/stripe/connect';

/**
 * POST /api/stripe/connect/disconnect
 *
 * Admin-only. Used when a talent is offboarded or compromised.
 * Stripe rejects the account (no further charges possible). Funds
 * already in the account settle and pay out normally.
 *
 * Body: { talent_id: string, reason?: 'fraud' | 'terms_of_service' | 'other' }
 */
export async function POST(req: NextRequest) {
  try {
    const { supabase } = await requireAuth(['admin']);
    const body = await req.json();
    const talentId: string = body.talent_id;
    const reason: string = body.reason ?? 'other';

    if (!talentId) {
      return NextResponse.json({ error: 'talent_id required' }, { status: 400 });
    }

    const { data: talentProfile, error } = await supabase
      .from('talent_profiles')
      .select('stripe_account_id')
      .eq('id', talentId)
      .single();

    if (error || !talentProfile?.stripe_account_id) {
      return NextResponse.json({ error: 'No Stripe account on file' }, { status: 404 });
    }

    await rejectConnectAccount(talentProfile.stripe_account_id, reason);

    await supabase
      .from('talent_profiles')
      .update({
        stripe_account_status: 'rejected',
        stripe_charges_enabled: false,
        stripe_payouts_enabled: false,
        stripe_last_synced_at: new Date().toISOString(),
      })
      .eq('id', talentId);

    return NextResponse.json({ ok: true, status: 'rejected' });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/stripe/auth';
import { syncTalentStripeAccount } from '@/lib/stripe/sync';

/**
 * GET /api/stripe/connect/status
 *
 * Pulls the live state of the talent's Connect account from Stripe
 * and syncs it into talent_profiles. Used:
 *   - On return from onboarding (poll until status === 'active')
 *   - Every time talent opens the Payment Settings card
 *   - Manually by admin via the talent detail page
 *
 * Auth: talent (own account) or admin (any).
 */
export async function GET(req: NextRequest) {
  try {
    const { profile, supabase } = await requireAuth(['talent', 'admin']);

    // Admin can pass ?talent_id= to look up another talent's status
    const url = new URL(req.url);
    const queryTalentId = url.searchParams.get('talent_id');
    const talentId =
      profile.role === 'admin' && queryTalentId ? queryTalentId : profile.id;

    const { data: talentProfile, error } = await supabase
      .from('talent_profiles')
      .select('id, stripe_account_id, stripe_account_status, stripe_charges_enabled, stripe_payouts_enabled, stripe_details_submitted, stripe_requirements_due, stripe_last_synced_at')
      .eq('id', talentId)
      .single();

    if (error || !talentProfile) {
      return NextResponse.json({ error: 'Talent profile not found' }, { status: 404 });
    }

    // No account yet → return base "not connected" state
    if (!talentProfile.stripe_account_id) {
      return NextResponse.json({
        status: 'not_connected',
        chargesEnabled: false,
        payoutsEnabled: false,
        detailsSubmitted: false,
        requirementsDue: [],
      });
    }

    // Sync from Stripe
    const synced = await syncTalentStripeAccount(supabase, {
      talentId,
      stripeAccountId: talentProfile.stripe_account_id,
    });

    return NextResponse.json({
      status: synced.status,
      chargesEnabled: synced.chargesEnabled,
      payoutsEnabled: synced.payoutsEnabled,
      detailsSubmitted: synced.detailsSubmitted,
      requirementsDue: synced.requirementsDue,
      stripeAccountId: talentProfile.stripe_account_id,
    });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

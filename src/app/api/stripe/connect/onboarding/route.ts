import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/stripe/auth';
import { createConnectExpressAccount, createAccountLink } from '@/lib/stripe/connect';

/**
 * POST /api/stripe/connect/onboarding
 *
 * Creates a Connect Express account for the authenticated talent
 * (if they don't already have one), then returns a one-time hosted
 * onboarding URL. Talent completes KYC, bank account, and tax info
 * in Stripe's hosted UI, then is redirected back to the profile page.
 *
 * Profile path is configurable via NEXT_PUBLIC_PROFILE_PATH env var
 * (defaults to /app/profile). Change it in one place if the route ever moves.
 *
 * Auth: talent only.
 */
export async function POST(req: NextRequest) {
  try {
    const { profile, supabase } = await requireAuth(['talent']);

    const { data: talentProfile, error: tpErr } = await supabase
      .from('talent_profiles')
      .select('stripe_account_id, stripe_account_status')
      .eq('id', profile.id)
      .single();

    if (tpErr) {
      return NextResponse.json({ error: 'Talent profile not found' }, { status: 404 });
    }

    let stripeAccountId = talentProfile.stripe_account_id;

    if (!stripeAccountId) {
      const account = await createConnectExpressAccount({
        email: profile.email,
        fullName: profile.full_name ?? profile.email,
        talentId: profile.id,
      });
      stripeAccountId = account.id;

      const { error: updErr } = await supabase
        .from('talent_profiles')
        .update({
          stripe_account_id: stripeAccountId,
          stripe_account_status: 'pending',
          stripe_onboarding_started_at: new Date().toISOString(),
        })
        .eq('id', profile.id);

      if (updErr) {
        return NextResponse.json(
          { error: 'Saved Stripe account but failed to update profile', detail: updErr.message },
          { status: 500 },
        );
      }
    }

    const origin = req.nextUrl.origin;
    const profilePath = process.env.NEXT_PUBLIC_PROFILE_PATH ?? '/app/profile';
    const accountLink = await createAccountLink({
      accountId: stripeAccountId,
      returnUrl: `${origin}${profilePath}?stripe_return=success#payment-settings`,
      refreshUrl: `${origin}${profilePath}?stripe_return=refresh#payment-settings`,
    });

    return NextResponse.json({
      url: accountLink.url,
      expiresAt: accountLink.expires_at,
      stripeAccountId,
    });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

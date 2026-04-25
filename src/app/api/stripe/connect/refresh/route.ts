import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/stripe/auth';
import { createAccountLink, createLoginLink } from '@/lib/stripe/connect';

/**
 * POST /api/stripe/connect/refresh
 *
 * Two purposes:
 *  - mode=onboarding → Issue a fresh onboarding link if the talent's
 *    previous link expired or they need to provide more info.
 *  - mode=dashboard  → Issue an Express Dashboard login link so talent
 *    can manage their bank account, view payouts, download tax forms.
 *
 * Profile path is configurable via NEXT_PUBLIC_PROFILE_PATH env var
 * (defaults to /app/profile).
 *
 * Auth: talent only (their own account).
 */
export async function POST(req: NextRequest) {
  try {
    const { profile, supabase } = await requireAuth(['talent']);
    const { mode = 'onboarding' } = await req.json().catch(() => ({}));

    const { data: talentProfile, error } = await supabase
      .from('talent_profiles')
      .select('stripe_account_id, stripe_account_status')
      .eq('id', profile.id)
      .single();

    if (error || !talentProfile?.stripe_account_id) {
      return NextResponse.json({ error: 'No Stripe account on file' }, { status: 404 });
    }

    const origin = req.nextUrl.origin;
    const profilePath = process.env.NEXT_PUBLIC_PROFILE_PATH ?? '/app/profile';

    if (mode === 'dashboard') {
      if (talentProfile.stripe_account_status !== 'active') {
        return NextResponse.json(
          { error: 'Complete onboarding before accessing the dashboard' },
          { status: 400 },
        );
      }
      const loginLink = await createLoginLink(talentProfile.stripe_account_id);
      return NextResponse.json({ url: loginLink.url, mode: 'dashboard' });
    }

    const accountLink = await createAccountLink({
      accountId: talentProfile.stripe_account_id,
      returnUrl: `${origin}${profilePath}?stripe_return=success#payment-settings`,
      refreshUrl: `${origin}${profilePath}?stripe_return=refresh#payment-settings`,
    });

    return NextResponse.json({
      url: accountLink.url,
      mode: 'onboarding',
      expiresAt: accountLink.expires_at,
    });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

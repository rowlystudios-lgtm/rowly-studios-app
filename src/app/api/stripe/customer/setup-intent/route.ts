import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/stripe/auth';
import { findOrCreateCustomer, createSetupIntent } from '@/lib/stripe/customer';

/**
 * POST /api/stripe/customer/setup-intent
 *
 * Creates (or retrieves) a Stripe Customer for the authenticated client,
 * then returns a SetupIntent client_secret so the client can attach a
 * payment method (ACH bank account or credit card) using Stripe Elements.
 *
 * Body: { method?: 'us_bank_account' | 'card' | 'both' }   (default: 'both')
 *
 * Auth: client only.
 */
export async function POST(req: NextRequest) {
  try {
    const { profile, supabase } = await requireAuth(['client']);

    const { method = 'both' } = await req.json().catch(() => ({}));
    if (!['us_bank_account', 'card', 'both'].includes(method)) {
      return NextResponse.json({ error: 'Invalid method' }, { status: 400 });
    }

    const { data: clientProfile, error } = await supabase
      .from('client_profiles')
      .select('stripe_customer_id, company_name, billing_email')
      .eq('id', profile.id)
      .single();

    if (error) {
      return NextResponse.json({ error: 'Client profile not found' }, { status: 404 });
    }

    const customer = await findOrCreateCustomer({
      existingCustomerId: clientProfile.stripe_customer_id,
      email: clientProfile.billing_email ?? profile.email,
      name: profile.full_name ?? profile.email,
      companyName: clientProfile.company_name,
      clientProfileId: profile.id,
    });

    if (!clientProfile.stripe_customer_id) {
      await supabase
        .from('client_profiles')
        .update({ stripe_customer_id: customer.id, stripe_last_synced_at: new Date().toISOString() })
        .eq('id', profile.id);
    }

    const setupIntent = await createSetupIntent({
      customerId: customer.id,
      preferredMethod: method,
    });

    return NextResponse.json({
      clientSecret: setupIntent.client_secret,
      setupIntentId: setupIntent.id,
      customerId: customer.id,
      publishableKey: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,
    });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

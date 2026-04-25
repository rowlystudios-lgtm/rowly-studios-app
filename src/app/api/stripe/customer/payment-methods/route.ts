import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/stripe/auth';
import { listPaymentMethods } from '@/lib/stripe/customer';
import { syncClientStripeCustomer } from '@/lib/stripe/sync';

/**
 * GET /api/stripe/customer/payment-methods
 *
 * Lists every saved payment method (ACH + cards) for the client's
 * Stripe Customer. Also re-syncs the default-method snapshot
 * back to client_profiles so the UI badge stays accurate.
 *
 * Auth: client (own) or admin (any, via ?client_id=).
 */
export async function GET(req: NextRequest) {
  try {
    const { profile, supabase } = await requireAuth(['client', 'admin']);

    const url = new URL(req.url);
    const queryClientId = url.searchParams.get('client_id');
    const clientId =
      profile.role === 'admin' && queryClientId ? queryClientId : profile.id;

    const { data: clientProfile, error } = await supabase
      .from('client_profiles')
      .select('stripe_customer_id, stripe_default_payment_method_id')
      .eq('id', clientId)
      .single();

    if (error || !clientProfile?.stripe_customer_id) {
      return NextResponse.json({
        bankAccounts: [],
        cards: [],
        defaultPaymentMethodId: null,
      });
    }

    const { bankAccounts, cards } = await listPaymentMethods(
      clientProfile.stripe_customer_id,
    );

    // Refresh the snapshot in client_profiles
    await syncClientStripeCustomer(supabase, {
      clientId,
      stripeCustomerId: clientProfile.stripe_customer_id,
      defaultPaymentMethodId: clientProfile.stripe_default_payment_method_id,
    });

    return NextResponse.json({
      bankAccounts: bankAccounts.map((pm) => ({
        id: pm.id,
        type: pm.type,
        bankName: pm.us_bank_account?.bank_name ?? null,
        last4: pm.us_bank_account?.last4 ?? null,
        accountType: pm.us_bank_account?.account_type ?? null,
        isDefault: pm.id === clientProfile.stripe_default_payment_method_id,
      })),
      cards: cards.map((pm) => ({
        id: pm.id,
        type: pm.type,
        brand: pm.card?.brand ?? null,
        last4: pm.card?.last4 ?? null,
        expMonth: pm.card?.exp_month ?? null,
        expYear: pm.card?.exp_year ?? null,
        isDefault: pm.id === clientProfile.stripe_default_payment_method_id,
      })),
      defaultPaymentMethodId: clientProfile.stripe_default_payment_method_id,
    });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/**
 * POST /api/stripe/customer/payment-methods
 * Body: { paymentMethodId: string, makeDefault?: boolean }
 *
 * Set a payment method as default. Used after the SetupIntent succeeds
 * to mark the new method as the client's default for invoice charges.
 */
export async function POST(req: NextRequest) {
  try {
    const { profile, supabase } = await requireAuth(['client']);
    const body = await req.json();
    const paymentMethodId: string = body.paymentMethodId;

    if (!paymentMethodId) {
      return NextResponse.json({ error: 'paymentMethodId required' }, { status: 400 });
    }

    const { data: clientProfile } = await supabase
      .from('client_profiles')
      .select('stripe_customer_id')
      .eq('id', profile.id)
      .single();

    if (!clientProfile?.stripe_customer_id) {
      return NextResponse.json({ error: 'No Stripe customer on file' }, { status: 404 });
    }

    const { setDefaultPaymentMethod } = await import('@/lib/stripe/customer');
    await setDefaultPaymentMethod(clientProfile.stripe_customer_id, paymentMethodId);

    await syncClientStripeCustomer(supabase, {
      clientId: profile.id,
      stripeCustomerId: clientProfile.stripe_customer_id,
      defaultPaymentMethodId: paymentMethodId,
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

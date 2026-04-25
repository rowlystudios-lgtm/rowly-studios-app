import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/stripe/auth';
import { detachPaymentMethod } from '@/lib/stripe/customer';
import { syncClientStripeCustomer } from '@/lib/stripe/sync';

/**
 * DELETE /api/stripe/customer/payment-methods/[id]
 *
 * Detach a saved payment method from the client's Stripe Customer.
 * If it was the default, sync clears the default snapshot in Supabase.
 *
 * Auth: client (own).
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { profile, supabase } = await requireAuth(['client']);
    const { id: paymentMethodId } = await params;

    if (!paymentMethodId) {
      return NextResponse.json({ error: 'Payment method id required' }, { status: 400 });
    }

    const { data: clientProfile } = await supabase
      .from('client_profiles')
      .select('stripe_customer_id, stripe_default_payment_method_id')
      .eq('id', profile.id)
      .single();

    if (!clientProfile?.stripe_customer_id) {
      return NextResponse.json({ error: 'No Stripe customer on file' }, { status: 404 });
    }

    await detachPaymentMethod(paymentMethodId);

    // If we just removed the default, clear it in Supabase
    if (clientProfile.stripe_default_payment_method_id === paymentMethodId) {
      await syncClientStripeCustomer(supabase, {
        clientId: profile.id,
        stripeCustomerId: clientProfile.stripe_customer_id,
        defaultPaymentMethodId: null,
      });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

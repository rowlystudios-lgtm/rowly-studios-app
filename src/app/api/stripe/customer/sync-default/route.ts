import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe/client';
import { requireAuth } from '@/lib/stripe/auth';

/**
 * POST /api/stripe/customer/sync-default
 *
 * Reads the authenticated client's Stripe Customer state (or admin-targeted
 * client's, if clientId is in body) and writes the current default payment
 * method into client_profiles.stripe_default_payment_method_*.
 *
 * Why this exists: Phase A+B's setDefaultPaymentMethod helper only persists
 * to the DB when the user manually clicks "Set default" in the panel. But
 * Stripe Checkout auto-sets the new method as default at the Stripe level,
 * with no UI event to trigger the DB write. Result: Stripe knows the
 * default, our DB doesn't, and the invoice gate blocks.
 *
 * This endpoint is the canonical reconcile-from-Stripe operation.
 *
 * Auth:
 *   - client: syncs own row
 *   - admin:  syncs any client's row (pass clientId in body)
 *
 * Returns: { synced: true, paymentMethod: { id, type, last4, brand } | null }
 */
export async function POST(req: NextRequest) {
  try {
    const { profile, supabase } = await requireAuth(['client', 'admin']);
    const body = await req.json().catch(() => ({}));

    const targetClientId =
      profile.role === 'admin' && typeof body.clientId === 'string'
        ? body.clientId
        : profile.id;

    // 1. Look up our local row to find the Stripe customer ID
    const { data: clientRow, error: rowErr } = await supabase
      .from('client_profiles')
      .select('id, stripe_customer_id')
      .eq('id', targetClientId)
      .single();

    if (rowErr || !clientRow) {
      return NextResponse.json(
        { error: 'Client profile not found' },
        { status: 404 },
      );
    }

    if (!clientRow.stripe_customer_id) {
      return NextResponse.json(
        { error: 'No Stripe customer linked. Run setup-checkout-session first.' },
        { status: 400 },
      );
    }

    // 2. Fetch the customer from Stripe — invoice_settings.default_payment_method
    //    is where Stripe records the customer-level default. This is what
    //    Checkout sets automatically on completion of a setup session.
    const customer = await stripe.customers.retrieve(clientRow.stripe_customer_id);

    if (customer.deleted) {
      return NextResponse.json(
        { error: 'Stripe customer has been deleted' },
        { status: 410 },
      );
    }

    const invoiceSettings = customer.invoice_settings;
    const defaultPmRef = invoiceSettings?.default_payment_method;
    const defaultPmId =
      typeof defaultPmRef === 'string' ? defaultPmRef : defaultPmRef?.id ?? null;

    // 3. If no default is set, also check whether there's a single PM on the
    //    customer — if so, treat it as default (this is how Stripe Checkout
    //    behaves with mode='setup' and a single new method).
    let pmIdToUse = defaultPmId;
    if (!pmIdToUse) {
      const pms = await stripe.paymentMethods.list({
        customer: clientRow.stripe_customer_id,
        limit: 10,
      });
      if (pms.data.length === 1) {
        pmIdToUse = pms.data[0].id;
        // Also write back to Stripe so future calls see the same default
        await stripe.customers.update(clientRow.stripe_customer_id, {
          invoice_settings: { default_payment_method: pmIdToUse },
        });
      }
    }

    // 4. If we still have no payment method, clear our DB columns
    if (!pmIdToUse) {
      await supabase
        .from('client_profiles')
        .update({
          stripe_default_payment_method_id: null,
          stripe_default_payment_method_type: null,
          stripe_default_payment_method_last4: null,
          stripe_default_payment_method_brand: null,
          stripe_last_synced_at: new Date().toISOString(),
        })
        .eq('id', targetClientId);
      return NextResponse.json({ synced: true, paymentMethod: null });
    }

    // 5. Fetch the PM details (type, last4, brand) and persist to DB
    const pm = await stripe.paymentMethods.retrieve(pmIdToUse);

    const last4 =
      pm.type === 'us_bank_account' ? pm.us_bank_account?.last4 ?? null :
      pm.type === 'card' ? pm.card?.last4 ?? null :
      null;
    const brand =
      pm.type === 'us_bank_account' ? pm.us_bank_account?.bank_name ?? null :
      pm.type === 'card' ? pm.card?.brand ?? null :
      null;

    const { error: updErr } = await supabase
      .from('client_profiles')
      .update({
        stripe_default_payment_method_id: pm.id,
        stripe_default_payment_method_type: pm.type,
        stripe_default_payment_method_last4: last4,
        stripe_default_payment_method_brand: brand,
        stripe_last_synced_at: new Date().toISOString(),
      })
      .eq('id', targetClientId);

    if (updErr) {
      return NextResponse.json(
        { error: 'Failed to persist sync: ' + updErr.message },
        { status: 500 },
      );
    }

    return NextResponse.json({
      synced: true,
      paymentMethod: {
        id: pm.id,
        type: pm.type,
        last4,
        brand,
      },
    });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

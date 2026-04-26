import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe/client';
import { requireAuth } from '@/lib/stripe/auth';
import { findOrCreateCustomer } from '@/lib/stripe/customer';

/**
 * POST /api/stripe/customer/setup-checkout-session
 *
 * Creates a Stripe Checkout Session in 'setup' mode (no payment, just
 * collecting + saving a payment method to the client's Customer object).
 *
 * The client gets redirected to checkout.stripe.com where they enter
 * their details on Stripe's hosted, branded form. After completion,
 * Stripe redirects them back to our app's /app/account page.
 *
 * This replaces the in-app StripeAddPaymentMethodModal flow because:
 *   1. URL bar shows checkout.stripe.com — much higher trust signal
 *   2. Financial Connections (bank login) is built-in for ACH
 *   3. Apple Pay / Google Pay / Link all supported automatically
 *   4. Reduces our PCI scope further (we never render the card form)
 *
 * Auth: client + admin can call this (admin can do it on a client's
 * behalf if they're impersonating, or for self-add).
 */
export async function POST(req: NextRequest) {
  try {
    const { profile, supabase } = await requireAuth(['client', 'admin']);

    // Determine which client we're setting up. For client role, it's
    // themselves. For admin, accept clientId in body (impersonation).
    const body = await req.json().catch(() => ({}));
    const targetClientId =
      profile.role === 'admin' && typeof body.clientId === 'string'
        ? body.clientId
        : profile.id;

    // Get or create the Stripe Customer for this client
    const customerResult = await findOrCreateCustomer(supabase, targetClientId);
    if (!customerResult.ok) {
      return NextResponse.json(
        { error: customerResult.message },
        { status: 400 },
      );
    }

    // Build the return URLs. Use the request origin so this works
    // identically on prod, preview, and local dev.
    const origin = req.headers.get('origin') ?? new URL(req.url).origin;
    const accountPath = process.env.NEXT_PUBLIC_ACCOUNT_PATH ?? '/app/account';

    // Create the Checkout Session in 'setup' mode
    const session = await stripe.checkout.sessions.create({
      mode: 'setup',
      customer: customerResult.customerId,

      // Both card AND bank account. ACH gets Financial Connections (bank
      // login) automatically — no routing/account number typing required.
      payment_method_types: ['card', 'us_bank_account'],

      payment_method_options: {
        us_bank_account: {
          // 'instant_or_skip' = Financial Connections instant verification,
          // falling back to micro-deposits if the bank isn't supported.
          // 'instant' = Financial Connections only (rejects unsupported banks).
          // 'instant_or_skip' is the most user-friendly default.
          verification_method: 'instant_or_skip',
          financial_connections: {
            permissions: ['payment_method'],
          },
        },
      },

      // What Stripe is asking the user for (shown on the hosted page)
      payment_method_data: {
        allow_redisplay: 'always',
      },

      success_url:
        `${origin}${accountPath}?stripe_setup=success` +
        `&session_id={CHECKOUT_SESSION_ID}#payment-settings`,
      cancel_url: `${origin}${accountPath}?stripe_setup=cancelled#payment-settings`,

      // Metadata for our records
      metadata: {
        rs_client_id: targetClientId,
        rs_action: 'add_payment_method',
        rs_initiator_role: profile.role,
        rs_initiator_id: profile.id,
      },
    });

    if (!session.url) {
      return NextResponse.json(
        { error: 'Stripe did not return a checkout URL' },
        { status: 500 },
      );
    }

    return NextResponse.json({ url: session.url, sessionId: session.id });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

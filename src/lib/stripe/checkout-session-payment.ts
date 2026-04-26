import type Stripe from 'stripe';
import { stripe } from './client';
import type { StripePaymentMethodType } from './config';

/**
 * Creates a Stripe Checkout Session in 'payment' mode for a single invoice.
 *
 * Why Checkout Sessions instead of Payment Links:
 *   - Single-use (more secure for invoices than reusable Payment Link URLs)
 *   - Tied to a specific saved customer
 *   - Pre-fills the customer's saved payment method (bank or card)
 *   - Same checkout.session.completed webhook surface
 *
 * The returned URL is what we embed in the "Pay with Stripe" button in the
 * invoice email. When clicked, takes the client to a Stripe-hosted page
 * with their saved bank already selected — one-click pay.
 */

export interface CheckoutSessionParams {
  customerId: string;
  /** Single line item — the consolidated total. */
  amountCents: number;
  /** Description shown on Stripe Checkout */
  description: string;
  /** Customer's preferred payment method type (orders the Checkout PM list). */
  preferredPaymentMethodType: StripePaymentMethodType;
  /** Where Stripe sends the user on success/cancel. */
  successUrl: string;
  cancelUrl: string;
  /** Metadata for tracking — must include rs_invoice_id for webhook matching. */
  metadata: {
    rs_invoice_id: string;
    rs_job_id: string;
    rs_client_id: string;
    [key: string]: string;
  };
  /** Optional invoice number for display on Stripe Checkout */
  invoiceNumber?: string;
}

export async function createInvoiceCheckoutSession(
  params: CheckoutSessionParams,
): Promise<{ url: string; sessionId: string }> {
  // Order payment_method_types so the customer's saved type appears first.
  const paymentMethodTypes: Stripe.Checkout.SessionCreateParams.PaymentMethodType[] =
    params.preferredPaymentMethodType === 'us_bank_account'
      ? ['us_bank_account', 'card']
      : ['card', 'us_bank_account'];

  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    customer: params.customerId,
    payment_method_types: paymentMethodTypes,

    // Single line item with the total. Description appears on the Checkout page.
    line_items: [
      {
        price_data: {
          currency: 'usd',
          unit_amount: params.amountCents,
          product_data: {
            name: params.invoiceNumber
              ? `Rowly Studios — ${params.invoiceNumber}`
              : 'Rowly Studios — Invoice',
            description: params.description,
          },
        },
        quantity: 1,
      },
    ],

    // ACH-specific options: instant verification when supported, falling back
    // to micro-deposits. (We're not setting verification_method here because
    // the customer already has a verified PM from setup-intent flow.)
    payment_method_options: {
      us_bank_account: {
        // Use existing payment method only — don't re-verify
        verification_method: 'instant',
      },
    },

    success_url: params.successUrl,
    cancel_url: params.cancelUrl,

    metadata: params.metadata,

    // Tag the underlying PaymentIntent metadata too — webhook handler
    // checks this when processing payment_intent.succeeded.
    payment_intent_data: {
      metadata: params.metadata,
      description: params.description,
      // Use the saved default payment method from the customer
      setup_future_usage: 'off_session',
    },
  });

  if (!session.url) {
    throw new Error('Stripe did not return a checkout URL');
  }

  return { url: session.url, sessionId: session.id };
}

/**
 * Stripe fee math for the RS APP.
 *
 * Pricing model:
 *   - Talent fee = the gross negotiated rate paid to talent
 *   - Rowly Studios fee = 15% of talent fee (platform `application_fee_amount`)
 *   - Stripe processing fee = passed to client as a separate line item
 *
 * The client sees three line items on every invoice:
 *   1. Talent fee:                 $X
 *   2. Rowly Studios service fee:  15% × $X
 *   3. Payment processing fee:     ACH (~$5 cap) or Card (~2.9% + $0.30)
 *
 * The actual Stripe charge equals the sum of all three. Application fee
 * locks in the 15% atomically inside Stripe.
 */

export type StripePaymentMethodType = 'us_bank_account' | 'card';

// ---- Fee constants (kept in sync with admin_settings table) ----------------
export const RS_FEE_PERCENT = 0.15;

// Stripe US fees as of 2026. Update if Stripe changes pricing.
export const ACH_FEE_BPS = 80;          // 0.8%
export const ACH_FEE_CAP_CENTS = 500;   // $5.00 cap

export const CARD_FEE_BPS = 290;        // 2.9%
export const CARD_FEE_FIXED_CENTS = 30; // $0.30

// ---- Calculations ----------------------------------------------------------
export interface InvoiceBreakdown {
  /** Gross talent fee in cents (what talent will receive). */
  talentFeeCents: number;
  /** Rowly Studios platform fee in cents (15% of talent fee). */
  rsFeeCents: number;
  /** Subtotal before Stripe processing fee. */
  subtotalCents: number;
  /** Stripe processing fee in cents (passed to client). */
  stripeFeeCents: number;
  /** Total client pays. Equals charge amount on PaymentIntent. */
  clientTotalCents: number;
  /** Application fee on PaymentIntent: rsFee + stripeFee (so RS nets 15% after Stripe deducts). */
  applicationFeeAmountCents: number;
  /** Payment method this breakdown was calculated for. */
  paymentMethodType: StripePaymentMethodType;
}

/**
 * Compute the client's total when paying via ACH.
 * ACH is a flat 0.8% capped at $5.
 */
export function calculateAchBreakdown(talentFeeCents: number): InvoiceBreakdown {
  const rsFeeCents = Math.round(talentFeeCents * RS_FEE_PERCENT);
  const subtotalCents = talentFeeCents + rsFeeCents;
  const stripeFeeCents = Math.min(
    Math.round((subtotalCents * ACH_FEE_BPS) / 10_000),
    ACH_FEE_CAP_CENTS,
  );
  const clientTotalCents = subtotalCents + stripeFeeCents;
  return {
    talentFeeCents,
    rsFeeCents,
    subtotalCents,
    stripeFeeCents,
    clientTotalCents,
    applicationFeeAmountCents: rsFeeCents + stripeFeeCents,
    paymentMethodType: 'us_bank_account',
  };
}

/**
 * Compute the client's total when paying via credit card.
 * Card is 2.9% + $0.30 on the GROSS charge — requires gross-up math
 * so RS still nets 15% and talent still gets the agreed fee.
 *
 * gross = (subtotal + 0.30) / (1 - 0.029)
 */
export function calculateCardBreakdown(talentFeeCents: number): InvoiceBreakdown {
  const rsFeeCents = Math.round(talentFeeCents * RS_FEE_PERCENT);
  const subtotalCents = talentFeeCents + rsFeeCents;

  // Gross-up: solve for clientTotal where (clientTotal - 2.9% × clientTotal - 30) = subtotal
  const grossCents =
    (subtotalCents + CARD_FEE_FIXED_CENTS) /
    (1 - CARD_FEE_BPS / 10_000);
  const clientTotalCents = Math.ceil(grossCents); // round up so RS never loses pennies
  const stripeFeeCents = clientTotalCents - subtotalCents;

  return {
    talentFeeCents,
    rsFeeCents,
    subtotalCents,
    stripeFeeCents,
    clientTotalCents,
    applicationFeeAmountCents: rsFeeCents + stripeFeeCents,
    paymentMethodType: 'card',
  };
}

export function calculateBreakdown(
  talentFeeCents: number,
  paymentMethodType: StripePaymentMethodType,
): InvoiceBreakdown {
  return paymentMethodType === 'us_bank_account'
    ? calculateAchBreakdown(talentFeeCents)
    : calculateCardBreakdown(talentFeeCents);
}

// ---- Format helpers --------------------------------------------------------
export function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export function describePaymentMethod(type: StripePaymentMethodType): string {
  return type === 'us_bank_account' ? 'Bank transfer (ACH)' : 'Credit card';
}

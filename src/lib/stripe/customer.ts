import { stripe } from './client';
import type Stripe from 'stripe';

/**
 * Create or update a Stripe Customer for an RS APP client.
 * One Customer per client_profile. Reused for every job invoice.
 */
export async function findOrCreateCustomer(params: {
  existingCustomerId: string | null;
  email: string;
  name: string;
  clientProfileId: string;
  companyName?: string | null;
}): Promise<Stripe.Customer> {
  if (params.existingCustomerId) {
    // Verify the customer still exists & is not deleted
    const existing = await stripe.customers.retrieve(params.existingCustomerId);
    if (!('deleted' in existing) || !existing.deleted) {
      return existing as Stripe.Customer;
    }
  }

  return stripe.customers.create({
    email: params.email,
    name: params.name,
    description: params.companyName
      ? `RS APP client — ${params.companyName}`
      : 'RS APP client',
    metadata: {
      client_profile_id: params.clientProfileId,
      source: 'rs_app',
    },
  });
}

/**
 * Create a SetupIntent so the client can save a payment method
 * (ACH or card) to their Customer for future invoice charges.
 *
 * payment_method_types ordering matters — `us_bank_account` first
 * makes ACH the visually-default option in the Payment Element.
 */
export async function createSetupIntent(params: {
  customerId: string;
  preferredMethod: 'us_bank_account' | 'card' | 'both';
}): Promise<Stripe.SetupIntent> {
  const types: Array<'us_bank_account' | 'card'> =
    params.preferredMethod === 'card'
      ? ['card']
      : params.preferredMethod === 'us_bank_account'
      ? ['us_bank_account']
      : ['us_bank_account', 'card'];

  return stripe.setupIntents.create({
    customer: params.customerId,
    payment_method_types: types,
    usage: 'off_session', // We'll charge them later when invoicing
    payment_method_options: {
      us_bank_account: {
        financial_connections: { permissions: ['payment_method', 'balances'] },
        verification_method: 'instant',
      },
    },
    metadata: { source: 'rs_app_payment_settings' },
  });
}

/**
 * List all saved payment methods for a Customer.
 * Returns ACH bank accounts and cards merged into a single list.
 */
export async function listPaymentMethods(customerId: string): Promise<{
  bankAccounts: Stripe.PaymentMethod[];
  cards: Stripe.PaymentMethod[];
}> {
  const [bankAccounts, cards] = await Promise.all([
    stripe.paymentMethods.list({ customer: customerId, type: 'us_bank_account', limit: 10 }),
    stripe.paymentMethods.list({ customer: customerId, type: 'card', limit: 10 }),
  ]);
  return { bankAccounts: bankAccounts.data, cards: cards.data };
}

/**
 * Detach a payment method from a Customer. Used when client removes
 * a saved bank account or card from their profile.
 */
export async function detachPaymentMethod(paymentMethodId: string): Promise<Stripe.PaymentMethod> {
  return stripe.paymentMethods.detach(paymentMethodId);
}

/**
 * Set the default payment method for the Customer's invoices.
 */
export async function setDefaultPaymentMethod(
  customerId: string,
  paymentMethodId: string,
): Promise<Stripe.Customer> {
  return stripe.customers.update(customerId, {
    invoice_settings: { default_payment_method: paymentMethodId },
  });
}

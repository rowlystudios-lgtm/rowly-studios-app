import type Stripe from 'stripe';
import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchConnectAccount, deriveAccountStatus } from './connect';

/**
 * Refresh a talent's Stripe account state from the live Stripe API.
 * Called after onboarding return, or by the status endpoint on demand.
 *
 * Updates: stripe_account_status, charges_enabled, payouts_enabled,
 * details_submitted, requirements_due, last_synced_at.
 */
export async function syncTalentStripeAccount(
  supabase: SupabaseClient,
  params: { talentId: string; stripeAccountId: string },
): Promise<{
  status: string;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
  requirementsDue: string[];
  account: Stripe.Account;
}> {
  const account = await fetchConnectAccount(params.stripeAccountId);
  const derived = deriveAccountStatus(account);
  const requirementsDue = (account.requirements?.currently_due ?? []) as string[];

  const completedAtUpdate =
    derived === 'active'
      ? { stripe_onboarding_completed_at: new Date().toISOString() }
      : {};

  const { error } = await supabase
    .from('talent_profiles')
    .update({
      stripe_account_status: derived,
      stripe_charges_enabled: account.charges_enabled ?? false,
      stripe_payouts_enabled: account.payouts_enabled ?? false,
      stripe_details_submitted: account.details_submitted ?? false,
      stripe_requirements_due: requirementsDue,
      stripe_last_synced_at: new Date().toISOString(),
      ...completedAtUpdate,
    })
    .eq('id', params.talentId);

  if (error) throw error;

  return {
    status: derived,
    chargesEnabled: account.charges_enabled ?? false,
    payoutsEnabled: account.payouts_enabled ?? false,
    detailsSubmitted: account.details_submitted ?? false,
    requirementsDue,
    account,
  };
}

/**
 * Refresh a client's saved Stripe Customer + default payment method into Supabase.
 * Called after SetupIntent succeeds, or on demand from the client profile page.
 */
export async function syncClientStripeCustomer(
  supabase: SupabaseClient,
  params: {
    clientId: string;
    stripeCustomerId: string;
    defaultPaymentMethodId?: string | null;
  },
): Promise<void> {
  // Lazy require to avoid pulling stripe client when Supabase-only callers import
  const { stripe } = await import('./client');

  const customer = await stripe.customers.retrieve(params.stripeCustomerId);
  if ('deleted' in customer && customer.deleted) {
    throw new Error('Stripe Customer has been deleted');
  }
  const c = customer as Stripe.Customer;
  const pmId =
    params.defaultPaymentMethodId
    ?? (typeof c.invoice_settings?.default_payment_method === 'string'
        ? c.invoice_settings.default_payment_method
        : c.invoice_settings?.default_payment_method?.id)
    ?? null;

  let pmType: string | null = null;
  let pmLast4: string | null = null;
  let pmBrand: string | null = null;

  if (pmId) {
    const pm = await stripe.paymentMethods.retrieve(pmId);
    pmType = pm.type;
    if (pm.type === 'card' && pm.card) {
      pmLast4 = pm.card.last4;
      pmBrand = pm.card.brand;
    } else if (pm.type === 'us_bank_account' && pm.us_bank_account) {
      pmLast4 = pm.us_bank_account.last4 ?? null;
      pmBrand = pm.us_bank_account.bank_name ?? null;
    }
  }

  const { error } = await supabase
    .from('client_profiles')
    .update({
      stripe_default_payment_method_id: pmId,
      stripe_default_payment_method_type: pmType,
      stripe_default_payment_method_last4: pmLast4,
      stripe_default_payment_method_brand: pmBrand,
      stripe_payment_setup_completed_at: pmId ? new Date().toISOString() : null,
      stripe_last_synced_at: new Date().toISOString(),
    })
    .eq('id', params.clientId);

  if (error) throw error;
}

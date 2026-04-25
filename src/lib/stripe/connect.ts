import { stripe } from './client';
import type Stripe from 'stripe';

/**
 * Create a Stripe Connect Express account for talent.
 * Express = Stripe-hosted onboarding & dashboard, RS controls payouts.
 *
 * The talent's email seeds the onboarding form; everything else
 * (legal name, SSN, bank account) is collected by Stripe directly.
 */
export async function createConnectExpressAccount(params: {
  email: string;
  fullName: string;
  talentId: string;
}): Promise<Stripe.Account> {
  return stripe.accounts.create({
    type: 'express',
    country: 'US',
    email: params.email,
    capabilities: {
      transfers: { requested: true },
    },
    business_type: 'individual',
    business_profile: {
      product_description: 'Creative production services through Rowly Studios',
      mcc: '7929', // Bands, Orchestras & Misc Entertainers — fits creative talent
    },
    settings: {
      payouts: {
        schedule: { interval: 'daily', delay_days: 'minimum' },
      },
    },
    metadata: {
      talent_profile_id: params.talentId,
      created_by: 'rs_app',
    },
  });
}

/**
 * Generate a one-time onboarding URL for talent to complete KYC.
 * Stripe collects all required info; we get a callback when done.
 */
export async function createAccountLink(params: {
  accountId: string;
  returnUrl: string;
  refreshUrl: string;
}): Promise<Stripe.AccountLink> {
  return stripe.accountLinks.create({
    account: params.accountId,
    refresh_url: params.refreshUrl,
    return_url: params.returnUrl,
    type: 'account_onboarding',
    collection_options: {
      fields: 'currently_due',
      future_requirements: 'omit',
    },
  });
}

/**
 * Generate a one-time login link to talent's Express dashboard.
 * Used for "Manage account" button after onboarding is complete.
 */
export async function createLoginLink(accountId: string): Promise<Stripe.LoginLink> {
  return stripe.accounts.createLoginLink(accountId);
}

/**
 * Pull the live state of a Connect account from Stripe.
 * Use this to refresh stripe_account_status in Supabase.
 */
export async function fetchConnectAccount(accountId: string): Promise<Stripe.Account> {
  return stripe.accounts.retrieve(accountId);
}

/**
 * Map a live Stripe Account object to our stripe_account_status enum.
 *
 *   not_connected → no account yet
 *   pending       → account created, onboarding incomplete
 *   active        → charges + payouts both enabled
 *   restricted    → account exists but Stripe is holding payouts (more info needed)
 *   rejected      → Stripe rejected the account (banned, fraud, etc.)
 *   disabled      → manually disabled by RS admin
 */
export function deriveAccountStatus(account: Stripe.Account):
  | 'pending' | 'active' | 'restricted' | 'rejected' {
  if (account.requirements?.disabled_reason) {
    if (account.requirements.disabled_reason.startsWith('rejected')) return 'rejected';
    return 'restricted';
  }
  if (account.charges_enabled && account.payouts_enabled && account.details_submitted) {
    return 'active';
  }
  return 'pending';
}

/**
 * Disconnect a Connect account. Only used when:
 *   - Talent is offboarded
 *   - Admin marks the account as compromised
 *
 * Stripe Connect accounts cannot be hard-deleted while there's a
 * non-zero balance, so we deauthorize and let it settle naturally.
 */
export async function rejectConnectAccount(accountId: string, reason = 'other'): Promise<Stripe.Account> {
  return stripe.accounts.reject(accountId, { reason });
}

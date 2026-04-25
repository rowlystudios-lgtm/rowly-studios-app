import Stripe from 'stripe';

if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error('STRIPE_SECRET_KEY is not set');
}

// =============================================================================
// Mode-mismatch guardrail
// =============================================================================
// Refuses to start the server when the Stripe key mode doesn't match the
// runtime environment. Catches the worst-case mistakes:
//   1. sk_live_... key landing in a dev/preview deploy → can charge real cards
//   2. sk_test_... key landing in production           → real clients see broken pay
//
// Override only when explicitly needed (e.g., live-mode local QA before launch):
//   STRIPE_ALLOW_MODE_MISMATCH=true
// =============================================================================

const SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const IS_LIVE_KEY = SECRET_KEY.startsWith('sk_live_');
const IS_TEST_KEY = SECRET_KEY.startsWith('sk_test_');
const NODE_ENV = process.env.NODE_ENV ?? 'development';
const VERCEL_ENV = process.env.VERCEL_ENV; // 'production' | 'preview' | 'development' | undefined
const IS_PROD_RUNTIME = VERCEL_ENV === 'production' || (NODE_ENV === 'production' && !VERCEL_ENV);
const ALLOW_OVERRIDE = process.env.STRIPE_ALLOW_MODE_MISMATCH === 'true';

if (!IS_LIVE_KEY && !IS_TEST_KEY) {
  throw new Error(
    'STRIPE_SECRET_KEY must start with sk_live_ or sk_test_. ' +
    'Got something else — check your env vars.',
  );
}

if (IS_LIVE_KEY && !IS_PROD_RUNTIME && !ALLOW_OVERRIDE) {
  throw new Error(
    '[Stripe guardrail] LIVE secret key (sk_live_...) detected in a non-production ' +
    `environment (NODE_ENV=${NODE_ENV}, VERCEL_ENV=${VERCEL_ENV ?? 'unset'}). ` +
    'Refusing to start. This protects against accidentally charging real cards from dev/preview. ' +
    'Use a sk_test_... key here, or set STRIPE_ALLOW_MODE_MISMATCH=true if you know what you are doing.',
  );
}

if (IS_TEST_KEY && IS_PROD_RUNTIME && !ALLOW_OVERRIDE) {
  throw new Error(
    '[Stripe guardrail] TEST secret key (sk_test_...) detected in production ' +
    `(VERCEL_ENV=${VERCEL_ENV}). Refusing to start. ` +
    'Real clients would see broken payment flows. Set the production env var to a sk_live_... key.',
  );
}

// Same check for the publishable key — wrong publishable key in browser leaks too.
const PUB_KEY = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
if (PUB_KEY) {
  const PUB_IS_LIVE = PUB_KEY.startsWith('pk_live_');
  const PUB_IS_TEST = PUB_KEY.startsWith('pk_test_');
  if ((PUB_IS_LIVE || PUB_IS_TEST) && PUB_IS_LIVE !== IS_LIVE_KEY) {
    throw new Error(
      '[Stripe guardrail] STRIPE_SECRET_KEY and NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ' +
      'are in different modes (one live, one test). They must match.',
    );
  }
}

// =============================================================================
// Stripe client singleton
// =============================================================================

/**
 * Server-side Stripe SDK singleton for the Rowly Studios platform account.
 * Use this for ALL platform-level operations: creating Connect accounts,
 * Customers, PaymentIntents (with application_fee_amount), webhooks, etc.
 *
 * Never import this in client components — it must stay server-side.
 */
export const stripe = new Stripe(SECRET_KEY, {
  apiVersion: '2025-02-24.acacia',
  typescript: true,
  appInfo: {
    name: 'Rowly Studios App',
    version: '1.0.0',
  },
});

export const STRIPE_PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!;
export const STRIPE_PLATFORM_ACCOUNT_ID = process.env.STRIPE_PLATFORM_ACCOUNT_ID!;
export const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET!;

/** Helpful for logs / admin diagnostics. */
export const STRIPE_MODE: 'live' | 'test' = IS_LIVE_KEY ? 'live' : 'test';

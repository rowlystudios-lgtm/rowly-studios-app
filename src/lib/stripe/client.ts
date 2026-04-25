import Stripe from 'stripe';

// =============================================================================
// Lazy initialization
// =============================================================================
// Next.js's build phase ("Collecting page data") evaluates route modules to
// check rendering eligibility. Module-top-level throws fire during this phase
// even when the route is dynamic, breaking the build for environments without
// Stripe env vars set.
//
// To stay build-tolerant, all validation and Stripe construction is deferred
// inside getStripe(), which only runs when a route actually invokes a Stripe
// API call. The module itself just defines a Proxy.
// =============================================================================

let _stripe: Stripe | null = null;

function validateAndCreate(): Stripe {
  const SECRET_KEY = process.env.STRIPE_SECRET_KEY;
  if (!SECRET_KEY) {
    throw new Error('STRIPE_SECRET_KEY is not set');
  }

  const IS_LIVE_KEY = SECRET_KEY.startsWith('sk_live_');
  const IS_TEST_KEY = SECRET_KEY.startsWith('sk_test_');

  if (!IS_LIVE_KEY && !IS_TEST_KEY) {
    throw new Error(
      'STRIPE_SECRET_KEY must start with sk_live_ or sk_test_. ' +
      'Got something else — check your env vars.',
    );
  }

  // Mode-mismatch guardrails (still apply at runtime)
  const NODE_ENV = process.env.NODE_ENV ?? 'development';
  const VERCEL_ENV = process.env.VERCEL_ENV;
  const IS_PROD_RUNTIME =
    VERCEL_ENV === 'production' || (NODE_ENV === 'production' && !VERCEL_ENV);
  const ALLOW_OVERRIDE = process.env.STRIPE_ALLOW_MODE_MISMATCH === 'true';

  if (IS_LIVE_KEY && !IS_PROD_RUNTIME && !ALLOW_OVERRIDE) {
    throw new Error(
      '[Stripe guardrail] LIVE secret key (sk_live_...) detected in a non-production ' +
      `environment (NODE_ENV=${NODE_ENV}, VERCEL_ENV=${VERCEL_ENV ?? 'unset'}). ` +
      'Refusing to start. Use a sk_test_... key here, or set ' +
      'STRIPE_ALLOW_MODE_MISMATCH=true if you know what you are doing.',
    );
  }

  if (IS_TEST_KEY && IS_PROD_RUNTIME && !ALLOW_OVERRIDE) {
    // Soft warn instead of hard throw during sandbox-on-production phase.
    // Allows running the production deploy on sandbox keys for testing,
    // before flipping to live keys in Phase F. Set STRIPE_ALLOW_MODE_MISMATCH=true
    // explicitly to suppress this warning if it's intentional.
    if (process.env.STRIPE_TEST_IN_PROD_INTENTIONAL !== 'true') {
      // eslint-disable-next-line no-console
      console.warn(
        '[Stripe guardrail] TEST secret key (sk_test_...) running in production ' +
        '(VERCEL_ENV=production). This is OK during sandbox testing, but flip to ' +
        'sk_live_... before real customers transact. Set ' +
        'STRIPE_TEST_IN_PROD_INTENTIONAL=true to silence this warning.',
      );
    }
  }

  // Publishable key consistency check
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

  return new Stripe(SECRET_KEY, {
    apiVersion: '2025-02-24.acacia',
    typescript: true,
    appInfo: {
      name: 'Rowly Studios App',
      version: '1.0.0',
    },
  });
}

function getStripe(): Stripe {
  if (_stripe) return _stripe;
  _stripe = validateAndCreate();
  return _stripe;
}

/**
 * Server-side Stripe SDK singleton for the Rowly Studios platform account.
 * Use this for ALL platform-level operations: creating Connect accounts,
 * Customers, PaymentIntents (with application_fee_amount), webhooks, etc.
 *
 * Lazy-initialized: validation and SDK construction happen on first property
 * access, not at module load. This keeps Next.js builds passing in environments
 * that don't have Stripe env vars set.
 *
 * Never import this in client components — it must stay server-side.
 */
export const stripe = new Proxy({} as Stripe, {
  get(_target, prop) {
    const instance = getStripe();
    const value = Reflect.get(instance, prop);
    return typeof value === 'function' ? value.bind(instance) : value;
  },
});

export const STRIPE_PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? '';
export const STRIPE_PLATFORM_ACCOUNT_ID = process.env.STRIPE_PLATFORM_ACCOUNT_ID ?? '';
export const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET ?? '';

/**
 * Static mode marker. Safe to evaluate at module load (no throw).
 * Returns 'unset' if no key is present, useful for the diagnostic endpoint.
 */
const _key = process.env.STRIPE_SECRET_KEY ?? '';
export const STRIPE_MODE: 'live' | 'test' | 'unset' =
  _key.startsWith('sk_live_') ? 'live' :
  _key.startsWith('sk_test_') ? 'test' :
  'unset';

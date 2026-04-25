'use client';

import { useEffect, useState } from 'react';
import { StripeWordmark } from './StripeBranding';

type Props = {
  jobId: string;
  /** Optional: where to send the user when they click the CTA. */
  paymentSettingsHref?: string;
};

type CheckResult = { ok: true } | { ok: false; reason: string; message: string; actionUrl?: string };

/**
 * ClientStripeRequiredBanner
 *
 * Shown above the "Send team requests" action on a job where the client
 * has selected their team but hasn't connected a Stripe payment method.
 * Hits /api/jobs/[id]/send-requests as a pre-flight check; if blocked,
 * renders an actionable banner. Hides itself when the client is ready.
 */
export default function ClientStripeRequiredBanner({
  jobId,
  paymentSettingsHref = '/app/profile#payment-settings',
}: Props) {
  const [result, setResult] = useState<CheckResult | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/jobs/${jobId}/send-requests`, { cache: 'no-store' });
        const data = await res.json();
        if (!cancelled) {
          setResult(res.ok ? { ok: true } : { ok: false, ...data });
        }
      } catch {
        if (!cancelled) setResult({ ok: false, reason: 'unknown', message: 'Could not check Stripe status' });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [jobId]);

  if (loading || !result || result.ok) return null;

  return (
    <div
      role="alert"
      className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-4"
    >
      <div className="flex items-start gap-3">
        <svg
          className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-600"
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h4 className="text-sm font-semibold text-amber-900">
              Connect a payment method to send requests
            </h4>
            <span className="text-stone-300">·</span>
            <StripeWordmark height={11} fill="#635BFF" />
          </div>
          <p className="mt-1 text-sm text-amber-800">
            You can build your team and view the budget, but talent requests won&rsquo;t fire
            until you&rsquo;ve connected a Stripe payment method (ACH or card).
          </p>
          <a
            href={result.actionUrl ?? paymentSettingsHref}
            className="mt-3 inline-flex items-center gap-2 rounded-md bg-stone-900 px-4 py-2 text-sm font-medium text-white hover:bg-stone-800"
          >
            Connect payment method
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3" />
            </svg>
          </a>
        </div>
      </div>
    </div>
  );
}

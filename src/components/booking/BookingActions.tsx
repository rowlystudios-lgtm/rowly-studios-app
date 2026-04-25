'use client';

import { useState } from 'react';
import { StripeWordmark } from '../payment-settings/StripeBranding';

type Props = {
  bookingId: string;
  /** Optional: callback fired after a successful accept/decline so parent can refresh. */
  onResolved?: (status: 'confirmed' | 'pending_stripe' | 'declined') => void;
};

type AcceptResponse =
  | { ok: true; status: 'confirmed'; bookingId: string }
  | { ok: true; status: 'pending_stripe'; bookingId: string;
      windowType: 'standard' | 'immediate';
      graceHours: number;
      graceExpiresAt: string;
      redirectToStripeOnboarding: true };

/**
 * BookingActions
 *
 * Drop-in component for talent's view of a job offer. Renders Accept/Decline
 * buttons. Handles the three-way outcome of accept:
 *
 *   1. Stripe active           → confirmed instantly, calls onResolved.
 *   2. Stripe NOT active       → opens modal explaining the grace window,
 *                                then redirects to Stripe onboarding.
 *   3. Decline                 → marks declined, calls onResolved.
 *
 * Wire into your existing booking detail page by replacing your current
 * Accept/Decline UI with <BookingActions bookingId={...} />.
 */
export default function BookingActions({ bookingId, onResolved }: Props) {
  const [acting, setActing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingResult, setPendingResult] = useState<AcceptResponse | null>(null);

  const accept = async () => {
    setActing(true);
    setError(null);
    try {
      const res = await fetch(`/api/bookings/${bookingId}/accept`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed to accept');

      if (data.status === 'confirmed') {
        onResolved?.('confirmed');
        return;
      }
      // Stripe-pending — show the modal so user understands what's about to happen
      setPendingResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to accept');
    } finally {
      setActing(false);
    }
  };

  const decline = async () => {
    if (!confirm('Decline this booking?')) return;
    setActing(true);
    setError(null);
    try {
      const res = await fetch(`/api/bookings/${bookingId}/decline`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? 'Failed to decline');
      }
      onResolved?.('declined');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to decline');
    } finally {
      setActing(false);
    }
  };

  const continueToStripe = async () => {
    setActing(true);
    try {
      const res = await fetch('/api/stripe/connect/onboarding', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed to start Stripe onboarding');
      window.location.href = data.url;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to start Stripe onboarding');
      setActing(false);
    }
  };

  return (
    <div className="space-y-3">
      {error && (
        <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          {error}
        </div>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={accept}
          disabled={acting}
          className="flex-1 rounded-md bg-stone-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-stone-800 disabled:opacity-50"
        >
          {acting ? 'Working...' : 'Accept booking'}
        </button>
        <button
          type="button"
          onClick={decline}
          disabled={acting}
          className="rounded-md border border-stone-300 bg-white px-4 py-2.5 text-sm font-medium text-stone-700 hover:bg-stone-50 disabled:opacity-50"
        >
          Decline
        </button>
      </div>

      {pendingResult && pendingResult.status === 'pending_stripe' && (
        <PendingStripeModal
          windowType={pendingResult.windowType}
          graceHours={pendingResult.graceHours}
          graceExpiresAt={pendingResult.graceExpiresAt}
          onContinue={continueToStripe}
          onCancel={() => setPendingResult(null)}
          working={acting}
        />
      )}
    </div>
  );
}


function PendingStripeModal(props: {
  windowType: 'standard' | 'immediate';
  graceHours: number;
  graceExpiresAt: string;
  onContinue: () => void;
  onCancel: () => void;
  working: boolean;
}) {
  const isUrgent = props.windowType === 'immediate';
  const expiresLocal = new Date(props.graceExpiresAt).toLocaleString(undefined, {
    weekday: 'short', month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit',
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/50 p-4">
      <div className="w-full max-w-md rounded-lg bg-white shadow-xl">
        <div className={`rounded-t-lg px-5 py-3 ${isUrgent ? 'bg-red-50 border-b border-red-200' : 'bg-amber-50 border-b border-amber-200'}`}>
          <div className="flex items-center gap-2">
            {isUrgent ? (
              <svg className="h-5 w-5 text-red-600" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
                <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
              </svg>
            ) : (
              <svg className="h-5 w-5 text-amber-600" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm0-13a.75.75 0 01.75.75v4.5a.75.75 0 01-1.5 0v-4.5A.75.75 0 0110 5zm0 10a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
              </svg>
            )}
            <h3 className={`text-base font-semibold ${isUrgent ? 'text-red-900' : 'text-amber-900'}`}>
              {isUrgent ? 'URGENT — Stripe setup required' : 'Stripe setup required'}
            </h3>
          </div>
        </div>

        <div className="space-y-4 px-5 py-4">
          <p className="text-sm text-stone-700">
            You&rsquo;ve accepted this booking, but you need to connect your Stripe account
            before we can confirm you for the job.
          </p>

          <div className="rounded border border-stone-200 bg-stone-50 p-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="font-medium text-stone-900">
                {isUrgent ? 'Connect within' : 'Grace period'}
              </span>
              <span className="font-mono text-stone-700">{props.graceHours} hours</span>
            </div>
            <p className="mt-1 text-xs text-stone-500">Expires {expiresLocal}</p>
          </div>

          <p className="text-sm text-stone-600">
            If Stripe is not connected before this time, your booking will be released
            and the client may book another talent.
          </p>

          <div className="flex items-center justify-between border-t border-stone-100 pt-3">
            <span className="inline-flex items-center gap-1.5 text-xs text-stone-500">
              Powered by <StripeWordmark height={11} fill="currentColor" />
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={props.onCancel}
                disabled={props.working}
                className="rounded-md border border-stone-300 bg-white px-3 py-1.5 text-sm text-stone-700 hover:bg-stone-50"
              >
                Not now
              </button>
              <button
                type="button"
                onClick={props.onContinue}
                disabled={props.working}
                style={{ backgroundColor: '#635BFF' }}
                className="rounded-md px-4 py-1.5 text-sm font-medium text-white hover:brightness-110 disabled:opacity-50"
              >
                {props.working ? 'Loading...' : 'Connect Stripe now'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

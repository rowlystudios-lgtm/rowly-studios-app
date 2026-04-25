'use client';

import { useEffect, useState } from 'react';
import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js';
import { loadStripe, Stripe } from '@stripe/stripe-js';

type Props = {
  onClose: () => void;
  onSuccess: () => Promise<void> | void;
};

export default function StripeAddPaymentMethodModal({ onClose, onSuccess }: Props) {
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [stripePromise, setStripePromise] = useState<Promise<Stripe | null> | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/stripe/customer/setup-intent', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ method: 'both' }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? 'Failed to create SetupIntent');
        setClientSecret(data.clientSecret);
        setStripePromise(loadStripe(data.publishableKey));
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed');
      }
    })();
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/50 p-4">
      <div className="w-full max-w-md rounded-lg bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-stone-200 px-5 py-3">
          <h3 className="text-base font-semibold text-stone-900">Add payment method</h3>
          <button
            type="button"
            onClick={onClose}
            className="text-stone-400 hover:text-stone-700"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div className="px-5 py-4">
          {error && (
            <p className="mb-3 rounded border border-red-200 bg-red-50 p-2 text-sm text-red-800">
              {error}
            </p>
          )}

          {!clientSecret && !error && (
            <p className="text-sm text-stone-500">Loading secure form…</p>
          )}

          {clientSecret && stripePromise && (
            <Elements
              stripe={stripePromise}
              options={{
                clientSecret,
                appearance: {
                  theme: 'flat',
                  variables: { fontFamily: 'Montserrat, system-ui, sans-serif' },
                },
              }}
            >
              <SetupForm onClose={onClose} onSuccess={onSuccess} />
            </Elements>
          )}
        </div>
      </div>
    </div>
  );
}

function SetupForm({
  onClose,
  onSuccess,
}: {
  onClose: () => void;
  onSuccess: () => Promise<void> | void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements) return;
    setSubmitting(true);
    setError(null);

    const { error: submitError, setupIntent } = await stripe.confirmSetup({
      elements,
      confirmParams: {
        return_url: `${window.location.origin}/profile?stripe_setup=success`,
      },
      redirect: 'if_required',
    });

    if (submitError) {
      setError(submitError.message ?? 'Failed to save payment method');
      setSubmitting(false);
      return;
    }

    // If there's a payment method id, mark it as default
    if (setupIntent?.payment_method && typeof setupIntent.payment_method === 'string') {
      await fetch('/api/stripe/customer/payment-methods', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paymentMethodId: setupIntent.payment_method }),
      });
    }

    await onSuccess();
  };

  return (
    <form onSubmit={handleSubmit}>
      <PaymentElement options={{ layout: 'tabs' }} />

      {error && (
        <p className="mt-3 rounded border border-red-200 bg-red-50 p-2 text-sm text-red-800">
          {error}
        </p>
      )}

      <div className="mt-4 flex justify-end gap-2 border-t border-stone-200 pt-4">
        <button
          type="button"
          onClick={onClose}
          className="rounded-md border border-stone-300 bg-white px-4 py-2 text-sm text-stone-700 hover:bg-stone-50"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={!stripe || submitting}
          className="rounded-md bg-stone-900 px-4 py-2 text-sm font-medium text-white hover:bg-stone-800 disabled:opacity-50"
        >
          {submitting ? 'Saving…' : 'Save payment method'}
        </button>
      </div>
    </form>
  );
}

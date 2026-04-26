'use client';

import { useCallback, useEffect, useState } from 'react';
import { StripeWordmark, PoweredByStripe } from './StripeBranding';

type BankAccount = {
  id: string;
  type: 'us_bank_account';
  bankName: string | null;
  last4: string | null;
  accountType: string | null;
  isDefault: boolean;
};
type Card = {
  id: string;
  type: 'card';
  brand: string | null;
  last4: string | null;
  expMonth: number | null;
  expYear: number | null;
  isDefault: boolean;
};
type ListPayload = {
  bankAccounts: BankAccount[];
  cards: Card[];
  defaultPaymentMethodId: string | null;
};

/**
 * ClientStripePaymentMethod
 *
 * Client's payment-methods panel, mounted on /app/account#payment-settings.
 *
 * v2 changes (vs initial Checkout migration):
 *   - bfcache fix: the "Redirecting to Stripe…" state now resets on
 *     `pageshow` events when the page is restored from the back/forward
 *     cache. Without this, hitting browser-back from Stripe Checkout
 *     left the spinner stuck on forever.
 *   - hard-cancel timeout: if the redirect fetch takes >12s, abort and
 *     show an error so user isn't stuck looking at a spinner.
 */
export default function ClientStripePaymentMethod() {
  const [data, setData] = useState<ListPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [redirecting, setRedirecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [returnBanner, setReturnBanner] =
    useState<'success' | 'cancelled' | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/stripe/customer/payment-methods', { cache: 'no-store' });
      if (!res.ok) throw new Error((await res.json()).error ?? 'Failed');
      setData(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  // bfcache fix: when the page is restored from the back/forward cache
  // (e.g., user hit browser-back from Stripe Checkout), reset the
  // redirecting state so the spinner button doesn't show forever.
  useEffect(() => {
    const handlePageShow = (e: PageTransitionEvent) => {
      if (e.persisted) {
        // Page was restored from bfcache. Reset all transient UI state.
        setRedirecting(false);
        setError(null);
        // Re-fetch payment methods in case something changed mid-flow
        refresh();
      }
    };
    window.addEventListener('pageshow', handlePageShow);
    return () => window.removeEventListener('pageshow', handlePageShow);
  }, [refresh]);

  // Process the URL params on mount: open panel + show return banner
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const setupResult = params.get('stripe_setup');
    if (setupResult === 'success' || setupResult === 'cancelled') {
      setReturnBanner(setupResult);
      setOpen(true);
      // Strip params so refresh doesn't re-trigger the banner
      const url = new URL(window.location.href);
      url.searchParams.delete('stripe_setup');
      url.searchParams.delete('session_id');
      window.history.replaceState({}, '', url.toString());
      if (setupResult === 'success') {
        // Stripe needs a beat to attach the payment method. Quick poll.
        refresh();
        setTimeout(refresh, 1500);
      }
    }
    if (window.location.hash === '#payment-settings') {
      setOpen(true);
      setTimeout(() => {
        document.getElementById('payment-settings')?.scrollIntoView({
          behavior: 'smooth', block: 'start',
        });
      }, 100);
    }
  }, [refresh]);

  const startCheckout = async () => {
    setRedirecting(true);
    setError(null);

    // Hard timeout: if the redirect fetch hangs past 12 seconds, abort
    // and show an error so the user isn't stuck staring at a spinner.
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 12_000);

    try {
      const res = await fetch('/api/stripe/customer/setup-checkout-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
        signal: controller.signal,
      });
      const payload = await res.json();
      if (!res.ok || !payload.url) {
        throw new Error(payload.error ?? 'Failed to start Stripe Checkout');
      }
      // Top-level navigation
      window.location.href = payload.url;
    } catch (e) {
      const msg =
        e instanceof DOMException && e.name === 'AbortError'
          ? 'Took too long to reach Stripe. Click again, or refresh this page.'
          : e instanceof Error ? e.message : 'Failed to start Stripe Checkout';
      setError(msg);
      setRedirecting(false);
    } finally {
      window.clearTimeout(timeoutId);
    }
  };

  const setDefault = async (paymentMethodId: string) => {
    setError(null);
    try {
      const res = await fetch('/api/stripe/customer/payment-methods', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paymentMethodId }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? 'Failed');
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed');
    }
  };

  const remove = async (paymentMethodId: string) => {
    if (!confirm('Remove this payment method?')) return;
    setError(null);
    try {
      const res = await fetch(`/api/stripe/customer/payment-methods/${paymentMethodId}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error((await res.json()).error ?? 'Failed');
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed');
    }
  };

  const total = (data?.bankAccounts.length ?? 0) + (data?.cards.length ?? 0);

  return (
    <section id="payment-settings" className="rounded-lg border border-stone-200 bg-white scroll-mt-20">
      <button
        type="button"
        className="flex w-full items-center justify-between px-5 py-4 text-left"
        onClick={() => setOpen((v) => !v)}
      >
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h3 className="text-base font-semibold text-stone-900">Payment settings</h3>
            <span className="text-stone-300">·</span>
            <StripeWordmark height={14} fill="#635BFF" />
          </div>
          <p className="mt-0.5 text-sm text-stone-500">
            Add a payment method to settle invoices. Required before your first booking is invoiced.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
            total > 0 ? 'bg-emerald-50 text-emerald-800' : 'bg-stone-100 text-stone-700'
          }`}>
            {total > 0 ? `${total} method${total > 1 ? 's' : ''}` : 'Not set up'}
          </span>
          <svg
            className={`h-4 w-4 text-stone-400 transition-transform ${open ? 'rotate-180' : ''}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {open && (
        <div className="border-t border-stone-200 px-5 py-4">
          {returnBanner === 'success' && (
            <div className="mb-4 flex items-start gap-2 rounded border border-emerald-200 bg-emerald-50 p-3 text-sm">
              <svg className="mt-0.5 h-4 w-4 flex-shrink-0 text-emerald-600" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              <p className="text-emerald-900">
                <strong>Payment method saved.</strong> You&rsquo;re ready to be invoiced for jobs.
              </p>
            </div>
          )}
          {returnBanner === 'cancelled' && (
            <div className="mb-4 flex items-start gap-2 rounded border border-amber-200 bg-amber-50 p-3 text-sm">
              <svg className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-600" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
                <path d="M10 18a8 8 0 100-16 8 8 0 000 16zm0-13a.75.75 0 01.75.75v4.5a.75.75 0 01-1.5 0v-4.5A.75.75 0 0110 5zm0 10a1 1 0 100-2 1 1 0 000 2z" />
              </svg>
              <p className="text-amber-900">
                Payment method setup was cancelled. Click <strong>Add payment method</strong> below to try again.
              </p>
            </div>
          )}

          {loading && <p className="text-sm text-stone-500">Loading...</p>}
          {error && (
            <div className="mb-3 flex items-start justify-between gap-2 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800">
              <span>{error}</span>
              {redirecting && (
                <button
                  type="button"
                  onClick={() => { setRedirecting(false); setError(null); }}
                  className="flex-shrink-0 text-xs font-medium underline hover:no-underline"
                >
                  Dismiss
                </button>
              )}
            </div>
          )}

          {!loading && data && (
            <div className="space-y-4">
              <div className="rounded border border-stone-200 bg-stone-50 p-3 text-xs text-stone-600">
                Required before your first invoice — no payments are taken until then.
                We recommend bank transfer (ACH): a low 0.8% processing fee, capped at
                $5 per invoice. Credit cards work at the standard 2.9% + $0.30.
              </div>

              {data.bankAccounts.length === 0 && data.cards.length === 0 && (
                <p className="text-sm text-stone-600">
                  No payment methods on file yet. Add one below — you&rsquo;ll be redirected to
                  Stripe&rsquo;s secure checkout to enter your details.
                </p>
              )}

              {data.bankAccounts.length > 0 && (
                <div>
                  <h4 className="mb-2 text-xs font-medium uppercase tracking-wide text-stone-500">
                    Bank accounts
                  </h4>
                  <ul className="space-y-2">
                    {data.bankAccounts.map((b) => (
                      <PaymentMethodRow
                        key={b.id}
                        title={`${b.bankName ?? 'Bank'} ····${b.last4 ?? '----'}`}
                        subtitle={b.accountType ?? 'ACH'}
                        isDefault={b.isDefault}
                        onSetDefault={() => setDefault(b.id)}
                        onRemove={() => remove(b.id)}
                      />
                    ))}
                  </ul>
                </div>
              )}

              {data.cards.length > 0 && (
                <div>
                  <h4 className="mb-2 text-xs font-medium uppercase tracking-wide text-stone-500">
                    Cards
                  </h4>
                  <ul className="space-y-2">
                    {data.cards.map((c) => (
                      <PaymentMethodRow
                        key={c.id}
                        title={`${(c.brand ?? '').toUpperCase()} ····${c.last4 ?? '----'}`}
                        subtitle={
                          c.expMonth && c.expYear
                            ? `Expires ${String(c.expMonth).padStart(2, '0')}/${String(c.expYear).slice(-2)}`
                            : ''
                        }
                        isDefault={c.isDefault}
                        onSetDefault={() => setDefault(c.id)}
                        onRemove={() => remove(c.id)}
                      />
                    ))}
                  </ul>
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={startCheckout}
                  disabled={redirecting}
                  style={{ backgroundColor: '#635BFF' }}
                  className="flex-1 inline-flex items-center justify-center gap-2 rounded-md px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:brightness-110 disabled:opacity-50"
                >
                  {redirecting ? (
                    <>
                      <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" strokeOpacity="0.25" />
                        <path fill="currentColor" d="M4 12a8 8 0 018-8v3a5 5 0 00-5 5H4z" />
                      </svg>
                      Redirecting to Stripe…
                    </>
                  ) : (
                    <>
                      Add payment method via <StripeWordmark height={12} fill="white" />
                    </>
                  )}
                </button>
                {redirecting && (
                  <button
                    type="button"
                    onClick={() => { setRedirecting(false); setError(null); }}
                    className="rounded-md border border-stone-300 bg-white px-4 py-2.5 text-sm text-stone-700 hover:bg-stone-50"
                  >
                    Cancel
                  </button>
                )}
                {!redirecting && total === 0 && (
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    className="rounded-md border border-stone-300 bg-white px-4 py-2.5 text-sm text-stone-700 hover:bg-stone-50"
                  >
                    Set up later
                  </button>
                )}
              </div>

              <div className="flex items-start gap-2 rounded border border-stone-100 bg-stone-50 px-3 py-2 text-xs text-stone-600">
                <svg className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-stone-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
                <span>
                  You&rsquo;ll be redirected to Stripe&rsquo;s secure checkout (checkout.stripe.com)
                  to enter your details. Your card or bank info never touches Rowly Studios servers.
                </span>
              </div>

              <div className="flex justify-end border-t border-stone-100 pt-3">
                <PoweredByStripe />
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function PaymentMethodRow(props: {
  title: string;
  subtitle: string;
  isDefault: boolean;
  onSetDefault: () => void;
  onRemove: () => void;
}) {
  return (
    <li className="flex items-center justify-between rounded border border-stone-200 px-3 py-2.5">
      <div>
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-stone-900">{props.title}</span>
          {props.isDefault && (
            <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-800">
              Default
            </span>
          )}
        </div>
        {props.subtitle && <p className="text-xs text-stone-500">{props.subtitle}</p>}
      </div>
      <div className="flex gap-2">
        {!props.isDefault && (
          <button
            type="button"
            onClick={props.onSetDefault}
            className="text-xs font-medium text-stone-700 hover:text-stone-900"
          >
            Set default
          </button>
        )}
        <button
          type="button"
          onClick={props.onRemove}
          className="text-xs font-medium text-red-700 hover:text-red-900"
        >
          Remove
        </button>
      </div>
    </li>
  );
}

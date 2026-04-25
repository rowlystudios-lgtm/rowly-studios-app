'use client';

import { useCallback, useEffect, useState } from 'react';
import { StripeWordmark, PoweredByStripe, StripeBrandedButton } from './StripeBranding';

type ConnectStatus = 'not_connected' | 'pending' | 'active' | 'restricted' | 'rejected' | 'disabled';

type StatusPayload = {
  status: ConnectStatus;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
  requirementsDue: string[];
  stripeAccountId?: string;
};

const STATUS_COPY: Record<ConnectStatus, { label: string; description: string; tone: string }> = {
  not_connected: {
    label: 'Not connected',
    description: 'Connect a Stripe account whenever you’re ready — you don’t need one to use Rowly Studios, only to receive payment for jobs.',
    tone: 'bg-stone-100 text-stone-700',
  },
  pending: {
    label: 'Action needed',
    description: 'Continue onboarding in Stripe to start receiving payments.',
    tone: 'bg-amber-50 text-amber-800',
  },
  active: {
    label: 'Connected',
    description: 'You’re ready to receive payments. Bank fees on payouts are your responsibility.',
    tone: 'bg-emerald-50 text-emerald-800',
  },
  restricted: {
    label: 'Restricted',
    description: 'Stripe is holding payouts. Update your details to resolve.',
    tone: 'bg-amber-50 text-amber-800',
  },
  rejected: {
    label: 'Rejected',
    description: 'This Stripe account has been rejected. Contact Rowly Studios admin.',
    tone: 'bg-red-50 text-red-800',
  },
  disabled: {
    label: 'Disabled',
    description: 'This account has been disabled. Contact Rowly Studios admin.',
    tone: 'bg-stone-100 text-stone-700',
  },
};

export default function TalentStripeConnect() {
  const [status, setStatus] = useState<StatusPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchStatus = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/stripe/connect/status', { cache: 'no-store' });
      if (!res.ok) throw new Error((await res.json()).error ?? 'Failed to load');
      setStatus(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchStatus(); }, [fetchStatus]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('stripe_return')) fetchStatus();
    if (window.location.hash === '#payment-settings') {
      setOpen(true);
      setTimeout(() => {
        document.getElementById('payment-settings')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);
    }
  }, [fetchStatus]);

  const startOnboarding = async () => {
    setActing(true);
    setError(null);
    try {
      const res = await fetch('/api/stripe/connect/onboarding', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed to start onboarding');
      window.location.href = data.url;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed');
      setActing(false);
    }
  };

  const openDashboard = async () => {
    setActing(true);
    try {
      const res = await fetch('/api/stripe/connect/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'dashboard' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed');
      window.open(data.url, '_blank', 'noopener,noreferrer');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed');
    } finally {
      setActing(false);
    }
  };

  const continueOnboarding = async () => {
    setActing(true);
    try {
      const res = await fetch('/api/stripe/connect/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'onboarding' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed');
      window.location.href = data.url;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed');
      setActing(false);
    }
  };

  const copy = STATUS_COPY[status?.status ?? 'not_connected'];

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
            Connect a Stripe account to receive job payments. Optional until you book your first job.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {status && (
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${copy.tone}`}>
              {copy.label}
            </span>
          )}
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
          {loading && <p className="text-sm text-stone-500">Loading…</p>}
          {error && <p className="mb-3 text-sm text-red-700">{error}</p>}

          {!loading && status && (
            <div className="space-y-4">
              <p className="text-sm text-stone-600">{copy.description}</p>

              {status.status === 'not_connected' && (
                <div className="flex flex-wrap gap-2">
                  <StripeBrandedButton onClick={startOnboarding} disabled={acting}>
                    {acting ? 'Starting…' : <>Connect with <StripeWordmark height={12} fill="white" /></>}
                  </StripeBrandedButton>
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    className="rounded-md border border-stone-300 bg-white px-4 py-2 text-sm font-medium text-stone-700 hover:bg-stone-50"
                  >
                    Set up later
                  </button>
                </div>
              )}

              {(status.status === 'pending' || status.status === 'restricted') && (
                <div className="space-y-3">
                  {status.requirementsDue.length > 0 && (
                    <div className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                      <strong>Stripe needs:</strong>{' '}
                      {status.requirementsDue.slice(0, 3).join(', ')}
                      {status.requirementsDue.length > 3 ? '…' : ''}
                    </div>
                  )}
                  <StripeBrandedButton onClick={continueOnboarding} disabled={acting}>
                    {acting ? 'Loading…' : <>Continue with <StripeWordmark height={12} fill="white" /></>}
                  </StripeBrandedButton>
                </div>
              )}

              {status.status === 'active' && (
                <div className="space-y-3">
                  <div className="rounded border border-emerald-200 bg-emerald-50 p-3">
                    <div className="flex items-start gap-2 text-sm text-emerald-900">
                      <svg className="mt-0.5 h-4 w-4 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                      </svg>
                      <div className="flex-1">
                        <p className="font-medium">Stripe account connected</p>
                        <ul className="mt-1 text-xs text-emerald-800">
                          <li>· Charges enabled: {status.chargesEnabled ? 'yes' : 'no'}</li>
                          <li>· Payouts enabled: {status.payoutsEnabled ? 'yes' : 'no'}</li>
                        </ul>
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={openDashboard}
                      disabled={acting}
                      className="rounded-md border border-stone-300 bg-white px-4 py-2 text-sm font-medium text-stone-900 hover:bg-stone-50 disabled:opacity-50"
                    >
                      {acting ? 'Loading…' : 'Open Stripe dashboard'}
                    </button>
                    <button
                      type="button"
                      onClick={fetchStatus}
                      className="rounded-md border border-stone-300 bg-white px-4 py-2 text-sm text-stone-700 hover:bg-stone-50"
                    >
                      Refresh
                    </button>
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between border-t border-stone-100 pt-3">
                <p className="text-xs text-stone-500">
                  Rowly Studios takes 15% of every job. Payment processing fees are billed to clients.
                  Bank payout fees on your end are your responsibility.
                </p>
              </div>
              <div className="flex justify-end">
                <PoweredByStripe />
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

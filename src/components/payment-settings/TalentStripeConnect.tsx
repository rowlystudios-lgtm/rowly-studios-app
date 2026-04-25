'use client';

import { useCallback, useEffect, useState } from 'react';

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
    description: 'Connect a Stripe account to receive payments for jobs.',
    tone: 'bg-stone-100 text-stone-700',
  },
  pending: {
    label: 'Action needed',
    description: 'Continue onboarding in Stripe to start receiving payments.',
    tone: 'bg-amber-50 text-amber-800',
  },
  active: {
    label: 'Connected',
    description: 'You are ready to receive payments. Bank fees on payouts are your responsibility.',
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

  // Auto-refresh on return from Stripe onboarding
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('stripe_return')) fetchStatus();
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
    <section className="rounded-lg border border-stone-200 bg-white">
      <button
        type="button"
        className="flex w-full items-center justify-between px-5 py-4 text-left"
        onClick={() => setOpen((v) => !v)}
      >
        <div>
          <h3 className="text-base font-semibold text-stone-900">Payment settings</h3>
          <p className="mt-0.5 text-sm text-stone-500">
            Connect a Stripe account to receive job payments.
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
                <button
                  type="button"
                  onClick={startOnboarding}
                  disabled={acting}
                  className="rounded-md bg-stone-900 px-4 py-2 text-sm font-medium text-white hover:bg-stone-800 disabled:opacity-50"
                >
                  {acting ? 'Starting…' : 'Connect Stripe account'}
                </button>
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
                  <button
                    type="button"
                    onClick={continueOnboarding}
                    disabled={acting}
                    className="rounded-md bg-stone-900 px-4 py-2 text-sm font-medium text-white hover:bg-stone-800 disabled:opacity-50"
                  >
                    {acting ? 'Loading…' : 'Continue onboarding'}
                  </button>
                </div>
              )}

              {status.status === 'active' && (
                <div className="space-y-3">
                  <ul className="text-xs text-stone-600">
                    <li>· Charges enabled: {status.chargesEnabled ? 'yes' : 'no'}</li>
                    <li>· Payouts enabled: {status.payoutsEnabled ? 'yes' : 'no'}</li>
                  </ul>
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

              <p className="border-t border-stone-100 pt-3 text-xs text-stone-500">
                Rowly Studios takes 15% of every job. Payment processing fees are billed to clients.
                Bank payout fees on your end are your responsibility.
              </p>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

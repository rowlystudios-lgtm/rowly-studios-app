'use client';

import { useCallback, useEffect, useState } from 'react';
import StripeAddPaymentMethodModal from './StripeAddPaymentMethodModal';
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

export default function ClientStripePaymentMethod() {
  const [data, setData] = useState<ListPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  useEffect(() => {
    if (window.location.hash === '#payment-settings') {
      setOpen(true);
      setTimeout(() => {
        document.getElementById('payment-settings')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);
    }
  }, []);

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
          {loading && <p className="text-sm text-stone-500">Loading...</p>}
          {error && <p className="mb-3 text-sm text-red-700">{error}</p>}

          {!loading && data && (
            <div className="space-y-4">
              <div className="rounded border border-stone-200 bg-stone-50 p-3 text-xs text-stone-600">
                Required before your first invoice — no payments are taken until then.
                We recommend bank transfer (ACH): a low 0.8% processing fee, capped at
                $5 per invoice. Credit cards work at the standard 2.9% + $0.30.
              </div>

              {data.bankAccounts.length === 0 && data.cards.length === 0 && (
                <p className="text-sm text-stone-600">
                  No payment methods on file yet. You can add one whenever you’re ready —
                  it’s required before your first booking is invoiced.
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
                  onClick={() => setShowAddModal(true)}
                  className="flex-1 rounded-md border border-dashed border-stone-300 bg-white px-4 py-2.5 text-sm font-medium text-stone-700 hover:bg-stone-50"
                >
                  + Add payment method
                </button>
                {total === 0 && (
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    className="rounded-md border border-stone-300 bg-white px-4 py-2.5 text-sm text-stone-700 hover:bg-stone-50"
                  >
                    Set up later
                  </button>
                )}
              </div>

              <div className="flex justify-end border-t border-stone-100 pt-3">
                <PoweredByStripe />
              </div>
            </div>
          )}
        </div>
      )}

      {showAddModal && (
        <StripeAddPaymentMethodModal
          onClose={() => setShowAddModal(false)}
          onSuccess={async () => {
            setShowAddModal(false);
            await refresh();
          }}
        />
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

'use client';

import { useState } from 'react';
import { StripeWordmark, PoweredByStripe } from '../payment-settings/StripeBranding';

type Props = {
  jobId: string;
  /** Optional callback after successful send (admin UI can refresh). */
  onSent?: (info: { invoiceId: string; stripeInvoiceId: string; hostedUrl: string | null }) => void;
};

type PreviewBooking = {
  bookingId: string;
  talentId: string;
  talentName: string;
  talentEmail: string;
  confirmedRateCents: number;
  rsFeeCents: number;
  talentNetCents: number;
};

type Preview = {
  ok: true;
  jobId: string;
  jobTitle: string;
  jobCode: string | null;
  clientId: string;
  clientName: string;
  paymentMethodType: 'us_bank_account' | 'card';
  paymentMethodLabel: string;
  bookings: PreviewBooking[];
  totals: {
    talentSubtotalCents: number;
    rsFeeCents: number;
    processingFeeCents: number;
    clientTotalCents: number;
  };
  alreadySent: boolean;
  existingInvoiceId?: string;
  existingHostedUrl?: string | null;
};

type Blocker = {
  ok: false;
  reason: string;
  message: string;
  blockers?: Array<{ talentName?: string; status: string }>;
};

const fmt = (cents: number) => `$${(cents / 100).toFixed(2)}`;

/**
 * Admin button for "Send invoice via Stripe."
 *
 * Behavior:
 *   1. Click → fetches preview from /api/admin/jobs/[id]/invoice-preview
 *   2. Modal shows the line items, totals, payment method, talent transfers
 *   3. Admin clicks Confirm → POSTs to /api/admin/jobs/[id]/send-invoice
 *   4. On success → shows the hosted invoice URL, optionally calls onSent
 *
 * Mount on whatever admin page shows job detail. The component is
 * self-contained — no external state required.
 */
export default function SendInvoiceButton({ jobId, onSent }: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<Preview | Blocker | null>(null);
  const [sending, setSending] = useState(false);
  const [sentResult, setSentResult] = useState<{ stripeInvoiceId: string; hostedUrl: string | null } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const openModal = async () => {
    setOpen(true);
    setLoading(true);
    setPreview(null);
    setSentResult(null);
    setError(null);
    try {
      const res = await fetch(`/api/admin/jobs/${jobId}/invoice-preview`, { cache: 'no-store' });
      const data = await res.json();
      setPreview(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load preview');
    } finally {
      setLoading(false);
    }
  };

  const send = async () => {
    setSending(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/jobs/${jobId}/send-invoice`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.message ?? data.error ?? 'Failed to send invoice');
      }
      setSentResult({ stripeInvoiceId: data.stripeInvoiceId, hostedUrl: data.hostedUrl });
      onSent?.({ invoiceId: data.invoiceId, stripeInvoiceId: data.stripeInvoiceId, hostedUrl: data.hostedUrl });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to send invoice');
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={openModal}
        style={{ backgroundColor: '#635BFF' }}
        className="inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium text-white shadow-sm hover:brightness-110"
      >
        Send invoice via <StripeWordmark height={12} fill="white" />
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/50 p-4">
          <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-lg bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-stone-200 px-5 py-3">
              <div className="flex items-center gap-2">
                <h3 className="text-base font-semibold text-stone-900">Send invoice</h3>
                <span className="text-stone-300">·</span>
                <StripeWordmark height={12} fill="#635BFF" />
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-stone-400 hover:text-stone-700"
                aria-label="Close"
              >✕</button>
            </div>

            <div className="space-y-4 px-5 py-4">
              {loading && <p className="text-sm text-stone-500">Loading preview…</p>}

              {error && (
                <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                  {error}
                </div>
              )}

              {sentResult && (
                <div className="space-y-3">
                  <div className="rounded border border-emerald-200 bg-emerald-50 p-3">
                    <div className="flex items-start gap-2 text-sm text-emerald-900">
                      <svg className="mt-0.5 h-4 w-4 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                      </svg>
                      <div className="flex-1">
                        <p className="font-medium">Invoice sent</p>
                        <p className="mt-0.5 text-xs text-emerald-800 break-all">
                          Stripe invoice id: {sentResult.stripeInvoiceId}
                        </p>
                      </div>
                    </div>
                  </div>
                  {sentResult.hostedUrl && (
                    <a
                      href={sentResult.hostedUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block w-full rounded-md border border-stone-300 bg-white px-4 py-2 text-center text-sm font-medium text-stone-900 hover:bg-stone-50"
                    >
                      Open client&rsquo;s payment page ↗
                    </a>
                  )}
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    className="block w-full rounded-md bg-stone-900 px-4 py-2 text-sm font-medium text-white hover:bg-stone-800"
                  >
                    Done
                  </button>
                </div>
              )}

              {!loading && preview && !sentResult && (
                preview.ok ? (
                  <div className="space-y-4">
                    {preview.alreadySent && (
                      <div className="rounded border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                        <strong>This job already has a Stripe invoice.</strong> Void or refund it first if you need to resend.
                        {preview.existingHostedUrl && (
                          <a href={preview.existingHostedUrl} target="_blank" rel="noopener noreferrer" className="ml-1 underline">
                            View
                          </a>
                        )}
                      </div>
                    )}

                    <div className="text-sm">
                      <p className="text-stone-500">Sending to</p>
                      <p className="font-medium text-stone-900">{preview.clientName}</p>
                      <p className="mt-0.5 text-xs text-stone-600">{preview.paymentMethodLabel}</p>
                    </div>

                    <div className="rounded border border-stone-200">
                      <div className="border-b border-stone-100 px-3 py-2">
                        <p className="text-xs font-medium uppercase tracking-wide text-stone-500">
                          Talent fees
                        </p>
                      </div>
                      {preview.bookings.map((b) => (
                        <div key={b.bookingId} className="flex justify-between border-b border-stone-100 px-3 py-2 text-sm last:border-b-0">
                          <span className="text-stone-700">{b.talentName}</span>
                          <span className="font-mono text-stone-900">{fmt(b.confirmedRateCents)}</span>
                        </div>
                      ))}
                      <div className="flex justify-between bg-stone-50 px-3 py-2 text-sm">
                        <span className="text-stone-700">Rowly Studios service fee (15%)</span>
                        <span className="font-mono text-stone-900">{fmt(preview.totals.rsFeeCents)}</span>
                      </div>
                      <div className="flex justify-between bg-stone-50 px-3 py-2 text-sm border-t border-stone-100">
                        <span className="text-stone-700">
                          {preview.paymentMethodType === 'us_bank_account' ? 'Bank transfer fee' : 'Card processing fee'}
                        </span>
                        <span className="font-mono text-stone-900">{fmt(preview.totals.processingFeeCents)}</span>
                      </div>
                      <div className="flex justify-between border-t-2 border-stone-200 px-3 py-2.5 text-base font-semibold">
                        <span>Client pays</span>
                        <span className="font-mono">{fmt(preview.totals.clientTotalCents)}</span>
                      </div>
                    </div>

                    <div className="rounded border border-stone-200 bg-stone-50 p-3 text-xs text-stone-600 space-y-1">
                      <p><strong>After client pays:</strong></p>
                      <ul className="ml-3 list-disc">
                        <li>Hold for 5 days (ACH reversal protection)</li>
                        {preview.bookings.map((b) => (
                          <li key={b.bookingId}>{b.talentName} receives {fmt(b.talentNetCents)} via Stripe transfer</li>
                        ))}
                        <li>Rowly Studios keeps {fmt(preview.totals.rsFeeCents)} (15% of talent fees)</li>
                      </ul>
                    </div>

                    <div className="flex justify-between border-t border-stone-100 pt-3">
                      <button
                        type="button"
                        onClick={() => setOpen(false)}
                        className="rounded-md border border-stone-300 bg-white px-4 py-2 text-sm text-stone-700 hover:bg-stone-50"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={send}
                        disabled={sending || preview.alreadySent}
                        style={{ backgroundColor: preview.alreadySent ? '#a8a29e' : '#635BFF' }}
                        className="inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium text-white hover:brightness-110 disabled:opacity-50"
                      >
                        {sending ? 'Sending…' : <>Send via <StripeWordmark height={12} fill="white" /></>}
                      </button>
                    </div>

                    <div className="flex justify-end pt-1">
                      <PoweredByStripe />
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                      <p className="font-medium">Cannot send invoice</p>
                      <p className="mt-1">{preview.message}</p>
                      {preview.blockers && preview.blockers.length > 0 && (
                        <ul className="mt-2 ml-3 list-disc text-xs">
                          {preview.blockers.map((b, i) => (
                            <li key={i}>{b.talentName ?? '(unknown)'} — Stripe status: {b.status}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => setOpen(false)}
                      className="w-full rounded-md border border-stone-300 bg-white px-4 py-2 text-sm text-stone-700 hover:bg-stone-50"
                    >
                      Close
                    </button>
                  </div>
                )
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

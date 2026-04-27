'use client';

import { useEffect, useState } from 'react';

type InvoiceData = {
  id: string;
  invoice_number: string;
  status: string;
  email_status: string | null;
  total_cents: number | null;
  client_total_cents: number | null;
  rendered_html: string | null;
  rendered_subject: string | null;
  stripe_payment_link_url: string | null;
  gmail_draft_id: string | null;
  paid_at: string | null;
  sent_to_client_at: string | null;
  created_at: string;
};

type Props = {
  jobId: string;
};

/**
 * JobInvoiceCard — inline invoice preview for the admin /app/jobs CompletedCard.
 *
 * Behavior:
 *   - On mount, fetches the latest invoice for jobId
 *   - If none exists: shows a small placeholder ("auto-generates on wrap")
 *   - If exists: renders the email HTML in an iframe + status pill +
 *     Stripe Checkout test-pay button
 *
 * NOTE: 'Open in Gmail' link is rendered only when gmail_draft_id is set.
 * Step 5 will populate that field via Gmail API drafts.create. Until then
 * the button stays hidden.
 *
 * The auto-trigger that creates invoices on job completion is built in
 * Step 4. Until then, invoices can be created via the existing
 * /api/admin/jobs/[id]/generate-invoice POST endpoint.
 */
export default function JobInvoiceCard({ jobId }: Props) {
  const [invoice, setInvoice] = useState<InvoiceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [showPreview, setShowPreview] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/admin/jobs/${jobId}/invoice`)
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled && data.ok) {
          setInvoice(data.invoice);
        }
      })
      .catch(() => {
        // swallow — empty state is the right fallback if the API is unreachable
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [jobId]);

  if (loading) {
    return (
      <div className="mt-4 rounded-lg border border-white/10 bg-white/5 p-3 text-xs text-white/40">
        Loading invoice…
      </div>
    );
  }

  if (!invoice) {
    return (
      <div className="mt-4 rounded-lg border border-white/10 bg-white/5 p-3">
        <div className="mb-1 text-[10px] font-medium uppercase tracking-wider text-white/40">
          Invoice
        </div>
        <div className="text-xs text-white/50">
          No invoice generated yet. Will appear here when the job is wrapped.
        </div>
      </div>
    );
  }

  const totalDollars = (invoice.total_cents ?? invoice.client_total_cents ?? 0) / 100;

  // Status pill
  let statusLabel = 'Draft';
  let statusColor = 'bg-amber-500/15 text-amber-300 border-amber-500/30';
  if (invoice.paid_at) {
    statusLabel = 'Paid';
    statusColor = 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30';
  } else if (invoice.sent_to_client_at) {
    statusLabel = 'Sent — awaiting payment';
    statusColor = 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30';
  } else if (invoice.email_status === 'failed') {
    statusLabel = 'Failed — review';
    statusColor = 'bg-red-500/15 text-red-300 border-red-500/30';
  }

  return (
    <div className="mt-4 overflow-hidden rounded-lg border border-white/10 bg-white/5">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 border-b border-white/10 p-3">
        <div>
          <div className="text-[10px] font-medium uppercase tracking-wider text-white/40">
            Invoice
          </div>
          <div className="mt-0.5 text-sm text-white">
            <span className="font-mono">{invoice.invoice_number}</span>
            <span className="mx-1.5 text-white/40">·</span>
            <span className="font-medium">${totalDollars.toFixed(2)}</span>
          </div>
        </div>
        <span
          className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${statusColor}`}
        >
          {statusLabel}
        </span>
      </div>

      {/* Preview iframe */}
      {invoice.rendered_html && showPreview ? (
        <div className="bg-[#0a1929]">
          <iframe
            srcDoc={invoice.rendered_html}
            title={`${invoice.invoice_number} preview`}
            sandbox=""
            style={{
              width: '100%',
              height: '720px',
              border: 0,
              backgroundColor: '#0a1929',
              display: 'block',
            }}
          />
        </div>
      ) : null}

      {/* Actions */}
      <div className="flex flex-wrap items-center gap-2 border-t border-white/10 bg-white/[0.02] p-3">
        {invoice.rendered_html ? (
          <button
            type="button"
            onClick={() => setShowPreview((v) => !v)}
            className="text-xs text-white/60 hover:text-white"
          >
            {showPreview ? 'Hide preview' : 'Show preview'}
          </button>
        ) : null}

        <div className="ml-auto flex flex-wrap items-center gap-2">
          {invoice.gmail_draft_id ? (
            <a
              href={`https://mail.google.com/mail/u/0/#drafts/${invoice.gmail_draft_id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-md border border-white/20 bg-white/5 px-3 py-1.5 text-xs font-medium text-white hover:bg-white/10"
            >
              Open in Gmail
              <svg
                className="h-3 w-3"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3" />
              </svg>
            </a>
          ) : (
            <button
              type="button"
              disabled
              title="Gmail integration coming next — will create a draft in rowlystudios@gmail.com"
              className="inline-flex cursor-not-allowed items-center gap-1.5 rounded-md border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-white/40"
            >
              Send to Draft
              <span className="text-[10px] text-white/30">(soon)</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

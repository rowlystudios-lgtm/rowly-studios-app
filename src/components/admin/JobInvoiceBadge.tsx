'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

type InvoiceState = {
  id: string;
  status: string | null;
  email_status: string | null;
  paid_at: string | null;
  sent_to_client_at: string | null;
};

type Props = {
  jobId: string;
  /**
   * If false, the badge shows "Not ready" (no link). Pass true when the
   * job has at least one completed booking.
   */
  bookingsCompleted?: boolean;
  size?: 'sm' | 'md';
};

/**
 * JobInvoiceBadge — admin-only state-aware invoice link for a job row.
 *
 * Client component (compatible with parent 'use client' pages like /app/jobs).
 * Fetches /api/admin/jobs/[id]/invoice-status on mount.
 *
 * Five render states (same as v1 server version):
 *   1. !bookingsCompleted              → grey "Not ready"
 *   2. loading                         → grey "..." pulse
 *   3. no invoice                      → blue "+ Generate invoice" → /admin/jobs/[id]
 *   4. invoice draft                   → amber "Draft ready →" → /admin/invoice-drafts/[id]
 *   5. invoice sent (not paid)         → indigo "Sent →" → /admin/invoice-drafts/[id]
 *   6. invoice paid                    → emerald "Paid →" → /admin/invoice-drafts/[id]
 *   7. invoice failed                  → red "Failed — review →" → /admin/invoice-drafts/[id]
 */
export default function JobInvoiceBadge({
  jobId,
  bookingsCompleted = true,
  size = 'sm',
}: Props) {
  const [invoice, setInvoice] = useState<InvoiceState | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch(`/api/admin/jobs/${jobId}/invoice-status`);
        const data = await res.json();
        if (cancelled) return;
        if (data.ok && data.invoice) {
          setInvoice(data.invoice);
        } else {
          setInvoice(null);
        }
      } catch {
        // swallow — bias toward showing "Generate invoice" rather than failing the row
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    if (bookingsCompleted) load();
    else setLoading(false);

    return () => { cancelled = true; };
  }, [jobId, bookingsCompleted]);

  const sizeClasses =
    size === 'sm' ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-xs';

  if (!bookingsCompleted) {
    return (
      <span className={`inline-flex items-center rounded-full bg-stone-100 ${sizeClasses} font-medium text-stone-400`}>
        Not ready
      </span>
    );
  }

  if (loading) {
    return (
      <span className={`inline-flex items-center rounded-full bg-stone-100 ${sizeClasses} font-medium text-stone-400 animate-pulse`}>
        …
      </span>
    );
  }

  if (!invoice) {
    return (
      <Link
        href={`/admin/jobs/${jobId}`}
        className={`inline-flex items-center gap-1 rounded-full bg-blue-50 ${sizeClasses} font-medium text-blue-800 hover:bg-blue-100`}
      >
        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
        </svg>
        Generate invoice
      </Link>
    );
  }

  const tone =
    invoice.paid_at ? 'emerald' :
    invoice.sent_to_client_at ? 'indigo' :
    invoice.email_status === 'failed' ? 'red' :
    invoice.email_status === 'sent' ? 'indigo' :
    'amber';

  const label =
    invoice.paid_at ? 'Paid' :
    invoice.sent_to_client_at ? 'Sent' :
    invoice.email_status === 'failed' ? 'Failed — review' :
    invoice.email_status === 'sent' ? 'Sent' :
    invoice.email_status === 'draft_ready' || invoice.email_status === 'draft_pending' ? 'Draft ready' :
    invoice.status === 'paid' ? 'Paid' :
    'Draft ready';

  const colorClasses =
    tone === 'emerald' ? 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100' :
    tone === 'indigo' ? 'bg-indigo-50 text-indigo-800 hover:bg-indigo-100' :
    tone === 'red' ? 'bg-red-50 text-red-800 hover:bg-red-100' :
    'bg-amber-50 text-amber-800 hover:bg-amber-100';

  return (
    <Link
      href={`/admin/invoice-drafts/${invoice.id}`}
      className={`inline-flex items-center gap-1 rounded-full ${sizeClasses} font-medium ${colorClasses}`}
    >
      {label}
      <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3" />
      </svg>
    </Link>
  );
}

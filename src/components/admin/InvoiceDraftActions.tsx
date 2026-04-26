'use client';

import { useState } from 'react';

type Props = {
  invoiceId: string;
  paymentUrl: string | null;
  renderedHtml: string | null;
  renderedSubject: string | null;
  emailStatus: string | null;
};

/**
 * Admin actions row for the invoice draft preview.
 *
 * Slice 1: copy HTML to clipboard (admin pastes into Gmail), copy payment URL,
 *           open the live Stripe Checkout page (test pay).
 * Slice 2: replace the "Copy email source" with "Send via Gmail" / "Send via Resend".
 */
export default function InvoiceDraftActions({
  invoiceId,
  paymentUrl,
  renderedHtml,
  renderedSubject,
  emailStatus,
}: Props) {
  const [copied, setCopied] = useState<'html' | 'url' | 'subject' | null>(null);

  const copy = async (kind: 'html' | 'url' | 'subject', value: string | null) => {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopied(kind);
      setTimeout(() => setCopied(null), 1800);
    } catch {
      // fallback: select via temp textarea
      const ta = document.createElement('textarea');
      ta.value = value;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setCopied(kind);
      setTimeout(() => setCopied(null), 1800);
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-stone-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-stone-900">Send to client</h2>
        <p className="mt-1 text-xs text-stone-600">
          Slice 1: send manually by copying the HTML body into a new email in your
          inbox. The Stripe payment link is already embedded in the &ldquo;Pay with
          Stripe&rdquo; button. Subject &amp; recipient are below.
        </p>

        <div className="mt-3 grid gap-2 md:grid-cols-2">
          <button
            type="button"
            onClick={() => copy('subject', renderedSubject)}
            disabled={!renderedSubject}
            className="rounded-md border border-stone-300 bg-white px-3 py-2 text-sm text-stone-700 hover:bg-stone-50 disabled:opacity-50"
          >
            {copied === 'subject' ? '✓ Copied subject' : 'Copy email subject'}
          </button>
          <button
            type="button"
            onClick={() => copy('html', renderedHtml)}
            disabled={!renderedHtml}
            className="rounded-md border border-stone-300 bg-white px-3 py-2 text-sm text-stone-700 hover:bg-stone-50 disabled:opacity-50"
          >
            {copied === 'html' ? '✓ Copied HTML' : 'Copy email body (HTML)'}
          </button>
        </div>
      </div>

      <div className="rounded-lg border border-stone-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-stone-900">Stripe payment link</h2>
        <p className="mt-1 text-xs text-stone-600">
          The URL embedded in the &ldquo;Pay with Stripe&rdquo; button. Click to test the
          checkout page yourself, or copy to share manually.
        </p>

        {paymentUrl ? (
          <div className="mt-3 space-y-2">
            <div className="rounded border border-stone-200 bg-stone-50 px-3 py-2 font-mono text-xs text-stone-700 break-all">
              {paymentUrl}
            </div>
            <div className="flex gap-2">
              <a
                href={paymentUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{ backgroundColor: '#635BFF' }}
                className="rounded-md px-3 py-2 text-sm font-medium text-white hover:brightness-110"
              >
                Open Stripe Checkout ↗
              </a>
              <button
                type="button"
                onClick={() => copy('url', paymentUrl)}
                className="rounded-md border border-stone-300 bg-white px-3 py-2 text-sm text-stone-700 hover:bg-stone-50"
              >
                {copied === 'url' ? '✓ Copied' : 'Copy URL'}
              </button>
            </div>
          </div>
        ) : (
          <p className="mt-3 text-sm text-stone-500">No payment URL yet.</p>
        )}
      </div>

      <div className="rounded-lg border border-stone-200 bg-stone-50 p-4 text-xs text-stone-600">
        <p>
          <strong>Email status:</strong> <code>{emailStatus ?? '—'}</code>
        </p>
        <p className="mt-1">
          <strong>Slice 2 will add:</strong> Send via Gmail draft (creates a real Gmail
          draft in rowlystudios@gmail.com via Gmail API), Send via Resend (transactional
          send from noreply@rowlystudios.com). For now, manual copy/paste.
        </p>
      </div>
    </div>
  );
}

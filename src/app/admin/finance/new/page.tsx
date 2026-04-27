import Link from 'next/link';

/**
 * /admin/finance/new — DEPRECATED.
 *
 * Manual invoice creation has been replaced by the Phase D Stripe-integrated
 * flow. Invoices are now generated automatically from completed jobs via:
 *
 *   /admin/jobs/[id] → "Generate invoice" button
 *
 * This page replaces the old InvoiceForm UI to prevent admins (and future
 * Claude sessions) from accidentally creating orphan invoice rows that
 * bypass Stripe.
 *
 * The /admin/finance LIST view is preserved (legacy invoice audit trail).
 * Only the CREATE and EDIT paths are deprecated.
 */
export default function DeprecatedNewInvoicePage() {
  return (
    <div className="mx-auto max-w-2xl p-8">
      <div className="rounded-lg border border-amber-300 bg-amber-50 p-6">
        <div className="flex items-start gap-3">
          <svg
            className="mt-0.5 h-6 w-6 flex-shrink-0 text-amber-600"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
            aria-hidden="true"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M5 19h14a2 2 0 001.84-2.75L13.74 4a2 2 0 00-3.48 0L3.16 16.25A2 2 0 005 19z" />
          </svg>
          <div className="flex-1">
            <h1 className="text-lg font-semibold text-amber-900">
              Manual invoice creation is deprecated
            </h1>
            <p className="mt-2 text-sm text-amber-900">
              Invoices are now generated from completed jobs and integrate with Stripe
              automatically. The old &ldquo;new invoice&rdquo; form created records that
              bypassed Stripe — those records had no payment link, no client email, and
              no talent transfer scheduling.
            </p>

            <div className="mt-4 rounded-md border border-amber-200 bg-white p-4">
              <h2 className="text-sm font-semibold text-stone-900">How to create an invoice now</h2>
              <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-sm text-stone-700">
                <li>Navigate to <Link href="/admin/jobs" className="font-medium text-stone-900 underline">/admin/jobs</Link> and find the job</li>
                <li>Make sure all bookings on the job are marked <code className="rounded bg-stone-100 px-1 py-0.5 text-xs">completed</code></li>
                <li>Click the purple <strong>Generate invoice</strong> button</li>
                <li>You&rsquo;ll be sent to <code className="rounded bg-stone-100 px-1 py-0.5 text-xs">/admin/invoice-drafts/[id]</code> to preview and send</li>
              </ol>
            </div>

            <div className="mt-5 flex gap-3">
              <Link
                href="/admin/jobs"
                className="inline-flex items-center gap-2 rounded-md bg-stone-900 px-4 py-2 text-sm font-medium text-white hover:bg-stone-800"
              >
                Go to Jobs
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3" />
                </svg>
              </Link>
              <Link
                href="/admin/finance"
                className="inline-flex items-center rounded-md border border-stone-300 bg-white px-4 py-2 text-sm font-medium text-stone-700 hover:bg-stone-50"
              >
                Back to Finance
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

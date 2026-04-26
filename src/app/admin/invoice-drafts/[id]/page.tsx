import { redirect } from 'next/navigation';
import { requireAuth } from '@/lib/stripe/auth';
import InvoiceDraftActions from '@/components/admin/InvoiceDraftActions';

/**
 * /admin/invoice-drafts/[id]
 *
 * Server component. Renders:
 *   - The invoice email exactly as it'll be received (in an iframe srcdoc)
 *   - Metadata: job, client, total, payment status
 *   - Actions: copy email source, mark draft sent (manual), test pay link
 *
 * Slice 2 will add: "Send via Resend" / "Create Gmail draft" actions.
 */

export default async function InvoiceDraftPreviewPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: Promise<{ paid?: string; cancelled?: string }>;
}) {
  const { id } = params;
  const sp = await searchParams;
  const { supabase } = await requireAuth(['admin']);

  const { data: invoice, error } = await supabase
    .from('invoices')
    .select(`
      id, invoice_number, status, total_cents, client_total_cents,
      stripe_payment_link_url, stripe_payment_link_id,
      rendered_html, rendered_subject, rendered_at, email_status,
      sent_to_client_at, paid_at, sent_at,
      jobs:job_id ( id, title, job_code ),
      client_profiles:client_id ( id, company_name )
    `)
    .eq('id', id)
    .single();

  if (error || !invoice) {
    redirect('/admin');
  }

  const job = invoice.jobs as unknown as { id: string; title: string; job_code: string };
  const client = invoice.client_profiles as unknown as { id: string; company_name: string };

  const totalDollars = (invoice.total_cents ?? invoice.client_total_cents ?? 0) / 100;

  return (
    <div className="mx-auto max-w-5xl p-6">
      {sp.paid === '1' && (
        <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
          <strong>Test payment received.</strong> Webhook should have fired — check the database for paid_at.
        </div>
      )}
      {sp.cancelled === '1' && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          Payment was cancelled by the client.
        </div>
      )}

      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-stone-900">{invoice.invoice_number}</h1>
          <p className="mt-1 text-sm text-stone-600">
            {job?.title} · {client?.company_name} · ${totalDollars.toFixed(2)}
          </p>
          <div className="mt-2 flex flex-wrap gap-2 text-xs">
            <StatusPill label="Invoice status" value={invoice.status} />
            <StatusPill label="Email" value={invoice.email_status ?? '—'} />
            {invoice.paid_at && <StatusPill label="Paid" value={new Date(invoice.paid_at as string).toLocaleString()} tone="emerald" />}
            {invoice.sent_to_client_at && <StatusPill label="Sent" value={new Date(invoice.sent_to_client_at as string).toLocaleString()} tone="emerald" />}
          </div>
        </div>
        <a
          href={`/admin/jobs/${job?.id}`}
          className="text-sm text-stone-600 hover:text-stone-900"
        >
          ← Back to job
        </a>
      </div>

      {/* Email preview iframe */}
      <div className="mb-6 overflow-hidden rounded-lg border border-stone-200 bg-stone-100">
        <div className="flex items-center justify-between border-b border-stone-200 bg-white px-4 py-2">
          <div className="text-xs font-medium text-stone-500">
            EMAIL PREVIEW · {invoice.rendered_subject ?? 'no subject'}
          </div>
          <div className="text-xs text-stone-400">
            {invoice.rendered_at
              ? `Generated ${new Date(invoice.rendered_at as string).toLocaleString()}`
              : 'Not yet rendered'}
          </div>
        </div>
        {invoice.rendered_html ? (
          <iframe
            srcDoc={invoice.rendered_html as string}
            title="Invoice email preview"
            sandbox=""
            style={{ width: '100%', height: '900px', border: 0, backgroundColor: '#0a1929' }}
          />
        ) : (
          <div className="p-8 text-center text-sm text-stone-500">
            No rendered HTML yet. Click &ldquo;Generate invoice&rdquo; on the job page.
          </div>
        )}
      </div>

      {/* Actions row */}
      <InvoiceDraftActions
        invoiceId={invoice.id}
        paymentUrl={invoice.stripe_payment_link_url ?? null}
        renderedHtml={(invoice.rendered_html as string) ?? null}
        renderedSubject={(invoice.rendered_subject as string) ?? null}
        emailStatus={invoice.email_status ?? null}
      />
    </div>
  );
}

function StatusPill({
  label,
  value,
  tone = 'stone',
}: {
  label: string;
  value: string;
  tone?: 'stone' | 'emerald' | 'amber';
}) {
  const colors =
    tone === 'emerald' ? 'bg-emerald-50 text-emerald-800 border-emerald-200' :
    tone === 'amber' ? 'bg-amber-50 text-amber-800 border-amber-200' :
    'bg-stone-100 text-stone-700 border-stone-200';
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 ${colors}`}>
      <span className="font-medium">{label}:</span>
      <span>{value}</span>
    </span>
  );
}

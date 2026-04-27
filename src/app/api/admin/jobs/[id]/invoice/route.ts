import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/stripe/auth';

/**
 * GET /api/admin/jobs/[id]/invoice
 *
 * Returns the latest invoice for a job, including the rendered email HTML
 * for inline preview rendering on the admin /app/jobs job card.
 *
 * Admin only. Used by JobInvoiceCard component.
 *
 * Response:
 *   { ok: true, invoice: InvoiceData | null }
 *
 * If no invoice exists for the job, returns invoice=null (not an error).
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const { supabase } = await requireAuth(['admin']);
    const { id: jobId } = params;

    const { data: invoice, error } = await supabase
      .from('invoices')
      .select(
        'id, invoice_number, status, email_status, total_cents, client_total_cents, rendered_html, rendered_subject, stripe_payment_link_url, gmail_draft_id, paid_at, sent_to_client_at, created_at',
      )
      .eq('job_id', jobId)
      .order('rendered_at', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, invoice: invoice ?? null });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

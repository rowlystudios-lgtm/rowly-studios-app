import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/stripe/auth';

/**
 * GET /api/admin/jobs/[id]/invoice-status
 *
 * Lightweight endpoint for client-side badges. Returns the latest invoice
 * for a job (or null) with just enough data to render the right pill +
 * deep link.
 *
 * Auth: admin only.
 *
 * Response: { ok: true, invoice: InvoiceState | null }
 *   where InvoiceState = {
 *     id, status, email_status, paid_at, sent_to_client_at
 *   }
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const { supabase } = await requireAuth(['admin']);
    const { id: jobId } = params;

    const { data: invoice } = await supabase
      .from('invoices')
      .select('id, status, email_status, paid_at, sent_to_client_at')
      .eq('job_id', jobId)
      .order('rendered_at', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    return NextResponse.json({ ok: true, invoice: invoice ?? null });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

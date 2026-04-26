import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/stripe/auth';
import { generateInvoiceDraft } from '@/lib/stripe/invoice-generator';

/**
 * POST /api/admin/jobs/[id]/generate-invoice
 *
 * Phase D: replaces the C-1 send-invoice route.
 * Creates a Stripe Checkout Session, renders the styled email HTML, and
 * persists everything to the invoices row. Email_status is left as
 * 'draft_pending' — Slice 2 (delivery layer) sends the email.
 *
 * Auth: admin only.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const { profile, supabase } = await requireAuth(['admin']);
    const { id: jobId } = params;

    // Use request origin as the base URL for success/cancel redirects.
    const baseUrl = req.headers.get('origin') ?? new URL(req.url).origin;

    const result = await generateInvoiceDraft(supabase, {
      jobId,
      createdByUserId: profile.id,
      baseUrl,
    });

    if (!result.ok) {
      const status =
        result.reason === 'job_not_found' ? 404 :
        result.reason === 'invoice_already_exists' ? 409 :
        400;
      return NextResponse.json(result, { status });
    }

    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof NextResponse) return e;
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

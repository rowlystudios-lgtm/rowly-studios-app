import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/stripe/auth';
import { createAndSendInvoice } from '@/lib/stripe/invoicing';

/**
 * POST /api/admin/jobs/[id]/send-invoice
 *
 * Creates a Stripe Invoice on the platform's Stripe account, populated
 * with line items per the spec (Pattern Y: combined client invoice with
 * Separate Charges and Transfers). Stripe sends the email; client gets
 * a hosted payment page.
 *
 * Records the local invoices row + talent_payments rows (status='scheduled').
 * After the client pays, the webhook flips talent_payments to 'pending_release'
 * with scheduled_release_at = now + 5 days.
 *
 * Auth: admin only.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const { profile, supabase } = await requireAuth(['admin']);
    const { id: jobId } = params;

    const result = await createAndSendInvoice(supabase, {
      jobId,
      createdByUserId: profile.id,
    });

    if (!result.ok) {
      const status =
        result.reason === 'job_not_found' ? 404 :
        result.reason === 'invoice_already_sent' ? 409 :
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

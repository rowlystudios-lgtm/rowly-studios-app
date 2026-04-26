import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/stripe/auth';
import { buildInvoicePreview } from '@/lib/stripe/invoicing';

/**
 * GET /api/admin/jobs/[id]/invoice-preview
 *
 * Returns a complete invoice preview without creating anything in Stripe.
 * Used by the admin UI to show what'll happen before clicking "Send."
 *
 * Auth: admin only.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const { supabase } = await requireAuth(['admin']);
    const { id: jobId } = params;

    const preview = await buildInvoicePreview(supabase, jobId);

    if (!preview.ok) {
      return NextResponse.json(preview, { status: 400 });
    }

    return NextResponse.json(preview);
  } catch (e) {
    if (e instanceof NextResponse) return e;
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

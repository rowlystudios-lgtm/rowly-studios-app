import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, getServiceSupabase } from '@/lib/stripe/auth';
import { createGmailDraft } from '@/lib/gmail/drafts';

/**
 * POST /api/admin/jobs/[id]/send-invoice-draft
 *
 * Admin-only. Looks up the latest invoice for the job, fetches the client's
 * email, calls Gmail API to create a draft in the admin's Gmail inbox, then
 * persists the draft ID on the invoice row.
 *
 * Idempotent-ish: if a draft already exists for this invoice (gmail_draft_id
 * is set), refuses to create a second one. To resend, admin must clear the
 * existing draft first (manual workflow for now).
 *
 * Response: { ok: true, draftId, gmailUrl } | { ok: false, reason, message }
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const { profile } = await requireAuth(['admin']);
    const supabase = getServiceSupabase();
    const { id: jobId } = params;

    // 1. Find the latest invoice for this job
    const { data: invoice, error: invErr } = await supabase
      .from('invoices')
      .select(
        'id, invoice_number, client_id, rendered_html, rendered_subject, gmail_draft_id, email_status',
      )
      .eq('job_id', jobId)
      .order('rendered_at', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (invErr) {
      return NextResponse.json(
        { ok: false, reason: 'database_error', message: invErr.message },
        { status: 500 },
      );
    }
    if (!invoice) {
      return NextResponse.json(
        { ok: false, reason: 'no_invoice', message: 'No invoice exists for this job yet.' },
        { status: 400 },
      );
    }
    if (!invoice.rendered_html) {
      return NextResponse.json(
        { ok: false, reason: 'invoice_not_rendered', message: 'Invoice email has not been rendered yet.' },
        { status: 400 },
      );
    }
    if (invoice.gmail_draft_id) {
      return NextResponse.json(
        {
          ok: false,
          reason: 'draft_already_exists',
          message: 'A Gmail draft already exists for this invoice.',
          draftId: invoice.gmail_draft_id,
        },
        { status: 409 },
      );
    }

    // 2. Find the client's email
    const { data: clientProfile, error: clientErr } = await supabase
      .from('profiles')
      .select('email, full_name, first_name, last_name')
      .eq('id', invoice.client_id)
      .single();

    if (clientErr || !clientProfile?.email) {
      return NextResponse.json(
        {
          ok: false,
          reason: 'no_client_email',
          message: clientErr?.message ?? 'Client email not found.',
        },
        { status: 400 },
      );
    }

    // 3. Create the Gmail draft
    let draftResult;
    try {
      draftResult = await createGmailDraft(supabase, {
        userId: profile.id,
        toEmail: clientProfile.email,
        subject: invoice.rendered_subject ?? `Invoice ${invoice.invoice_number} from Rowly Studios`,
        htmlBody: invoice.rendered_html,
      });
    } catch (gmailErr) {
      const msg = gmailErr instanceof Error ? gmailErr.message : 'Unknown Gmail error';
      // Most common: "No Gmail tokens for this user. Connect Gmail first."
      if (msg.toLowerCase().includes('no gmail tokens')) {
        return NextResponse.json(
          {
            ok: false,
            reason: 'gmail_not_connected',
            message: 'Connect your Gmail account first (admin profile → Connect Gmail).',
          },
          { status: 412 },
        );
      }
      return NextResponse.json(
        { ok: false, reason: 'gmail_api_error', message: msg },
        { status: 502 },
      );
    }

    // 4. Persist draft ID on the invoice
    const { error: updErr } = await supabase
      .from('invoices')
      .update({
        gmail_draft_id: draftResult.draftId,
        email_status: 'draft_ready',
      })
      .eq('id', invoice.id);

    if (updErr) {
      // Draft was created in Gmail but we couldn't save the ID. Surface this
      // honestly — the admin can find the draft in Gmail manually.
      return NextResponse.json(
        {
          ok: false,
          reason: 'draft_created_but_db_update_failed',
          message: `Draft was created in Gmail (id: ${draftResult.draftId}) but we couldn't save the ID to the database: ${updErr.message}`,
          draftId: draftResult.draftId,
        },
        { status: 500 },
      );
    }

    return NextResponse.json({
      ok: true,
      draftId: draftResult.draftId,
      gmailUrl: `https://mail.google.com/mail/u/0/#drafts/${draftResult.draftId}`,
      googleEmail: draftResult.googleEmail,
    });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

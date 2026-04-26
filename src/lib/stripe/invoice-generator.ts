import type { SupabaseClient } from '@supabase/supabase-js';
import {
  calculateBreakdown,
  type StripePaymentMethodType,
  RS_FEE_PERCENT,
} from './config';
import { renderInvoiceEmail, type InvoiceCrewMember } from './invoice-template';
import { createInvoiceCheckoutSession } from './checkout-session-payment';

/**
 * Phase D — invoice generator.
 *
 * Flow:
 *   1. Pull job + bookings + client + talent data
 *   2. Compute math (per-talent rate × 1.15 rounded up; processing fee from total)
 *   3. Create a Stripe Checkout Session with saved customer + default PM
 *   4. Render the email HTML + subject
 *   5. Persist everything to the invoices row (rendered_html, rendered_subject,
 *      stripe_payment_link_id = checkout session id, email_status = 'draft_pending')
 *   6. Return the invoice id and rendered preview URL
 *
 * The delivery layer (Slice 2 — Gmail API or Resend) reads from
 * invoices.rendered_html when email_status = 'draft_pending' and sends.
 *
 * Math (different from C-1):
 *   - Each talent line displays rate × 1.15, rounded UP to nearest cent
 *   - Total = sum of displayed lines + processing fee
 *   - The displayed RS-fee-included rate IS the line item; no separate RS fee row
 *   - Internal accounting (what RS keeps) still uses RS_FEE_PERCENT × talent rate
 *     so the rs_fee_cents and talent_payments rows reflect the contracted split.
 */

export type GenerateResult =
  | {
      ok: true;
      invoiceId: string;
      invoiceNumber: string;
      checkoutSessionId: string;
      paymentUrl: string;
      previewUrl: string;
      totalCents: number;
    }
  | {
      ok: false;
      reason:
        | 'job_not_found'
        | 'no_completed_bookings'
        | 'client_no_stripe_customer'
        | 'client_no_payment_method'
        | 'talent_not_active'
        | 'invoice_already_exists'
        | 'stripe_error';
      message: string;
    };

export async function generateInvoiceDraft(
  supabase: SupabaseClient,
  params: { jobId: string; createdByUserId: string; baseUrl: string },
): Promise<GenerateResult> {
  // 1. Job + client
  const { data: job, error: jobErr } = await supabase
    .from('jobs')
    .select(
      'id, title, job_code, client_id, start_date, end_date, call_time, end_time, shoot_duration_hours, location, address_line, address_city, address_state, address_zip',
    )
    .eq('id', params.jobId)
    .single();

  if (jobErr || !job) {
    return { ok: false, reason: 'job_not_found', message: 'Job not found' };
  }

  const { data: clientProfile } = await supabase
    .from('client_profiles')
    .select(
      'id, company_name, stripe_customer_id, stripe_default_payment_method_id, stripe_default_payment_method_type, stripe_default_payment_method_last4, stripe_default_payment_method_brand',
    )
    .eq('id', job.client_id)
    .single();

  if (!clientProfile?.stripe_customer_id) {
    return {
      ok: false,
      reason: 'client_no_stripe_customer',
      message: 'Client has no Stripe Customer.',
    };
  }
  if (!clientProfile.stripe_default_payment_method_id) {
    return {
      ok: false,
      reason: 'client_no_payment_method',
      message: 'Client has no default payment method.',
    };
  }

  const pmType = (clientProfile.stripe_default_payment_method_type ?? 'us_bank_account') as StripePaymentMethodType;

  // 2. Completed bookings (Phase D triggers on completed, not confirmed)
  const { data: bookings } = await supabase
    .from('job_bookings')
    .select(`
      id, status, confirmed_rate_cents, talent_id,
      profiles:talent_id ( id, full_name, first_name, last_name, email ),
      talent_profiles:talent_id ( stripe_account_id, stripe_account_status, talent_id_code, department )
    `)
    .eq('job_id', params.jobId)
    .eq('status', 'completed');

  if (!bookings || bookings.length === 0) {
    return {
      ok: false,
      reason: 'no_completed_bookings',
      message: 'No completed bookings on this job to invoice for.',
    };
  }

  // Verify all talent are Stripe-active
  const inactive = bookings.filter((b) => {
    const tp = (b.talent_profiles as unknown as { stripe_account_status: string } | null);
    return !tp || tp.stripe_account_status !== 'active';
  });
  if (inactive.length > 0) {
    return {
      ok: false,
      reason: 'talent_not_active',
      message: `${inactive.length} talent on this job ${inactive.length === 1 ? 'has' : 'have'} not connected Stripe.`,
    };
  }

  // 3. Don't double-invoice
  const { data: existing } = await supabase
    .from('invoices')
    .select('id, stripe_invoice_id, stripe_payment_link_id, status')
    .eq('job_id', params.jobId)
    .or('stripe_payment_link_id.not.is.null,stripe_invoice_id.not.is.null')
    .maybeSingle();

  if (existing) {
    return {
      ok: false,
      reason: 'invoice_already_exists',
      message: `This job already has an invoice (${existing.id}). Void it first if you need to recreate.`,
    };
  }

  // 4. Compute math
  // Per-talent: displayed amount = rate × 1.15, rounded UP to nearest cent.
  // Internal: rs_fee_cents = displayed - rate (so accounting stays clean).
  let talentSubtotalCents = 0;
  let rsFeeCents = 0;
  let displayedSubtotalCents = 0;

  const crewLines = bookings.map((b) => {
    const profile = b.profiles as unknown as { id: string; full_name: string | null; first_name: string | null; last_name: string | null; email: string };
    const tp = b.talent_profiles as unknown as { talent_id_code: string; department: string };
    const rateCents = b.confirmed_rate_cents ?? 0;
    // ceil to nearest cent: rate × 1.15, in cents
    const displayedCents = Math.ceil(rateCents * (1 + RS_FEE_PERCENT));
    const thisRsFee = displayedCents - rateCents;

    talentSubtotalCents += rateCents;
    rsFeeCents += thisRsFee;
    displayedSubtotalCents += displayedCents;

    const fullName = profile.full_name ?? (`${profile.first_name ?? ''} ${profile.last_name ?? ''}`.trim() || profile.email);
    const initials =
      [profile.first_name, profile.last_name]
        .filter(Boolean)
        .map((s) => (s as string).charAt(0).toUpperCase())
        .join('')
        .slice(0, 2) || fullName.charAt(0).toUpperCase();

    return {
      bookingId: b.id,
      talentId: profile.id,
      rateCents,
      displayedCents,
      rsFeeCents: thisRsFee,
      crewLine: {
        fullName,
        initials,
        department: titleCase(tp.department ?? ''),
        talentIdCode: tp.talent_id_code ?? '—',
        displayedAmountDollars: displayedCents / 100,
      } satisfies InvoiceCrewMember,
    };
  });

  // Processing fee from CalcBreakdown — driven off the displayed subtotal
  const breakdown = calculateBreakdown(displayedSubtotalCents, pmType);
  // Hack: calculateBreakdown expects the talent subtotal but math works the same
  // when we feed it displayed subtotal — the processing fee is computed off the
  // "money in" not the talent rate.
  const processingFeeCents = breakdown.stripeFeeCents;
  const totalCents = displayedSubtotalCents + processingFeeCents;

  // 5. Get next invoice number
  const { data: invoiceCountRow } = await supabase
    .from('invoices')
    .select('id', { count: 'exact', head: true });
  const nextInvoiceNum = ((invoiceCountRow as unknown as number) ?? 0) + 1;
  // Better: use a sequence. For now we count rows + 1 for simplicity.
  // (Phase D-2 polish: dedicated sequence.)
  const invoiceNumber = `RS-INV-${String(nextInvoiceNum).padStart(4, '0')}`;

  // 6. Persist a stub invoice row to get the invoice_id (which goes in the
  //    Checkout Session metadata, which goes in the email).
  const { data: stubInvoice, error: stubErr } = await supabase
    .from('invoices')
    .insert({
      job_id: params.jobId,
      client_id: clientProfile.id,
      invoice_number: invoiceNumber,
      status: 'draft',
      subtotal_cents: displayedSubtotalCents,
      rs_fee_percent: RS_FEE_PERCENT * 100,
      rs_fee_cents: rsFeeCents,
      talent_total_cents: talentSubtotalCents,
      client_total_cents: totalCents,
      total_cents: totalCents,
      created_by: params.createdByUserId,
      stripe_payment_method_type: pmType,
      stripe_processing_fee_cents: processingFeeCents,
      stripe_processing_fee_passed_to_client: true,
      email_status: 'draft_pending',
    })
    .select('id')
    .single();

  if (stubErr || !stubInvoice) {
    return {
      ok: false,
      reason: 'stripe_error',
      message: `Failed to persist invoice: ${stubErr?.message ?? 'unknown'}`,
    };
  }

  const invoiceId = stubInvoice.id;

  try {
    // 7. Create Checkout Session
    const successUrl = `${params.baseUrl}/admin/invoice-drafts/${invoiceId}?paid=1`;
    const cancelUrl = `${params.baseUrl}/admin/invoice-drafts/${invoiceId}?cancelled=1`;
    const description = `Invoice ${invoiceNumber} — ${job.title}`;

    const { url: paymentUrl, sessionId } = await createInvoiceCheckoutSession({
      customerId: clientProfile.stripe_customer_id,
      amountCents: totalCents,
      description,
      preferredPaymentMethodType: pmType,
      successUrl,
      cancelUrl,
      invoiceNumber,
      metadata: {
        rs_invoice_id: invoiceId,
        rs_job_id: params.jobId,
        rs_client_id: clientProfile.id,
      },
    });

    // 8. Render the email
    const paymentMethodLabel = pmType === 'us_bank_account'
      ? `${clientProfile.stripe_default_payment_method_brand ?? 'Bank'} ····${clientProfile.stripe_default_payment_method_last4 ?? '----'}`
      : `${(clientProfile.stripe_default_payment_method_brand ?? '').toUpperCase()} ····${clientProfile.stripe_default_payment_method_last4 ?? '----'}`;

    const processingFeeLabel = pmType === 'us_bank_account' ? 'Bank transfer fee' : 'Card processing fee';

    // Format the date/time for display
    const startDate = new Date(job.start_date + 'T00:00:00');
    const dayName = startDate.toLocaleDateString('en-US', { weekday: 'long' });
    const longDate = startDate.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    const jobDateText = `${dayName}, ${longDate}`;
    const startTimeText = formatTime(job.call_time as string | null);
    const endTimeText = formatTime(job.end_time as string | null);
    const jobTimeText = startTimeText && endTimeText ? `${startTimeText} – ${endTimeText}` : (startTimeText ?? 'TBD');

    const issuedDateText = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

    const locationText = job.location
      || [job.address_line, [job.address_city, job.address_state].filter(Boolean).join(', '), job.address_zip].filter(Boolean).join('\n')
      || 'TBD';

    const { data: clientUser } = await supabase
      .from('profiles')
      .select('email')
      .eq('id', clientProfile.id)
      .single();

    const { html, subject } = renderInvoiceEmail({
      invoiceNumber,
      issuedDateText,
      dueText: 'Due on receipt',
      clientCompanyName: clientProfile.company_name ?? clientUser?.email ?? '(client)',
      jobTitle: job.title,
      jobCode: job.job_code ?? invoiceNumber,
      jobDateText,
      jobTimeText,
      jobDurationHours: job.shoot_duration_hours ? Number(job.shoot_duration_hours) : 0,
      jobLocationText: locationText,
      crew: crewLines.map((l) => l.crewLine),
      processingFeeLabel,
      paymentMethodLabel,
      processingFeeDollars: processingFeeCents / 100,
      totalDollars: totalCents / 100,
      paymentUrl,
      contactEmail: 'rowlystudios@gmail.com',
      // logoUrl: omitted — fallback to text wordmark for now. Add CDN URL in Slice 2.
    });

    // 9. Update the invoice row with rendered HTML + Checkout Session
    const { error: updErr } = await supabase
      .from('invoices')
      .update({
        rendered_html: html,
        rendered_subject: subject,
        rendered_at: new Date().toISOString(),
        stripe_payment_link_url: paymentUrl,
        stripe_payment_link_id: sessionId,
        email_status: 'draft_pending',
      })
      .eq('id', invoiceId);

    if (updErr) {
      return {
        ok: false,
        reason: 'stripe_error',
        message: `Failed to update invoice with rendered email: ${updErr.message}`,
      };
    }

    // 10. Pre-create talent_payments rows in 'scheduled' status
    const tpRows = crewLines.map((l) => ({
      invoice_id: invoiceId,
      job_id: params.jobId,
      booking_id: l.bookingId,
      talent_id: l.talentId,
      tax_year: new Date().getFullYear(),
      amount_cents: l.rateCents,
      payment_date: new Date().toISOString().slice(0, 10),
      payment_method: 'stripe_transfer',
      reference: invoiceId,
      stripe_status: 'scheduled',
      rs_fee_cents: l.rsFeeCents,
      gross_charge_cents: l.displayedCents,
      created_by: params.createdByUserId,
    }));

    await supabase.from('talent_payments').insert(tpRows);

    return {
      ok: true,
      invoiceId,
      invoiceNumber,
      checkoutSessionId: sessionId,
      paymentUrl,
      previewUrl: `${params.baseUrl}/admin/invoice-drafts/${invoiceId}`,
      totalCents,
    };
  } catch (err) {
    // Best-effort: mark the stub invoice as failed
    await supabase
      .from('invoices')
      .update({ status: 'failed', email_status: 'failed' })
      .eq('id', invoiceId);
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return {
      ok: false,
      reason: 'stripe_error',
      message: `Stripe error during invoice generation: ${msg}`,
    };
  }
}

function formatTime(time: string | null): string | null {
  if (!time) return null;
  // "10:00:00" -> "10:00 AM"
  const [hStr, mStr] = time.split(':');
  let h = parseInt(hStr, 10);
  const m = mStr ?? '00';
  const ampm = h >= 12 ? 'PM' : 'AM';
  if (h === 0) h = 12;
  else if (h > 12) h -= 12;
  return `${h}:${m} ${ampm}`;
}

function titleCase(s: string): string {
  return s.replace(/\w\S*/g, (t) => t.charAt(0).toUpperCase() + t.slice(1).toLowerCase());
}

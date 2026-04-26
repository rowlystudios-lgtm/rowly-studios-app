import type { SupabaseClient } from '@supabase/supabase-js';
import type Stripe from 'stripe';
import { stripe } from './client';
import {
  calculateBreakdown,
  type StripePaymentMethodType,
  type InvoiceBreakdown,
  RS_FEE_PERCENT,
} from './config';

/**
 * Phase C-1 — invoicing orchestrator.
 *
 * Flow (Pattern Y, Separate Charges and Transfers):
 *   1. Caller asks for an InvoicePreview to see what will happen
 *   2. Caller calls createAndSendInvoice() to actually fire it
 *   3. Stripe Invoice is created on the platform's Stripe account, with
 *      the client's saved Customer + chosen payment method type
 *   4. Stripe sends email; client pays via hosted page
 *   5. Webhook (separate file) marks our invoices row paid and schedules
 *      talent_payments for transfer release
 *   6. Phase C-2 cron actually fires the transfers
 *
 * Defense-in-depth: even though Phase B-Gate ensures all parties are
 * Stripe-active before we get here, every entry point re-checks.
 */

// ---- Types -------------------------------------------------------

export interface InvoicePreviewBlocker {
  reason:
    | 'no_confirmed_bookings'
    | 'client_no_stripe_customer'
    | 'client_no_payment_method'
    | 'talent_not_active'
    | 'invoice_already_sent'
    | 'job_not_found'
    | 'stripe_error';
  message: string;
  /** Talent IDs blocking, if any. */
  blockers?: Array<{ talentId: string; talentName?: string; status: string }>;
}

export interface InvoicePreview {
  ok: true;
  jobId: string;
  jobTitle: string;
  jobCode: string | null;
  clientId: string;
  clientName: string;
  paymentMethodType: StripePaymentMethodType;
  paymentMethodLabel: string; // "Bank transfer (ACH)" or "Card · Visa ····4242"
  bookings: Array<{
    bookingId: string;
    talentId: string;
    talentName: string;
    talentEmail: string;
    confirmedRateCents: number;
    rsFeeCents: number;
    talentNetCents: number;
  }>;
  totals: {
    talentSubtotalCents: number;
    rsFeeCents: number;
    processingFeeCents: number;
    clientTotalCents: number;
  };
  /** True if there's already a Stripe-sent invoice for this job. */
  alreadySent: boolean;
  existingInvoiceId?: string;
  existingHostedUrl?: string | null;
}

export type PreviewResult = InvoicePreview | (InvoicePreviewBlocker & { ok: false });

// ---- Preview ------------------------------------------------------

export async function buildInvoicePreview(
  supabase: SupabaseClient,
  jobId: string,
): Promise<PreviewResult> {
  // 1. Job + client
  const { data: job, error: jobErr } = await supabase
    .from('jobs')
    .select('id, title, job_code, client_id')
    .eq('id', jobId)
    .single();

  if (jobErr || !job) {
    return { ok: false, reason: 'job_not_found', message: 'Job not found' };
  }

  const { data: clientProfile } = await supabase
    .from('client_profiles')
    .select('id, company_name, stripe_customer_id, stripe_default_payment_method_id, stripe_default_payment_method_type, stripe_default_payment_method_last4, stripe_default_payment_method_brand')
    .eq('id', job.client_id)
    .single();

  if (!clientProfile?.stripe_customer_id) {
    return {
      ok: false,
      reason: 'client_no_stripe_customer',
      message: 'Client has no Stripe Customer. They need to add a payment method first.',
    };
  }
  if (!clientProfile.stripe_default_payment_method_id) {
    return {
      ok: false,
      reason: 'client_no_payment_method',
      message: 'Client has no default payment method. They need to add one in Profile → Payment settings.',
    };
  }

  const pmType = (clientProfile.stripe_default_payment_method_type ?? 'us_bank_account') as StripePaymentMethodType;

  // 2. Confirmed bookings + their talent details + Stripe state
  const { data: bookings } = await supabase
    .from('job_bookings')
    .select(`
      id, status, confirmed_rate_cents, talent_id,
      profiles:talent_id ( id, full_name, first_name, email ),
      talent_profiles:talent_id ( stripe_account_id, stripe_account_status )
    `)
    .eq('job_id', jobId)
    .eq('status', 'confirmed');

  if (!bookings || bookings.length === 0) {
    return {
      ok: false,
      reason: 'no_confirmed_bookings',
      message: 'No confirmed bookings on this job to invoice for.',
    };
  }

  // 3. Verify every talent is Stripe-active
  const inactiveTalent = bookings
    .map((b) => {
      const tp = (b.talent_profiles as unknown as { stripe_account_id: string | null; stripe_account_status: string }) ?? null;
      const profile = (b.profiles as unknown as { id: string; full_name: string | null; first_name: string | null; email: string }) ?? null;
      return { booking: b, tp, profile };
    })
    .filter(({ tp }) => !tp || tp.stripe_account_status !== 'active');

  if (inactiveTalent.length > 0) {
    return {
      ok: false,
      reason: 'talent_not_active',
      message: `${inactiveTalent.length} talent on this job ${inactiveTalent.length === 1 ? 'has' : 'have'} not connected Stripe. Cannot invoice yet.`,
      blockers: inactiveTalent.map((x) => ({
        talentId: x.profile?.id ?? '',
        talentName: x.profile?.full_name ?? x.profile?.first_name ?? x.profile?.email ?? '(unknown)',
        status: x.tp?.stripe_account_status ?? 'not_connected',
      })),
    };
  }

  // 4. Compute totals across all bookings using the chosen payment method type
  let talentSubtotalCents = 0;
  let rsFeeCents = 0;

  const bookingLines = bookings.map((b) => {
    const profile = (b.profiles as unknown as { id: string; full_name: string | null; first_name: string | null; email: string }) ?? null;
    const rate = b.confirmed_rate_cents ?? 0;
    const rs = Math.round(rate * RS_FEE_PERCENT);
    talentSubtotalCents += rate;
    rsFeeCents += rs;
    return {
      bookingId: b.id,
      talentId: b.talent_id,
      talentName: profile?.full_name ?? profile?.first_name ?? profile?.email ?? '(unknown talent)',
      talentEmail: profile?.email ?? '',
      confirmedRateCents: rate,
      rsFeeCents: rs,
      talentNetCents: rate, // Talent receives the full negotiated rate
    };
  });

  // Compute the processing fee + client total using the per-method math from config.ts.
  // Apply against the COMBINED talent + RS subtotal for proper Pattern Y.
  const breakdown: InvoiceBreakdown = calculateBreakdown(
    talentSubtotalCents + rsFeeCents,
    pmType,
  );
  // The breakdown's "talentFeeCents" arg is misleading here — it expects the
  // talent fee, not the combined subtotal. Recompute using same primitives:
  const subtotalCents = talentSubtotalCents + rsFeeCents;
  const processingFeeCents = breakdown.clientTotalCents - subtotalCents;
  const clientTotalCents = subtotalCents + processingFeeCents;

  // 5. Has this job already been invoiced via Stripe?
  const { data: existingInvoice } = await supabase
    .from('invoices')
    .select('id, stripe_invoice_id, stripe_payment_link_url, status')
    .eq('job_id', jobId)
    .not('stripe_invoice_id', 'is', null)
    .maybeSingle();

  const paymentMethodLabel =
    pmType === 'us_bank_account'
      ? `Bank transfer · ${clientProfile.stripe_default_payment_method_brand ?? 'ACH'} ····${clientProfile.stripe_default_payment_method_last4 ?? ''}`.trim()
      : `Card · ${(clientProfile.stripe_default_payment_method_brand ?? '').toUpperCase()} ····${clientProfile.stripe_default_payment_method_last4 ?? ''}`.trim();

  return {
    ok: true,
    jobId: job.id,
    jobTitle: job.title,
    jobCode: job.job_code ?? null,
    clientId: clientProfile.id,
    clientName: clientProfile.company_name ?? '(unnamed client)',
    paymentMethodType: pmType,
    paymentMethodLabel,
    bookings: bookingLines,
    totals: {
      talentSubtotalCents,
      rsFeeCents,
      processingFeeCents,
      clientTotalCents,
    },
    alreadySent: !!existingInvoice?.stripe_invoice_id,
    existingInvoiceId: existingInvoice?.stripe_invoice_id ?? undefined,
    existingHostedUrl: existingInvoice?.stripe_payment_link_url ?? null,
  };
}

// ---- Create + Send -----------------------------------------------

export type SendResult =
  | { ok: true; invoiceId: string; stripeInvoiceId: string; hostedUrl: string | null; status: string }
  | (InvoicePreviewBlocker & { ok: false });

export async function createAndSendInvoice(
  supabase: SupabaseClient,
  params: { jobId: string; createdByUserId: string },
): Promise<SendResult> {
  // 1. Re-run the preview as defense-in-depth
  const preview = await buildInvoicePreview(supabase, params.jobId);
  if (!preview.ok) return preview;

  if (preview.alreadySent) {
    return {
      ok: false,
      reason: 'invoice_already_sent',
      message: `This job already has a Stripe invoice: ${preview.existingInvoiceId}. Void it first if you need to recreate.`,
    };
  }

  // 2. Compose Stripe Invoice items + invoice
  const { data: clientProfile } = await supabase
    .from('client_profiles')
    .select('stripe_customer_id, stripe_default_payment_method_id')
    .eq('id', preview.clientId)
    .single();

  if (!clientProfile?.stripe_customer_id) {
    return { ok: false, reason: 'client_no_stripe_customer', message: 'Client Stripe Customer disappeared between preview and send' };
  }

  // Add invoice items first, then create the invoice (Stripe pulls pending items)
  try {
    // Per-talent line items
    for (const b of preview.bookings) {
      await stripe.invoiceItems.create({
        customer: clientProfile.stripe_customer_id,
        currency: 'usd',
        amount: b.confirmedRateCents,
        description: `Talent fee — ${b.talentName} — ${preview.jobTitle}${preview.jobCode ? ` (${preview.jobCode})` : ''}`,
        metadata: {
          rs_booking_id: b.bookingId,
          rs_talent_id: b.talentId,
          rs_job_id: preview.jobId,
          rs_line_kind: 'talent_fee',
        },
      });
    }
    // RS service fee
    await stripe.invoiceItems.create({
      customer: clientProfile.stripe_customer_id,
      currency: 'usd',
      amount: preview.totals.rsFeeCents,
      description: `Rowly Studios service fee (15%) — ${preview.jobTitle}`,
      metadata: { rs_job_id: preview.jobId, rs_line_kind: 'rs_fee' },
    });
    // Processing fee
    await stripe.invoiceItems.create({
      customer: clientProfile.stripe_customer_id,
      currency: 'usd',
      amount: preview.totals.processingFeeCents,
      description:
        preview.paymentMethodType === 'us_bank_account'
          ? 'Bank transfer (ACH) processing fee'
          : 'Credit card processing fee (2.9% + $0.30)',
      metadata: { rs_job_id: preview.jobId, rs_line_kind: 'processing_fee', payment_method_type: preview.paymentMethodType },
    });

    // Create the invoice itself
    const stripeInvoice = await stripe.invoices.create({
      customer: clientProfile.stripe_customer_id,
      collection_method: 'send_invoice',
      days_until_due: 14,
      auto_advance: true,
      default_payment_method: clientProfile.stripe_default_payment_method_id,
      payment_settings: {
        payment_method_types:
          preview.paymentMethodType === 'us_bank_account'
            ? ['us_bank_account', 'card']
            : ['card', 'us_bank_account'],
      },
      description: `Invoice for ${preview.jobTitle}${preview.jobCode ? ` (${preview.jobCode})` : ''}`,
      metadata: {
        rs_job_id: preview.jobId,
        rs_job_code: preview.jobCode ?? '',
        rs_client_id: preview.clientId,
        rs_payment_method_type: preview.paymentMethodType,
        rs_source: 'rs_app_phase_c1',
      },
    });

    // Finalize & send via Stripe (sends the email)
    const finalized = await stripe.invoices.finalizeInvoice(stripeInvoice.id as string);
    await stripe.invoices.sendInvoice(finalized.id as string);

    // 3. Persist our internal invoices row + talent_payments rows
    const dueDate = finalized.due_date ? new Date(finalized.due_date * 1000).toISOString().slice(0, 10) : null;

    const { data: ourInvoice, error: insErr } = await supabase
      .from('invoices')
      .insert({
        job_id: preview.jobId,
        client_id: preview.clientId,
        invoice_number: finalized.number ?? null,
        status: 'sent',
        subtotal_cents: preview.totals.talentSubtotalCents + preview.totals.rsFeeCents,
        rs_fee_percent: 15.0,
        rs_fee_cents: preview.totals.rsFeeCents,
        talent_total_cents: preview.totals.talentSubtotalCents,
        client_total_cents: preview.totals.clientTotalCents,
        total_cents: preview.totals.clientTotalCents,
        due_date: dueDate,
        sent_at: new Date().toISOString(),
        created_by: params.createdByUserId,
        stripe_invoice_id: finalized.id,
        stripe_payment_intent_id:
          typeof finalized.payment_intent === 'string'
            ? finalized.payment_intent
            : finalized.payment_intent?.id ?? null,
        stripe_payment_link_url: finalized.hosted_invoice_url ?? null,
        stripe_payment_method_type: preview.paymentMethodType,
        stripe_processing_fee_cents: preview.totals.processingFeeCents,
        stripe_processing_fee_passed_to_client: true,
        stripe_charged_amount_cents: preview.totals.clientTotalCents,
        stripe_application_fee_cents: 0, // Pattern Y: no app fee, RS keeps via not-transferring
      })
      .select('id')
      .single();

    if (insErr || !ourInvoice) {
      // Best-effort: void the Stripe invoice so we don't have orphans
      try { await stripe.invoices.voidInvoice(finalized.id as string); } catch { /* swallow */ }
      return {
        ok: false,
        reason: 'stripe_error',
        message: `Created Stripe invoice but failed to persist locally: ${insErr?.message ?? 'unknown'}`,
      };
    }

    // talent_payments rows — one per booking, status='scheduled'
    const talentPaymentRows = preview.bookings.map((b) => ({
      invoice_id: ourInvoice.id,
      job_id: preview.jobId,
      booking_id: b.bookingId,
      talent_id: b.talentId,
      tax_year: new Date().getFullYear(),
      amount_cents: b.confirmedRateCents,
      payment_date: new Date().toISOString().slice(0, 10), // updated when transferred
      payment_method: 'stripe_transfer',
      reference: finalized.id,
      stripe_invoice_id: finalized.id as string,
      stripe_status: 'scheduled',
      rs_fee_cents: b.rsFeeCents,
      gross_charge_cents: b.confirmedRateCents + b.rsFeeCents +
        Math.round(preview.totals.processingFeeCents * (b.confirmedRateCents / preview.totals.talentSubtotalCents)),
      created_by: params.createdByUserId,
    }));

    const { error: tpErr } = await supabase
      .from('talent_payments')
      .insert(talentPaymentRows);

    if (tpErr) {
      // Don't roll back — the invoice exists and the Stripe side is fine. Log it.
      console.error('Failed to insert talent_payments rows:', tpErr.message);
    }

    return {
      ok: true,
      invoiceId: ourInvoice.id,
      stripeInvoiceId: finalized.id as string,
      hostedUrl: finalized.hosted_invoice_url ?? null,
      status: finalized.status ?? 'sent',
    };
  } catch (err) {
    const e = err as Stripe.errors.StripeError | Error;
    const msg =
      'type' in e && (e as Stripe.errors.StripeError).type
        ? `${(e as Stripe.errors.StripeError).type}: ${e.message}`
        : e.message;
    return {
      ok: false,
      reason: 'stripe_error',
      message: `Stripe error during invoice creation: ${msg}`,
    };
  }
}

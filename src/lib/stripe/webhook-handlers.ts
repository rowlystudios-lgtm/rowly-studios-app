import type Stripe from 'stripe';
import type { SupabaseClient } from '@supabase/supabase-js';
import { syncTalentStripeAccount } from './sync';

/**
 * Webhook event handlers.
 *
 * Each handler is idempotent — safe to call multiple times for the same event.
 * The route handler (route.ts) wraps these with stripe_events idempotency
 * tracking so duplicate events (Stripe retries) don't double-process.
 */

export async function handleInvoicePaymentSucceeded(
  supabase: SupabaseClient,
  invoice: Stripe.Invoice,
): Promise<{ handled: boolean; note: string }> {
  const stripeInvoiceId = invoice.id;
  if (!stripeInvoiceId) return { handled: false, note: 'No invoice id' };

  // Idempotent: only update if status not already 'paid'
  const { data: ourInvoice } = await supabase
    .from('invoices')
    .select('id, status, paid_at')
    .eq('stripe_invoice_id', stripeInvoiceId)
    .maybeSingle();

  if (!ourInvoice) {
    return { handled: false, note: `No matching invoices row for stripe_invoice_id=${stripeInvoiceId}` };
  }

  if (ourInvoice.status === 'paid' && ourInvoice.paid_at) {
    return { handled: true, note: 'Already marked paid (idempotent skip)' };
  }

  // Compute scheduled_release_at = now + admin_settings.stripe_talent_transfer_hold_days
  const { data: holdSetting } = await supabase
    .from('admin_settings')
    .select('value')
    .eq('key', 'stripe_talent_transfer_hold_days')
    .single();

  const holdDays = parseInt(holdSetting?.value ?? '5', 10);
  const releaseAt = new Date(Date.now() + holdDays * 24 * 60 * 60 * 1000).toISOString();

  // Mark our invoice paid
  await supabase
    .from('invoices')
    .update({
      status: 'paid',
      paid_at: new Date().toISOString(),
      stripe_charged_amount_cents: invoice.amount_paid ?? 0,
    })
    .eq('id', ourInvoice.id);

  // Move associated talent_payments from 'scheduled' → 'pending_release'
  // and set their scheduled_release_at
  await supabase
    .from('talent_payments')
    .update({
      stripe_status: 'pending_release',
      scheduled_release_at: releaseAt,
    })
    .eq('invoice_id', ourInvoice.id)
    .eq('stripe_status', 'scheduled');

  return { handled: true, note: `Marked paid; talent transfers scheduled for ${releaseAt}` };
}


export async function handleInvoicePaymentFailed(
  supabase: SupabaseClient,
  invoice: Stripe.Invoice,
): Promise<{ handled: boolean; note: string }> {
  const stripeInvoiceId = invoice.id;
  if (!stripeInvoiceId) return { handled: false, note: 'No invoice id' };

  const { data: ourInvoice } = await supabase
    .from('invoices')
    .select('id, status, job_id, client_id')
    .eq('stripe_invoice_id', stripeInvoiceId)
    .maybeSingle();

  if (!ourInvoice) {
    return { handled: false, note: `No matching invoices row for stripe_invoice_id=${stripeInvoiceId}` };
  }

  // Don't overwrite a paid status with failed (race protection)
  if (ourInvoice.status === 'paid') {
    return { handled: true, note: 'Already paid; skipping failed update' };
  }

  await supabase
    .from('invoices')
    .update({
      status: 'failed',
      // Keep stripe_invoice_id so admin can retry / void
    })
    .eq('id', ourInvoice.id);

  // Notify admin via the existing notifications table
  // (Find admin user_ids — assumes there's a way to identify admins.)
  const { data: admins } = await supabase
    .from('profiles')
    .select('id')
    .eq('role', 'admin');

  if (admins && admins.length > 0) {
    const rows = admins.map((a) => ({
      user_id: a.id,
      type: 'stripe_invoice_failed',
      title: 'Invoice payment failed',
      body: `A Stripe invoice (${stripeInvoiceId}) failed to collect. Open the admin finance view to retry or void.`,
      action_url: `/app/jobs/${ourInvoice.job_id}`,
      priority: 'high',
      metadata: { invoice_id: ourInvoice.id, stripe_invoice_id: stripeInvoiceId },
    }));
    await supabase.from('notifications').insert(rows);
  }

  return { handled: true, note: 'Marked failed; admins notified' };
}


export async function handleInvoiceVoided(
  supabase: SupabaseClient,
  invoice: Stripe.Invoice,
): Promise<{ handled: boolean; note: string }> {
  const stripeInvoiceId = invoice.id;
  if (!stripeInvoiceId) return { handled: false, note: 'No invoice id' };

  const { data: ourInvoice } = await supabase
    .from('invoices')
    .select('id')
    .eq('stripe_invoice_id', stripeInvoiceId)
    .maybeSingle();

  if (!ourInvoice) return { handled: false, note: 'No matching local invoice' };

  await supabase
    .from('invoices')
    .update({
      status: 'void',
      voided_at: new Date().toISOString(),
    })
    .eq('id', ourInvoice.id);

  // Cancel any scheduled talent_payments for this invoice
  await supabase
    .from('talent_payments')
    .update({ stripe_status: 'cancelled' })
    .eq('invoice_id', ourInvoice.id)
    .in('stripe_status', ['scheduled', 'pending_release']);

  return { handled: true, note: 'Voided; talent payments cancelled' };
}


export async function handleAccountUpdated(
  supabase: SupabaseClient,
  account: Stripe.Account,
): Promise<{ handled: boolean; note: string }> {
  // Find our talent_profile by stripe_account_id
  const { data: tp } = await supabase
    .from('talent_profiles')
    .select('id, stripe_account_status')
    .eq('stripe_account_id', account.id)
    .maybeSingle();

  if (!tp) return { handled: false, note: `No talent_profile for stripe_account_id=${account.id}` };

  // Use the existing sync helper to keep logic in one place
  await syncTalentStripeAccount(supabase, {
    talentId: tp.id,
    stripeAccountId: account.id,
  });

  return { handled: true, note: 'Talent Stripe state synced' };
}


export async function handleTransferCreated(
  supabase: SupabaseClient,
  transfer: Stripe.Transfer,
): Promise<{ handled: boolean; note: string }> {
  // Match by metadata.rs_talent_payment_id (set when we create the transfer in C-2)
  const ourPaymentId = transfer.metadata?.rs_talent_payment_id;
  if (!ourPaymentId) return { handled: false, note: 'No rs_talent_payment_id in transfer metadata' };

  await supabase
    .from('talent_payments')
    .update({
      stripe_transfer_id: transfer.id,
      stripe_status: 'paid',
      transferred_at: new Date().toISOString(),
      payment_date: new Date().toISOString().slice(0, 10),
    })
    .eq('id', ourPaymentId)
    .neq('stripe_status', 'paid'); // idempotent

  return { handled: true, note: `Talent payment ${ourPaymentId} marked paid` };
}

export async function handleCheckoutSessionCompleted(
  supabase: SupabaseClient,
  session: Stripe.Checkout.Session,
): Promise<{ handled: boolean; note: string }> {
  // Only handle payment-mode sessions tied to one of our invoices
  if (session.mode !== 'payment') {
    return { handled: false, note: `Skipped: mode=${session.mode}` };
  }

  const invoiceId = session.metadata?.rs_invoice_id;
  if (!invoiceId) {
    return { handled: false, note: 'No rs_invoice_id in metadata — not an RS invoice payment' };
  }

  // Idempotency
  const { data: ourInvoice } = await supabase
    .from('invoices')
    .select('id, status, paid_at')
    .eq('id', invoiceId)
    .maybeSingle();

  if (!ourInvoice) {
    return { handled: false, note: `No matching invoices row for rs_invoice_id=${invoiceId}` };
  }
  if (ourInvoice.status === 'paid' && ourInvoice.paid_at) {
    return { handled: true, note: 'Already marked paid (idempotent skip)' };
  }

  // Compute scheduled_release_at
  const { data: holdSetting } = await supabase
    .from('admin_settings')
    .select('value')
    .eq('key', 'stripe_talent_transfer_hold_days')
    .single();
  const holdDays = parseInt(holdSetting?.value ?? '5', 10);
  const releaseAt = new Date(Date.now() + holdDays * 24 * 60 * 60 * 1000).toISOString();

  // Mark invoice paid
  await supabase
    .from('invoices')
    .update({
      status: 'paid',
      paid_at: new Date().toISOString(),
      stripe_charged_amount_cents: session.amount_total ?? 0,
      stripe_payment_intent_id:
        typeof session.payment_intent === 'string'
          ? session.payment_intent
          : session.payment_intent?.id ?? null,
    })
    .eq('id', invoiceId);

  // Schedule talent_payments
  await supabase
    .from('talent_payments')
    .update({
      stripe_status: 'pending_release',
      scheduled_release_at: releaseAt,
    })
    .eq('invoice_id', invoiceId)
    .eq('stripe_status', 'scheduled');

  return { handled: true, note: `Marked paid; talent transfers scheduled for ${releaseAt}` };
}

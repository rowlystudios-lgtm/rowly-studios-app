import { NextRequest, NextResponse } from 'next/server';
import type Stripe from 'stripe';
import { stripe, STRIPE_WEBHOOK_SECRET } from '@/lib/stripe/client';
import { getServiceSupabase } from '@/lib/stripe/auth';
import {
  handleInvoicePaymentSucceeded,
  handleInvoicePaymentFailed,
  handleInvoiceVoided,
  handleAccountUpdated,
  handleTransferCreated,
} from '@/lib/stripe/webhook-handlers';

/**
 * POST /api/stripe/webhook
 *
 * Stripe webhook receiver. Verifies signature, idempotency-checks via
 * stripe_events, dispatches to per-event handlers in webhook-handlers.ts.
 *
 * MUST read raw body — `req.text()` not `req.json()` — or the signature
 * verification will fail. Stripe signs the exact bytes it sent.
 *
 * Subscribed events (configure in Stripe Dashboard → Developers → Webhooks):
 *   - invoice.payment_succeeded
 *   - invoice.payment_failed
 *   - invoice.voided
 *   - account.updated
 *   - transfer.created   (Phase C-2 will use this)
 *
 * Always returns 200 to Stripe (even on handler errors) to prevent
 * unnecessary retries. Errors are logged in stripe_events.processing_error
 * for admin to inspect.
 */
export async function POST(req: NextRequest) {
  if (!STRIPE_WEBHOOK_SECRET) {
    return NextResponse.json(
      { error: 'STRIPE_WEBHOOK_SECRET not configured' },
      { status: 500 },
    );
  }

  // 1. Read raw body + signature header
  const rawBody = await req.text();
  const signature = req.headers.get('stripe-signature') ?? '';

  // 2. Verify signature
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    console.error('Stripe webhook signature verification failed:', msg);
    return NextResponse.json({ error: `Webhook signature failure: ${msg}` }, { status: 400 });
  }

  const supabase = getServiceSupabase();

  // 3. Idempotency check + insert into stripe_events
  const { data: existing } = await supabase
    .from('stripe_events')
    .select('id, processed_at')
    .eq('stripe_event_id', event.id)
    .maybeSingle();

  if (existing?.processed_at) {
    return NextResponse.json({ received: true, idempotent: true, eventId: event.id });
  }

  let eventRowId = existing?.id ?? null;
  if (!eventRowId) {
    const { data: inserted } = await supabase
      .from('stripe_events')
      .insert({
        stripe_event_id: event.id,
        event_type: event.type,
        api_version: event.api_version,
        livemode: event.livemode,
        payload: event as unknown as Record<string, unknown>,
      })
      .select('id')
      .single();
    eventRowId = inserted?.id ?? null;
  }

  // 4. Dispatch
  let result: { handled: boolean; note: string } = { handled: false, note: 'No handler' };
  let processingError: string | null = null;

  try {
    switch (event.type) {
      case 'invoice.payment_succeeded':
        result = await handleInvoicePaymentSucceeded(
          supabase,
          event.data.object as Stripe.Invoice,
        );
        break;
      case 'invoice.payment_failed':
        result = await handleInvoicePaymentFailed(
          supabase,
          event.data.object as Stripe.Invoice,
        );
        break;
      case 'invoice.voided':
      case 'invoice.marked_uncollectible':
        result = await handleInvoiceVoided(
          supabase,
          event.data.object as Stripe.Invoice,
        );
        break;
      case 'account.updated':
        result = await handleAccountUpdated(
          supabase,
          event.data.object as Stripe.Account,
        );
        break;
      case 'transfer.created':
        result = await handleTransferCreated(
          supabase,
          event.data.object as Stripe.Transfer,
        );
        break;
      default:
        result = { handled: false, note: `Event type ${event.type} not handled` };
    }
  } catch (err) {
    processingError = err instanceof Error ? err.message : 'Unknown error';
    console.error(`Webhook handler error for ${event.type}:`, err);
  }

  // 5. Update the stripe_events row
  if (eventRowId) {
    await supabase
      .from('stripe_events')
      .update({
        processed_at: processingError ? null : new Date().toISOString(),
        processing_error: processingError,
        retry_count: existing ? (await getRetryCount(supabase, eventRowId)) + 1 : 0,
      })
      .eq('id', eventRowId);
  }

  // Always 200 — Stripe interprets non-2xx as failed and retries.
  // We track our own state in stripe_events so we can re-run handlers manually.
  return NextResponse.json({
    received: true,
    handled: result.handled,
    note: result.note,
    error: processingError,
    eventId: event.id,
  });
}

async function getRetryCount(supabase: ReturnType<typeof getServiceSupabase>, rowId: string): Promise<number> {
  const { data } = await supabase
    .from('stripe_events')
    .select('retry_count')
    .eq('id', rowId)
    .single();
  return data?.retry_count ?? 0;
}

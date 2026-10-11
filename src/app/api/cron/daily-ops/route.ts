import { NextRequest, NextResponse } from 'next/server';
import { getServiceSupabase } from '@/lib/stripe/auth';
import { stripe } from '@/lib/stripe/client';
import { sendTransactionalEmail } from '@/lib/email';

/**
 * GET /api/cron/daily-ops — Phase A money-path keeper + smoke test.
 *
 * Runs daily via Vercel Cron. One route so the Hobby cron budget stays low.
 *  1. Releases expired pending-Stripe booking grace windows (RPC —
 *     previously built but never scheduled).
 *  2. Pays out talent transfers whose 5-day hold has expired
 *     (talent_payments pending_release → Stripe transfer → paid). This is
 *     the step that actually moves money to talent; it did not exist
 *     before this round.
 *  3. Smoke-tests the money path: DB reachable, Stripe key valid (and
 *     which mode), webhook + email env present, no payouts stuck.
 *  4. Emails the admin on ANY problem, plus an all-green summary every
 *     Monday — a silent failure is pre-mortem #7.
 *
 * Auth: Vercel Cron Bearer token or x-cron-secret, matching CRON_SECRET.
 */

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const ADMIN_FALLBACK_EMAIL = 'rowlystudios@gmail.com';

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

function escapeHtmlLite(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET ?? '';
  const header =
    req.headers.get('x-cron-secret') ||
    req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ||
    '';
  if (!secret || header !== secret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getServiceSupabase();
  const problems: string[] = [];
  const report: Record<string, unknown> = {};

  // ── 1. Release expired pending-Stripe booking grace windows ──────────
  try {
    const { data, error } = await supabase.rpc(
      'release_expired_stripe_pending_bookings',
    );
    if (error) problems.push(`grace-release: ${error.message}`);
    else report.graceWindowsReleased = Array.isArray(data) ? data.length : 0;
  } catch (e) {
    problems.push(`grace-release: ${errMsg(e)}`);
  }

  // ── 2. Pay out talent transfers whose hold has expired ───────────────
  let transferred = 0;
  try {
    const { data: due, error } = await supabase
      .from('talent_payments')
      .select(
        'id, amount_cents, stripe_destination_account_id, stripe_charge_id',
      )
      .eq('stripe_status', 'pending_release')
      .lte('scheduled_release_at', new Date().toISOString())
      .limit(25);

    if (error) {
      problems.push(`transfer-query: ${error.message}`);
    }

    for (const p of due ?? []) {
      if (!p.stripe_destination_account_id || !p.amount_cents || p.amount_cents <= 0) {
        problems.push(
          `transfer ${p.id}: missing destination account or amount — needs a manual look`,
        );
        continue;
      }
      try {
        const transfer = await stripe.transfers.create(
          {
            amount: p.amount_cents,
            currency: 'usd',
            destination: p.stripe_destination_account_id,
            ...(p.stripe_charge_id
              ? { source_transaction: p.stripe_charge_id }
              : {}),
            metadata: { rs_talent_payment_id: p.id },
          },
          { idempotencyKey: `rs-talent-payment-${p.id}` },
        );
        // transfer.created webhook marks the row paid; mirror it here so a
        // missed webhook can't leave the payment stuck in pending_release.
        await supabase
          .from('talent_payments')
          .update({
            stripe_transfer_id: transfer.id,
            stripe_status: 'paid',
            transferred_at: new Date().toISOString(),
            payment_date: new Date().toISOString().slice(0, 10),
          })
          .eq('id', p.id)
          .neq('stripe_status', 'paid');
        transferred += 1;
      } catch (e) {
        problems.push(`transfer ${p.id}: ${errMsg(e)}`);
      }
    }
    report.talentTransfersReleased = transferred;
  } catch (e) {
    problems.push(`transfer-release: ${errMsg(e)}`);
  }

  // ── 3. Money-path smoke checks ───────────────────────────────────────
  try {
    const { error } = await supabase
      .from('profiles')
      .select('id', { count: 'exact', head: true });
    if (error) problems.push(`db: ${error.message}`);
  } catch (e) {
    problems.push(`db: ${errMsg(e)}`);
  }

  try {
    await stripe.balance.retrieve();
    report.stripeMode = (process.env.STRIPE_SECRET_KEY ?? '').startsWith(
      'sk_live_',
    )
      ? 'live'
      : 'test';
  } catch (e) {
    problems.push(`stripe: ${errMsg(e)}`);
  }

  if (!process.env.STRIPE_WEBHOOK_SECRET) {
    problems.push('stripe: STRIPE_WEBHOOK_SECRET is not set');
  }
  if (!process.env.AWS_SES_REGION && !process.env.RESEND_API_KEY) {
    problems.push('email: no provider configured (AWS_SES_REGION or RESEND_API_KEY)');
  }
  report.emailProvider = process.env.AWS_SES_REGION ? 'ses' : 'resend';

  try {
    const twoDaysAgo = new Date(Date.now() - 2 * 86400_000).toISOString();
    const { count } = await supabase
      .from('talent_payments')
      .select('id', { count: 'exact', head: true })
      .eq('stripe_status', 'pending_release')
      .lte('scheduled_release_at', twoDaysAgo);
    if ((count ?? 0) > 0) {
      problems.push(
        `payouts: ${count} talent payment(s) stuck more than 2 days past their release date`,
      );
    }
  } catch {
    // non-fatal — the direct release above already surfaced hard errors
  }

  // ── 4. Alert on problems; all-green summary on Mondays ───────────────
  const isMondayUtc = new Date().getUTCDay() === 1;
  if (problems.length > 0 || isMondayUtc) {
    let adminEmail = ADMIN_FALLBACK_EMAIL;
    try {
      const { data } = await supabase
        .from('profiles')
        .select('email')
        .eq('role', 'admin')
        .limit(1)
        .maybeSingle();
      if (data?.email) adminEmail = data.email;
    } catch {
      // fall back silently
    }

    const subject =
      problems.length > 0
        ? `RS App daily ops — ${problems.length} issue${problems.length === 1 ? '' : 's'} need attention`
        : 'RS App weekly ops — all green';
    const html =
      `<h2>RS App daily ops</h2><p>${new Date().toISOString()}</p>` +
      (problems.length > 0
        ? `<h3>Problems</h3><ul>${problems
            .map((p) => `<li>${escapeHtmlLite(p)}</li>`)
            .join('')}</ul>`
        : '<p>All money-path checks passed.</p>') +
      `<h3>Report</h3><pre>${escapeHtmlLite(
        JSON.stringify(report, null, 2),
      )}</pre>`;

    try {
      await sendTransactionalEmail({ to: adminEmail, subject, html });
    } catch (e) {
      console.error('[daily-ops] alert email failed:', errMsg(e));
    }
  }

  return NextResponse.json(
    {
      ok: problems.length === 0,
      problems,
      report,
      timestamp: new Date().toISOString(),
    },
    { status: problems.length > 0 ? 500 : 200 },
  );
}

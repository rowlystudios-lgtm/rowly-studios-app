import { NextResponse, type NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase-service'
import { sendTransactionalEmail } from '@/lib/email'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
// Let the cron run for a while if there's a backlog of invoices.
export const maxDuration = 60

/**
 * Daily late-invoice cron. Wired to 0 17 * * * UTC (9am PT) in vercel.json.
 *
 * Protected by x-cron-secret header (or Authorization: Bearer <secret>
 * for Vercel's built-in cron runner). Rejects 401 otherwise.
 *
 * Staging, measured from invoices.invoice_period_start:
 *   Day 15              — 15-day reminder (one-shot: reminder_15_sent_at IS NULL)
 *   Day 27              — 3-day warning   (one-shot: reminder_3_sent_at IS NULL)
 *   Day 33–37           — apply 2.5% late fee + email client
 *                         (one-shot: late_fee_rate = 0)
 *   Day 38+             — apply 5% late fee + restrict client + email
 *                         (one-shot: restriction_applied_at IS NULL)
 *
 * Each stage touches idempotency guards so this is safe to re-run.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  const headerSecret =
    req.headers.get('x-cron-secret') ||
    req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ||
    ''
  if (!secret || headerSecret !== secret) {
    return new NextResponse('Unauthorized', { status: 401 })
  }

  const svc = createServiceClient()
  const now = new Date()
  const todayMs = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())

  const { data: invoices, error } = await svc
    .from('invoices')
    .select(
      `id, invoice_number, status, client_id, job_id,
       total_cents, client_total_cents, rs_fee_cents,
       invoice_period_start, due_date,
       late_fee_rate, late_fee_cents, late_fee_applied_at,
       restriction_applied_at, reminder_15_sent_at, reminder_3_sent_at,
       jobs (title),
       profiles!invoices_client_id_fkey (full_name, email,
         client_profiles (company_name, billing_email))`
    )
    .in('status', ['sent', 'overdue'])
    .not('invoice_period_start', 'is', null)

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }

  type CPJoin = {
    company_name: string | null
    billing_email: string | null
  }
  type Row = {
    id: string
    invoice_number: string | null
    status: string
    client_id: string | null
    job_id: string | null
    total_cents: number | null
    client_total_cents: number | null
    rs_fee_cents: number | null
    invoice_period_start: string | null
    due_date: string | null
    late_fee_rate: number | null
    late_fee_cents: number | null
    late_fee_applied_at: string | null
    restriction_applied_at: string | null
    reminder_15_sent_at: string | null
    reminder_3_sent_at: string | null
    jobs: { title: string | null } | { title: string | null }[] | null
    profiles:
      | {
          full_name: string | null
          email: string | null
          client_profiles: CPJoin | CPJoin[] | null
        }
      | {
          full_name: string | null
          email: string | null
          client_profiles: CPJoin | CPJoin[] | null
        }[]
      | null
  }

  function unwrap<T>(v: T | T[] | null | undefined): T | null {
    if (v == null) return null
    return Array.isArray(v) ? v[0] ?? null : v
  }

  function daysSince(isoDate: string): number {
    const parts = isoDate.split('-').map(Number)
    if (parts.length !== 3 || parts.some(Number.isNaN)) return 0
    const baseMs = Date.UTC(parts[0], parts[1] - 1, parts[2])
    return Math.floor((todayMs - baseMs) / 86_400_000)
  }

  function fmtLong(iso: string | null): string {
    if (!iso) return ''
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return ''
    return d.toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    })
  }

  function fmtMoney(c: number | null | undefined): string {
    if (!c && c !== 0) return '$0'
    return `$${(c / 100).toLocaleString('en-US', { maximumFractionDigits: 0 })}`
  }

  const counts = {
    reminder15: 0,
    reminder3: 0,
    feeApplied: 0,
    restricted: 0,
    skipped: 0,
    errors: 0,
  }

  const rows = (invoices ?? []) as unknown as Row[]
  const nowIso = new Date().toISOString()

  for (const inv of rows) {
    try {
      if (!inv.invoice_period_start || !inv.client_id) {
        counts.skipped += 1
        continue
      }

      const day = daysSince(inv.invoice_period_start)
      const profile = unwrap(inv.profiles)
      const cp = profile ? unwrap(profile.client_profiles) : null
      const billingEmail = cp?.billing_email || profile?.email || null
      const clientName =
        cp?.company_name || profile?.full_name || 'there'
      const jobTitle = unwrap(inv.jobs)?.title ?? 'your recent shoot'
      const invoiceNumber = inv.invoice_number ?? 'DRAFT'
      const clientTotal =
        inv.client_total_cents ??
        (inv.total_cents ?? 0) + Math.round((inv.total_cents ?? 0) * 0.15)

      // ─── Pull talent names from this invoice's line items. Used to
      // personalise reminder copy ("Please settle for Jane Doe's work").
      let talentNames = ''
      if (day === 15 || day === 27) {
        const { data: items } = await svc
          .from('invoice_line_items')
          .select(
            `talent_id,
             profiles!invoice_line_items_talent_id_fkey (first_name, last_name, full_name)`
          )
          .eq('invoice_id', inv.id)
        type LI = {
          talent_id: string | null
          profiles:
            | { first_name: string | null; last_name: string | null; full_name: string | null }
            | { first_name: string | null; last_name: string | null; full_name: string | null }[]
            | null
        }
        const names = new Set<string>()
        for (const li of (items ?? []) as unknown as LI[]) {
          const p = Array.isArray(li.profiles) ? li.profiles[0] ?? null : li.profiles
          const n =
            [p?.first_name, p?.last_name].filter(Boolean).join(' ') ||
            p?.full_name ||
            null
          if (n) names.add(n)
        }
        talentNames = Array.from(names).slice(0, 4).join(', ')
      }

      // ─── Stage 1: Day 15 reminder ───
      if (day === 15 && !inv.reminder_15_sent_at) {
        if (billingEmail) {
          await sendTransactionalEmail({
            to: billingEmail,
            subject: `Reminder: Invoice ${invoiceNumber} due in 15 days`,
            html: `
              <p>Hi ${clientName},</p>
              <p>Your invoice <strong>${invoiceNumber}</strong> for <em>${jobTitle}</em>${
                talentNames ? ` (${talentNames})` : ''
              } is due on <strong>${fmtLong(inv.due_date)}</strong>.</p>
              <p>Total due: <strong>${fmtMoney(clientTotal)}</strong>.</p>
              <p>Thank you,<br/>Rowly Studios</p>
            `,
          })
        }
        await svc
          .from('invoices')
          .update({ reminder_15_sent_at: nowIso })
          .eq('id', inv.id)
        counts.reminder15 += 1
        continue
      }

      // ─── Stage 2: Day 27 (3-day warning) ───
      if (day === 27 && !inv.reminder_3_sent_at) {
        if (billingEmail) {
          await sendTransactionalEmail({
            to: billingEmail,
            subject: `Heads up: Invoice ${invoiceNumber} due in 3 days`,
            html: `
              <p>Hi ${clientName},</p>
              <p>This is a quick heads-up that invoice <strong>${invoiceNumber}</strong> for <em>${jobTitle}</em>${
                talentNames ? ` (${talentNames})` : ''
              } is due in 3 days (<strong>${fmtLong(inv.due_date)}</strong>).</p>
              <p>Total due: <strong>${fmtMoney(clientTotal)}</strong>. Late fees apply after the due date as set out in the Rowly Studios Client Platform Agreement.</p>
              <p>Thank you,<br/>Rowly Studios</p>
            `,
          })
        }
        await svc
          .from('invoices')
          .update({ reminder_3_sent_at: nowIso })
          .eq('id', inv.id)
        counts.reminder3 += 1
        continue
      }

      // ─── Stage 3: Day 33–37 → 2.5% late fee ───
      if (
        day >= 33 &&
        day <= 37 &&
        Number(inv.late_fee_rate ?? 0) === 0
      ) {
        const base =
          inv.client_total_cents ??
          (inv.total_cents ?? 0) + Math.round((inv.total_cents ?? 0) * 0.15)
        const feeCents = Math.round(base * 0.025)
        await svc
          .from('invoices')
          .update({
            late_fee_rate: 2.5,
            late_fee_cents: feeCents,
            late_fee_applied_at: nowIso,
            status: 'overdue',
          })
          .eq('id', inv.id)
        if (billingEmail) {
          await sendTransactionalEmail({
            to: billingEmail,
            subject: `Invoice ${invoiceNumber} is overdue — 2.5% late fee applied`,
            html: `
              <p>Hi ${clientName},</p>
              <p>Invoice <strong>${invoiceNumber}</strong> for <em>${jobTitle}</em> was due on <strong>${fmtLong(inv.due_date)}</strong> and is now past due.</p>
              <p>A 2.5% late fee of <strong>${fmtMoney(feeCents)}</strong> has been applied as set out in the Rowly Studios Client Platform Agreement. New total due: <strong>${fmtMoney(base + feeCents)}</strong>.</p>
              <p>If payment is not received within the next 5 days, an additional fee applies and job-request access will be temporarily restricted.</p>
              <p>Thank you,<br/>Rowly Studios</p>
            `,
          })
        }
        counts.feeApplied += 1
        continue
      }

      // ─── Stage 4: Day 38+ → 5% fee + restrict client ───
      if (day >= 38 && !inv.restriction_applied_at) {
        const base =
          inv.client_total_cents ??
          (inv.total_cents ?? 0) + Math.round((inv.total_cents ?? 0) * 0.15)
        const feeCents = Math.round(base * 0.05)
        await svc
          .from('invoices')
          .update({
            late_fee_rate: 5,
            late_fee_cents: feeCents,
            late_fee_applied_at: nowIso,
            restriction_applied_at: nowIso,
            status: 'overdue',
          })
          .eq('id', inv.id)

        // Flip the client into restricted state.
        await svc
          .from('client_profiles')
          .update({
            account_restricted: true,
            restricted_at: nowIso,
            restriction_reason: `Overdue invoice ${invoiceNumber}`,
          })
          .eq('id', inv.client_id)

        if (billingEmail) {
          await sendTransactionalEmail({
            to: billingEmail,
            subject: `Account restricted — Invoice ${invoiceNumber} significantly overdue`,
            html: `
              <p>Hi ${clientName},</p>
              <p>Invoice <strong>${invoiceNumber}</strong> for <em>${jobTitle}</em> was due on <strong>${fmtLong(inv.due_date)}</strong> and remains unpaid.</p>
              <p>A 5% late fee of <strong>${fmtMoney(feeCents)}</strong> has been applied. New total due: <strong>${fmtMoney(base + feeCents)}</strong>.</p>
              <p>Your account has been temporarily restricted from posting new job requests. Access will be restored automatically once payment is received.</p>
              <p>Please settle at your earliest convenience.</p>
              <p>Thank you,<br/>Rowly Studios</p>
            `,
          })
        }

        // In-app notification for the client.
        try {
          await svc.from('notifications').insert({
            user_id: inv.client_id,
            type: 'account_restricted',
            title: 'Account restricted — overdue invoice',
            body: `Invoice ${invoiceNumber} is significantly overdue. Job-request access is paused until it's settled.`,
            priority: 'urgent',
            clearable: false,
            link: `/app`,
            action_url: `/app`,
          })
        } catch {
          // non-fatal
        }

        counts.restricted += 1
        continue
      }

      counts.skipped += 1
    } catch {
      counts.errors += 1
    }
  }

  return NextResponse.json({ ok: true, processed: rows.length, ...counts })
}

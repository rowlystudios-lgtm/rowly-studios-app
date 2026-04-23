import Link from 'next/link'
import { Suspense } from 'react'
import { requireAdmin, centsToUsd, formatDate } from '@/lib/admin-auth'
import { StatusBadge } from '@/components/StatusBadge'
import { JobCodePill } from '@/components/JobCodePill'
import { generateDraftInvoiceFromJob } from './actions'
import { FinancePeriodSelector } from './FinancePeriodSelector'

export const dynamic = 'force-dynamic'

function todayIsoLA(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles' }).format(new Date())
}
function currentMonthIso(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}
function monthBounds(ym: string): { start: string; end: string } {
  const [y, m] = ym.split('-').map(Number)
  const start = `${y}-${String(m).padStart(2,'0')}-01`
  const lastDay = new Date(y, m, 0).getDate()
  const end = `${y}-${String(m).padStart(2,'0')}-${lastDay}`
  return { start, end }
}
function unwrap<T>(v: T | T[] | null | undefined): T | null {
  if (v == null) return null
  return Array.isArray(v) ? (v[0] ?? null) : v
}

type ClientJoin = {
  full_name: string | null
  client_profiles: { company_name: string | null; billing_email: string | null } | { company_name: string | null; billing_email: string | null }[] | null
}
type InvoiceRow = {
  id: string; invoice_number: string | null; status: string
  total_cents: number | null; rs_fee_cents: number | null
  client_total_cents: number | null; late_fee_rate: number | null
  late_fee_cents: number | null; due_date: string | null
  invoice_period_start: string | null; sent_at: string | null
  paid_at: string | null; created_at: string | null; job_id: string | null
  jobs: { title: string; job_code: string | null } | { title: string; job_code: string | null }[] | null
  profiles: ClientJoin | ClientJoin[] | null
}
type WrappedJobRow = {
  id: string; title: string; job_code: string | null
  start_date: string | null; end_date: string | null
  wrapped_at: string | null; client_id: string | null
  profiles: ClientJoin | ClientJoin[] | null
}

type AggInvoice = {
  total_cents: number | null
  rs_fee_cents: number | null
  client_total_cents: number | null
  status: string
}

function clientLabel(p: ClientJoin | ClientJoin[] | null): string {
  const row = unwrap(p)
  if (!row) return 'Unknown client'
  const cp = unwrap(row.client_profiles)
  return cp?.company_name || row.full_name || 'Unknown client'
}

export async function FinancePageServer({
  searchParams,
}: {
  searchParams?: { month?: string; quarter?: string }
}) {
  const { supabase } = await requireAdmin()
  const today = todayIsoLA()
  const selectedMonth = searchParams?.month ?? currentMonthIso()
  const { start: monthStart, end: monthEnd } = monthBounds(selectedMonth)

  const [allInvoicesRes, monthInvoicesRes, paidInvoicesRes, wrappedJobsRes] = await Promise.all([
    // All invoices (for the full list below)
    supabase.from('invoices')
      .select(`id, invoice_number, status, total_cents, rs_fee_cents, client_total_cents,
        late_fee_rate, late_fee_cents, due_date, invoice_period_start,
        sent_at, paid_at, created_at, job_id,
        jobs (title, job_code),
        profiles!invoices_client_id_fkey (full_name, client_profiles (company_name, billing_email))`)
      .order('created_at', { ascending: false }),

    // Invoices in selected month (sent/pending — by invoice_period_start)
    supabase.from('invoices')
      .select('id, total_cents, rs_fee_cents, client_total_cents, status')
      .gte('invoice_period_start', monthStart)
      .lte('invoice_period_start', monthEnd)
      .in('status', ['sent', 'overdue', 'late']),

    // Invoices paid in selected month (by paid_at)
    supabase.from('invoices')
      .select('id, total_cents, rs_fee_cents, client_total_cents, status')
      .eq('status', 'paid')
      .gte('paid_at', monthStart)
      .lte('paid_at', monthEnd + 'T23:59:59'),

    // Wrapped jobs without invoice
    supabase.from('jobs')
      .select(`id, title, job_code, start_date, end_date, wrapped_at, client_id,
        profiles!jobs_client_id_fkey (full_name, client_profiles (company_name, billing_email))`)
      .eq('status', 'wrapped')
      .order('wrapped_at', { ascending: false, nullsFirst: false }),
  ])

  const allInvoices = (allInvoicesRes.data ?? []) as unknown as InvoiceRow[]
  const monthInvoices = (monthInvoicesRes.data ?? []) as AggInvoice[]
  const paidInvoices = (paidInvoicesRes.data ?? []) as AggInvoice[]
  const wrappedJobs = (wrappedJobsRes.data ?? []) as unknown as WrappedJobRow[]

  // Ready to invoice = wrapped jobs with no non-void invoice
  const invoicedJobIds = new Set(
    allInvoices.filter(i => i.status !== 'void' && i.job_id).map(i => i.job_id as string)
  )
  const readyToInvoice = wrappedJobs.filter(j => !invoicedJobIds.has(j.id))

  // ── MONTHLY METRICS ──────────────────────────────────────────────────────
  // 1. Jobs Pending = total client-facing value of sent/overdue invoices in this month
  const jobsPendingTotal = monthInvoices.reduce((s, inv) => {
    const clientAmt = inv.client_total_cents ?? Math.round((inv.total_cents ?? 0) / 0.85)
    return s + clientAmt
  }, 0)
  const jobsPendingCount = monthInvoices.length

  // 2. Jobs Paid = total client-facing value of invoices paid this month
  const jobsPaidTotal = paidInvoices.reduce((s, inv) => {
    const clientAmt = inv.client_total_cents ?? Math.round((inv.total_cents ?? 0) / 0.85)
    return s + clientAmt
  }, 0)
  const jobsPaidCount = paidInvoices.length

  // 3. Talent Paid = 85% of paid invoices (talent net portion)
  const talentPaidTotal = paidInvoices.reduce((s, inv) => {
    const talentAmt = inv.rs_fee_cents
      ? (inv.client_total_cents ?? 0) - inv.rs_fee_cents
      : Math.round((inv.total_cents ?? 0) * 0.85)
    return s + talentAmt
  }, 0)

  // 4. RS Income = 15% of paid invoices (RS platform fee)
  const rsIncomeTotal = paidInvoices.reduce((s, inv) => {
    const fee = inv.rs_fee_cents
      ?? Math.round((inv.client_total_cents ?? Math.round((inv.total_cents ?? 0) / 0.85)) * 0.15)
    return s + fee
  }, 0)

  // Filter invoice list by selected month (show invoices where invoice_period_start is in this month)
  const filteredInvoices = allInvoices.filter(inv => {
    if (!inv.invoice_period_start) return true // show invoices with no period (drafts etc) always
    return inv.invoice_period_start >= monthStart && inv.invoice_period_start <= monthEnd
  })

  return (
    <div className="mx-auto" style={{ maxWidth: 720, padding: '20px 18px 28px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
        <h1 className="text-white" style={{ fontSize: 20, fontWeight: 600 }}>Finance</h1>
        <Link href="/admin/finance/new"
          style={{ fontSize: 12, fontWeight: 600, color: '#F0A500', textDecoration: 'none' }}>
          + New invoice
        </Link>
      </div>

      {/* Period selector — client component */}
      <Suspense fallback={null}>
        <FinancePeriodSelector currentMonth={selectedMonth} />
      </Suspense>

      {/* ── 4 MONTHLY METRICS ── */}
      <section className="mt-4">
        <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#7A90AA', marginBottom: 8 }}>
          Monthly Statement
        </p>
        <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}>

          {/* Jobs Pending */}
          <div style={{ background: '#1A2E4A', border: '1px solid rgba(240,165,0,0.2)', borderRadius: 12, padding: 14 }}>
            <p style={{ fontSize: 22, fontWeight: 700, color: '#F0A500', lineHeight: 1.1 }}>
              {centsToUsd(jobsPendingTotal)}
            </p>
            <p style={{ fontSize: 10, color: '#7A90AA', textTransform: 'uppercase', letterSpacing: '0.14em', marginTop: 6, fontWeight: 700 }}>
              Jobs Pending
            </p>
            <p style={{ fontSize: 11, color: '#7A90AA', marginTop: 2 }}>
              {jobsPendingCount} invoice{jobsPendingCount !== 1 ? 's' : ''} outstanding
            </p>
          </div>

          {/* Jobs Paid */}
          <div style={{ background: '#1A2E4A', border: '1px solid rgba(74,222,128,0.2)', borderRadius: 12, padding: 14 }}>
            <p style={{ fontSize: 22, fontWeight: 700, color: '#4ADE80', lineHeight: 1.1 }}>
              {centsToUsd(jobsPaidTotal)}
            </p>
            <p style={{ fontSize: 10, color: '#7A90AA', textTransform: 'uppercase', letterSpacing: '0.14em', marginTop: 6, fontWeight: 700 }}>
              Jobs Paid
            </p>
            <p style={{ fontSize: 11, color: '#7A90AA', marginTop: 2 }}>
              {jobsPaidCount} invoice{jobsPaidCount !== 1 ? 's' : ''} settled
            </p>
          </div>

          {/* Talent Paid */}
          <div style={{ background: '#1A2E4A', border: '1px solid rgba(0,163,180,0.2)', borderRadius: 12, padding: 14 }}>
            <p style={{ fontSize: 22, fontWeight: 700, color: '#00A3B4', lineHeight: 1.1 }}>
              {centsToUsd(talentPaidTotal)}
            </p>
            <p style={{ fontSize: 10, color: '#7A90AA', textTransform: 'uppercase', letterSpacing: '0.14em', marginTop: 6, fontWeight: 700 }}>
              Talent Paid
            </p>
            <p style={{ fontSize: 11, color: '#7A90AA', marginTop: 2 }}>
              85% of settled invoices
            </p>
          </div>

          {/* RS Income */}
          <div style={{ background: '#1A2E4A', border: '1px solid rgba(240,165,0,0.35)', borderRadius: 12, padding: 14 }}>
            <p style={{ fontSize: 22, fontWeight: 700, color: '#F0A500', lineHeight: 1.1 }}>
              {centsToUsd(rsIncomeTotal)}
            </p>
            <p style={{ fontSize: 10, color: '#7A90AA', textTransform: 'uppercase', letterSpacing: '0.14em', marginTop: 6, fontWeight: 700 }}>
              RS Income
            </p>
            <p style={{ fontSize: 11, color: '#7A90AA', marginTop: 2 }}>
              15% platform fee
            </p>
          </div>
        </div>
      </section>

      {/* ── READY TO INVOICE ── */}
      <section className="mt-6">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#7A90AA' }}>
            Ready to invoice ({readyToInvoice.length})
          </p>
        </div>
        {readyToInvoice.length === 0 ? (
          <div style={{ background: '#1A2E4A', borderRadius: 10, border: '1px solid rgba(255,255,255,0.05)', padding: '14px 14px' }}>
            <p style={{ fontSize: 12, color: '#7A90AA' }}>Nothing wrapped without an invoice.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {readyToInvoice.map(j => (
              <article key={j.id} style={{ background: '#1A2E4A', border: '1px solid rgba(240,165,0,0.15)', borderRadius: 10, padding: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p className="text-white" style={{ fontSize: 14, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {j.title}
                    </p>
                    <p style={{ fontSize: 12, color: '#AABDE0', marginTop: 2 }}>
                      {clientLabel(j.profiles)}
                      {j.end_date ? ` · wrapped ${formatDate(j.end_date)}` : ''}
                    </p>
                    {j.job_code && <div style={{ marginTop: 6 }}><JobCodePill code={j.job_code} /></div>}
                  </div>
                  <form action={generateDraftInvoiceFromJob}>
                    <input type="hidden" name="jobId" value={j.id} />
                    <button type="submit"
                      style={{ background: '#1E3A6B', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 14px', fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', cursor: 'pointer', whiteSpace: 'nowrap', minHeight: 40 }}>
                      Generate →
                    </button>
                  </form>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      {/* ── INVOICE LIST (filtered by selected month) ── */}
      <section className="mt-6">
        <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#7A90AA', marginBottom: 8 }}>
          Invoices — {new Date(selectedMonth + '-01').toLocaleString('en-US', { month: 'long', year: 'numeric' })}
          {filteredInvoices.length > 0 && ` (${filteredInvoices.length})`}
        </p>
        {filteredInvoices.length === 0 ? (
          <div style={{ background: '#1A2E4A', borderRadius: 10, border: '1px solid rgba(255,255,255,0.05)', padding: '20px', textAlign: 'center' }}>
            <p style={{ fontSize: 13, color: '#7A90AA' }}>No invoices for this month.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {filteredInvoices.map(inv => (
              <InvoiceRowCard key={inv.id} inv={inv} today={today} />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

function InvoiceRowCard({ inv, today }: { inv: InvoiceRow; today: string }) {
  const job = unwrap(inv.jobs)
  const client = clientLabel(inv.profiles)
  const clientAmt = inv.client_total_cents
    ?? Math.round(((inv.total_cents ?? 0) / 0.85))
  const isOverdue = inv.status === 'sent' && inv.due_date && inv.due_date < today
  const statusLabel = isOverdue ? 'overdue' : inv.status
  const lateFee = Number(inv.late_fee_rate ?? 0)

  return (
    <Link href={`/admin/finance/${inv.id}`}
      style={{ display: 'block', background: '#1A2E4A', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 10, padding: 14, textDecoration: 'none' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <p className="text-white" style={{ fontSize: 12, fontWeight: 700, fontFamily: 'ui-monospace, monospace' }}>
              {inv.invoice_number ?? 'DRAFT'}
            </p>
            <StatusBadge status={statusLabel} size="sm" />
            {lateFee > 0 && (
              <span style={{ padding: '2px 8px', fontSize: 10, fontWeight: 700, background: 'rgba(239,68,68,0.2)', color: '#F87171', border: '1px solid rgba(239,68,68,0.35)', borderRadius: 20, letterSpacing: '0.04em' }}>
                +{lateFee}% late fee
              </span>
            )}
          </div>
          <p className="text-white" style={{ fontSize: 13, fontWeight: 500, marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {job?.title ?? 'Untitled job'}
          </p>
          <p style={{ fontSize: 11, color: '#AABDE0', marginTop: 2 }}>
            {client}{inv.due_date ? ` · due ${formatDate(inv.due_date)}` : ''}
          </p>
        </div>
        <div style={{ flexShrink: 0, textAlign: 'right' }}>
          <p className="text-white" style={{ fontSize: 15, fontWeight: 700 }}>{centsToUsd(clientAmt)}</p>
          {inv.rs_fee_cents != null && (
            <p style={{ fontSize: 10, color: '#F0A500', marginTop: 2 }}>RS: {centsToUsd(inv.rs_fee_cents)}</p>
          )}
        </div>
      </div>
    </Link>
  )
}

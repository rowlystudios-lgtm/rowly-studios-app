import Link from 'next/link'
import { requireAdmin, centsToUsd, formatDate } from '@/lib/admin-auth'
import { StatusBadge } from '@/components/StatusBadge'
import { JobCodePill } from '@/components/JobCodePill'
import { generateDraftInvoiceFromJob } from './actions'

function todayIsoLA(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Los_Angeles',
  }).format(new Date())
}

function daysBetweenInclusive(start: string | null, end: string | null): number {
  if (!start) return 1
  const s = new Date(start)
  const e = end ? new Date(end) : s
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return 1
  const ms = e.getTime() - s.getTime()
  return Math.max(1, Math.round(ms / (1000 * 60 * 60 * 24)) + 1)
}

function unwrap<T>(v: T | T[] | null | undefined): T | null {
  if (v == null) return null
  return Array.isArray(v) ? (v[0] ?? null) : v
}

type ClientJoin = {
  full_name: string | null
  client_profiles:
    | { company_name: string | null; billing_email: string | null }
    | { company_name: string | null; billing_email: string | null }[]
    | null
}

type InvoiceRow = {
  id: string
  invoice_number: string | null
  status: string
  total_cents: number | null
  rs_fee_cents: number | null
  client_total_cents: number | null
  late_fee_rate: number | null
  late_fee_cents: number | null
  due_date: string | null
  invoice_period_start: string | null
  sent_at: string | null
  paid_at: string | null
  created_at: string | null
  job_id: string | null
  jobs:
    | { title: string; job_code: string | null }
    | { title: string; job_code: string | null }[]
    | null
  profiles: ClientJoin | ClientJoin[] | null
}

type WrappedJobRow = {
  id: string
  title: string
  job_code: string | null
  start_date: string | null
  end_date: string | null
  wrapped_at: string | null
  client_id: string | null
  profiles: ClientJoin | ClientJoin[] | null
}

function clientLabel(p: ClientJoin | ClientJoin[] | null): string {
  const row = unwrap(p)
  if (!row) return 'Unknown client'
  const cp = unwrap(row.client_profiles)
  return cp?.company_name || row.full_name || 'Unknown client'
}

export default async function FinancePageServer() {
  const { supabase } = await requireAdmin()

  const [invRes, wrappedJobsRes, confirmedJobsBudgetRes, confirmedBookingsRes] =
    await Promise.all([
      supabase
        .from('invoices')
        .select(
          `id, invoice_number, status, total_cents, rs_fee_cents,
           client_total_cents, late_fee_rate, late_fee_cents, due_date,
           invoice_period_start, sent_at, paid_at, created_at, job_id,
           jobs (title, job_code),
           profiles!invoices_client_id_fkey (full_name,
             client_profiles (company_name, billing_email))`
        )
        .order('created_at', { ascending: false }),
      supabase
        .from('jobs')
        .select(
          `id, title, job_code, start_date, end_date, wrapped_at, client_id,
           profiles!jobs_client_id_fkey (full_name,
             client_profiles (company_name, billing_email))`
        )
        .eq('status', 'wrapped')
        .order('wrapped_at', { ascending: false, nullsFirst: false }),
      supabase
        .from('jobs')
        .select('total_budget_cents, client_budget_cents, status')
        .in('status', ['confirmed', 'wrapped']),
      supabase
        .from('job_bookings')
        .select(
          `confirmed_rate_cents,
           jobs!inner (start_date, end_date, status)`
        )
        .in('status', ['confirmed', 'completed']),
    ])

  const invoices = (invRes.data ?? []) as unknown as InvoiceRow[]
  const wrappedJobs = (wrappedJobsRes.data ?? []) as unknown as WrappedJobRow[]
  const today = todayIsoLA()

  // Ready to Invoice = wrapped jobs with no non-void invoice yet.
  const invoicedJobIds = new Set(
    invoices
      .filter((i) => i.status !== 'void' && i.job_id)
      .map((i) => i.job_id as string)
  )
  const readyToInvoice = wrappedJobs.filter((j) => !invoicedJobIds.has(j.id))

  // P&L
  const confirmedBudget = (
    (confirmedJobsBudgetRes.data ?? []) as Array<{
      total_budget_cents: number | null
      client_budget_cents: number | null
    }>
  ).reduce(
    (s, j) => s + (j.total_budget_cents ?? j.client_budget_cents ?? 0),
    0
  )

  type BookingAgg = {
    confirmed_rate_cents: number | null
    jobs: { start_date: string | null; end_date: string | null } | null
  }
  const outgoingTalent = (
    (confirmedBookingsRes.data ?? []) as unknown as BookingAgg[]
  ).reduce((s, b) => {
    const days = daysBetweenInclusive(
      b.jobs?.start_date ?? null,
      b.jobs?.end_date ?? null
    )
    return s + (b.confirmed_rate_cents ?? 0) * days
  }, 0)

  const rsIncome = Math.round(outgoingTalent * 0.15)
  const outstanding = invoices
    .filter((i) => {
      const overdueByDate =
        i.status === 'sent' && i.due_date && i.due_date < today
      return i.status === 'sent' || i.status === 'overdue' || overdueByDate
    })
    .reduce(
      (s, i) =>
        s +
        (i.client_total_cents ??
          (i.total_cents ?? 0) + Math.round((i.total_cents ?? 0) * 0.15)),
      0
    )

  return (
    <div className="mx-auto" style={{ maxWidth: 720, padding: '20px 18px 28px' }}>
      <h1 className="text-white" style={{ fontSize: 20, fontWeight: 600 }}>
        Finance
      </h1>

      {/* P&L Overview — 4 cards */}
      <section className="mt-4">
        <p
          style={{
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            color: '#7A90AA',
            marginBottom: 8,
          }}
        >
          P&L Overview
        </p>
        <div
          className="admin-grid grid gap-3"
          style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}
        >
          <PnLCard label="Confirmed budget" value={centsToUsd(confirmedBudget)} />
          <PnLCard label="Outgoing talent" value={centsToUsd(outgoingTalent)} />
          <PnLCard label="RS income (15%)" value={centsToUsd(rsIncome)} tone="green" />
          <PnLCard
            label="Outstanding"
            value={centsToUsd(outstanding)}
            tone={outstanding > 0 ? 'amber' : 'default'}
          />
        </div>
      </section>

      {/* Ready to Invoice */}
      <section className="mt-6">
        <div className="flex items-center justify-between mb-2">
          <p
            style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              color: '#7A90AA',
            }}
          >
            Ready to invoice ({readyToInvoice.length})
          </p>
        </div>
        {readyToInvoice.length === 0 ? (
          <div
            className="rounded-xl bg-[#1A2E4A] border border-white/5"
            style={{ padding: '16px 14px' }}
          >
            <p style={{ fontSize: 12.5, color: '#7A90AA' }}>
              Nothing wrapped without an invoice. Good work.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {readyToInvoice.map((j) => (
              <article
                key={j.id}
                className="rounded-xl bg-[#1A2E4A] border border-white/5"
                style={{ padding: 14 }}
              >
                <div className="flex items-center justify-between gap-3">
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p
                      className="text-white"
                      style={{
                        fontSize: 14,
                        fontWeight: 500,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {j.title}
                    </p>
                    <p
                      style={{
                        fontSize: 12,
                        color: '#AABDE0',
                        marginTop: 2,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {clientLabel(j.profiles)}
                      {j.end_date && ` · wrapped ${formatDate(j.end_date)}`}
                    </p>
                    {j.job_code && (
                      <div className="mt-1.5">
                        <JobCodePill code={j.job_code} />
                      </div>
                    )}
                  </div>
                  <form action={generateDraftInvoiceFromJob}>
                    <input type="hidden" name="jobId" value={j.id} />
                    <button
                      type="submit"
                      className="rounded-lg bg-[#1E3A6B] hover:bg-[#253D8A] text-white transition-colors"
                      style={{
                        padding: '9px 14px',
                        fontSize: 12,
                        fontWeight: 600,
                        textTransform: 'uppercase',
                        letterSpacing: '0.04em',
                        whiteSpace: 'nowrap',
                        minHeight: 40,
                      }}
                    >
                      Generate →
                    </button>
                  </form>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      {/* All invoices */}
      <section className="mt-6">
        <div className="flex items-center justify-between mb-2">
          <p
            style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              color: '#7A90AA',
            }}
          >
            All invoices ({invoices.length})
          </p>
          <Link
            href="/admin/finance/new"
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: '#F0A500',
              textDecoration: 'none',
            }}
          >
            + New invoice
          </Link>
        </div>
        {invoices.length === 0 ? (
          <div
            className="rounded-xl bg-[#1A2E4A] border border-white/5 text-center"
            style={{ padding: '26px 20px' }}
          >
            <p style={{ fontSize: 13, color: '#AABDE0' }}>No invoices yet.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {invoices.map((inv) => (
              <InvoiceRowCard key={inv.id} inv={inv} today={today} />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

function PnLCard({
  label,
  value,
  tone = 'default',
}: {
  label: string
  value: string
  tone?: 'default' | 'amber' | 'green'
}) {
  const color = tone === 'amber' ? '#F0A500' : tone === 'green' ? '#4ADE80' : '#fff'
  return (
    <div
      className="rounded-xl bg-[#1A2E4A] border border-white/5"
      style={{ padding: 14 }}
    >
      <p style={{ fontSize: 20, fontWeight: 700, color, lineHeight: 1.1 }}>
        {value}
      </p>
      <p
        style={{
          fontSize: 10,
          color: '#7A90AA',
          textTransform: 'uppercase',
          letterSpacing: '0.14em',
          marginTop: 6,
          fontWeight: 700,
        }}
      >
        {label}
      </p>
    </div>
  )
}

function InvoiceRowCard({ inv, today }: { inv: InvoiceRow; today: string }) {
  const job = unwrap(inv.jobs)
  const client = clientLabel(inv.profiles)
  const amount =
    inv.client_total_cents ??
    (inv.total_cents ?? 0) + Math.round((inv.total_cents ?? 0) * 0.15)
  const isOverdueByDate =
    inv.status === 'sent' && inv.due_date && inv.due_date < today
  const statusLabel = isOverdueByDate ? 'overdue' : inv.status
  const lateFee = Number(inv.late_fee_rate ?? 0)

  return (
    <Link
      href={`/admin/finance/${inv.id}`}
      className="block rounded-xl bg-[#1A2E4A] border border-white/5 hover:border-white/10 transition-colors"
      style={{ padding: 14, textDecoration: 'none' }}
    >
      <div className="flex items-center justify-between gap-3">
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="flex items-center gap-2">
            <p
              className="text-white"
              style={{
                fontSize: 13,
                fontWeight: 600,
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
              }}
            >
              {inv.invoice_number ?? 'DRAFT'}
            </p>
            <StatusBadge status={statusLabel} size="sm" />
            {lateFee > 0 && (
              <span
                className="rounded-full"
                style={{
                  padding: '2px 8px',
                  fontSize: 10,
                  fontWeight: 700,
                  background: 'rgba(239,68,68,0.2)',
                  color: '#F87171',
                  border: '1px solid rgba(239,68,68,0.35)',
                  letterSpacing: '0.04em',
                }}
              >
                +{lateFee}% late fee
              </span>
            )}
          </div>
          <p
            className="text-white"
            style={{
              fontSize: 14,
              fontWeight: 500,
              marginTop: 4,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {job?.title ?? 'Untitled job'}
          </p>
          <p
            style={{
              fontSize: 12,
              color: '#AABDE0',
              marginTop: 2,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {client}
            {inv.due_date ? ` · due ${formatDate(inv.due_date)}` : ''}
          </p>
        </div>
        <div className="text-right" style={{ flexShrink: 0 }}>
          <p className="text-white" style={{ fontSize: 15, fontWeight: 700 }}>
            {centsToUsd(amount)}
          </p>
        </div>
      </div>
    </Link>
  )
}

import Link from 'next/link'
import type { Metadata } from 'next'
import { requireAdmin, centsToUsd, formatDate } from '@/lib/admin-auth'
import { StatusBadge } from '@/components/StatusBadge'
import { FinanceFilterClient } from './FinanceFilterClient'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Finance — RS Admin',
}

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
  return Array.isArray(v) ? v[0] ?? null : v
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
  tax_cents: number | null
  due_date: string | null
  sent_at: string | null
  paid_at: string | null
  created_at: string | null
  jobs:
    | { title: string; start_date: string | null }
    | { title: string; start_date: string | null }[]
    | null
  profiles: ClientJoin | ClientJoin[] | null
}

export default async function AdminFinancePage({
  searchParams,
}: {
  searchParams: { status?: string }
}) {
  const { supabase } = await requireAdmin()

  const [invRes, uninvoicedBookingsRes] = await Promise.all([
    supabase
      .from('invoices')
      .select(
        `id, invoice_number, status, total_cents, tax_cents,
         due_date, sent_at, paid_at, created_at,
         jobs (title, start_date),
         profiles!invoices_client_id_fkey (full_name,
           client_profiles (company_name, billing_email))`
      )
      .order('created_at', { ascending: false }),
    // Confirmed bookings not yet attached to any non-void invoice.
    supabase
      .from('job_bookings')
      .select(
        `id, confirmed_rate_cents,
         jobs!inner (start_date, end_date),
         invoice_line_items (id, invoice_id,
           invoices (status))`
      )
      .eq('status', 'confirmed'),
  ])

  const rows = (invRes.data ?? []) as unknown as InvoiceRow[]
  const today = todayIsoLA()

  // Financial summary
  let totalPaid = 0
  let totalOutstanding = 0
  let totalOverdue = 0
  let draftCount = 0
  let sentCount = 0
  let overdueCount = 0
  for (const i of rows) {
    const total = i.total_cents ?? 0
    const overdueByDate =
      i.status === 'sent' && i.due_date && i.due_date < today
    if (i.status === 'paid') totalPaid += total
    else if (i.status === 'overdue' || overdueByDate) {
      totalOutstanding += total
      totalOverdue += total
      overdueCount += 1
    } else if (i.status === 'sent') {
      totalOutstanding += total
      sentCount += 1
    } else if (i.status === 'draft') draftCount += 1
  }

  // Uninvoiced confirmed bookings — exclude bookings already on a non-void invoice.
  type RawBooking = {
    id: string
    confirmed_rate_cents: number | null
    jobs: { start_date: string | null; end_date: string | null } | null
    invoice_line_items: Array<{
      id: string
      invoice_id: string
      invoices: { status: string } | { status: string }[] | null
    }> | null
  }
  const bookings = (uninvoicedBookingsRes.data ?? []) as unknown as RawBooking[]
  let uninvoicedCount = 0
  let uninvoicedCents = 0
  for (const b of bookings) {
    const lineItems = Array.isArray(b.invoice_line_items)
      ? b.invoice_line_items
      : []
    const hasLive = lineItems.some((li) => {
      const inv = Array.isArray(li.invoices) ? li.invoices[0] : li.invoices
      return inv && inv.status !== 'void'
    })
    if (hasLive) continue
    uninvoicedCount += 1
    const days = daysBetweenInclusive(
      b.jobs?.start_date ?? null,
      b.jobs?.end_date ?? null
    )
    uninvoicedCents += (b.confirmed_rate_cents ?? 0) * days
  }

  const filter = searchParams.status ?? 'all'
  const shown = rows.filter((r) => {
    const overdueByDate =
      r.status === 'sent' && r.due_date && r.due_date < today
    if (filter === 'all') return true
    if (filter === 'overdue') return r.status === 'overdue' || overdueByDate
    return r.status === filter
  })

  function clientLabel(p: ClientJoin | ClientJoin[] | null): string {
    const row = unwrap(p)
    if (!row) return 'Unknown client'
    const cp = unwrap(row.client_profiles)
    return cp?.company_name || row.full_name || 'Unknown client'
  }

  function jobLabel(j: InvoiceRow['jobs']): string | null {
    const row = unwrap(j)
    return row?.title ?? null
  }

  return (
    <div className="mx-auto" style={{ maxWidth: 720, padding: '20px 18px 28px' }}>
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-white" style={{ fontSize: 20, fontWeight: 600 }}>
          Finance
        </h1>
        <Link
          href="/admin/finance/new"
          className="rounded-lg bg-[#1E3A6B] hover:bg-[#253D8A] text-white transition-colors"
          style={{
            padding: '8px 16px',
            fontSize: 13,
            fontWeight: 500,
            textDecoration: 'none',
            whiteSpace: 'nowrap',
          }}
        >
          + New invoice
        </Link>
      </div>

      {/* Summary strip */}
      <div
        className="mt-4 grid gap-3"
        style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}
      >
        <SummaryChip
          label="Total received"
          value={centsToUsd(totalPaid)}
          tone={totalPaid > 0 ? 'green' : 'default'}
        />
        <SummaryChip
          label="Outstanding"
          value={centsToUsd(totalOutstanding)}
          tone={totalOutstanding > 0 ? 'amber' : 'default'}
        />
        <SummaryChip
          label="Overdue"
          value={centsToUsd(totalOverdue)}
          tone={totalOverdue > 0 ? 'red' : 'default'}
        />
        <SummaryChip
          label="Drafts"
          value={String(draftCount)}
          tone="default"
        />
      </div>

      {/* Uninvoiced alert */}
      {uninvoicedCount > 0 && (
        <Link
          href="/admin/finance/new"
          className="mt-4 flex items-center justify-between rounded-xl"
          style={{
            background: 'rgba(59,130,246,0.15)',
            border: '1px solid rgba(59,130,246,0.35)',
            color: '#93C5FD',
            padding: '12px 14px',
            textDecoration: 'none',
          }}
        >
          <span
            className="flex items-center gap-2"
            style={{ fontSize: 13, fontWeight: 600 }}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="16" x2="12" y2="12" />
              <line x1="12" y1="8" x2="12.01" y2="8" />
            </svg>
            {uninvoicedCount} confirmed booking
            {uninvoicedCount === 1 ? '' : 's'} not yet invoiced —{' '}
            {centsToUsd(uninvoicedCents)} ready to bill
          </span>
          <span style={{ fontSize: 13, fontWeight: 600 }}>Create invoices →</span>
        </Link>
      )}

      <div className="mt-5">
        <FinanceFilterClient current={filter} />
      </div>

      {shown.length === 0 ? (
        <div
          className="mt-4 rounded-xl bg-[#1A2E4A] border border-white/5 text-center"
          style={{ padding: '26px 20px' }}
        >
          <p style={{ fontSize: 14, color: '#AABDE0', fontWeight: 500 }}>
            No invoices yet.
          </p>
          {filter === 'all' && (
            <Link
              href="/admin/finance/new"
              className="inline-block mt-3 rounded-lg bg-[#1E3A6B] hover:bg-[#253D8A] text-white transition-colors"
              style={{
                padding: '9px 16px',
                fontSize: 12,
                fontWeight: 600,
                textDecoration: 'none',
                letterSpacing: '0.04em',
                textTransform: 'uppercase',
              }}
            >
              + Create your first invoice
            </Link>
          )}
        </div>
      ) : (
        <div className="mt-4 flex flex-col gap-2">
          {shown.map((i) => {
            const overdueByDate =
              i.status === 'sent' && i.due_date && i.due_date < today
            const effectiveStatus = overdueByDate ? 'overdue' : i.status
            const job = jobLabel(i.jobs)
            let dateLabel = ''
            let dateColor = '#7A90AA'
            if (i.status === 'paid' && i.paid_at) {
              dateLabel = `Paid ${formatDate(i.paid_at)}`
              dateColor = '#4ADE80'
            } else if (effectiveStatus === 'overdue' && i.due_date) {
              dateLabel = `Overdue since ${formatDate(i.due_date)}`
              dateColor = '#F87171'
            } else if (i.status === 'sent' && i.due_date) {
              dateLabel = `Due ${formatDate(i.due_date)}`
              dateColor = '#fff'
            } else if (i.status === 'draft' && i.created_at) {
              dateLabel = `Created ${formatDate(i.created_at)}`
            }
            return (
              <Link
                key={i.id}
                href={`/admin/finance/${i.id}`}
                className="block rounded-xl bg-[#1A2E4A] border border-white/5 hover:border-white/10 transition-colors"
                style={{ padding: 16, textDecoration: 'none' }}
              >
                <div className="flex items-start justify-between gap-3">
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p
                      className="text-white"
                      style={{
                        fontSize: 15,
                        fontWeight: 500,
                        fontFamily:
                          'ui-monospace, SFMono-Regular, Menlo, monospace',
                        letterSpacing: '0.02em',
                      }}
                    >
                      {i.invoice_number ?? 'Draft'}
                    </p>
                    <p
                      style={{
                        fontSize: 13,
                        color: '#AABDE0',
                        marginTop: 2,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {clientLabel(i.profiles)}
                    </p>
                    {job && (
                      <p
                        style={{
                          fontSize: 12,
                          color: '#7A90AA',
                          marginTop: 1,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {job}
                      </p>
                    )}
                  </div>

                  <div
                    className="text-right"
                    style={{ flexShrink: 0 }}
                  >
                    <p
                      className="text-white"
                      style={{ fontSize: 16, fontWeight: 600, lineHeight: 1 }}
                    >
                      {centsToUsd(i.total_cents)}
                    </p>
                    {i.tax_cents != null && i.tax_cents > 0 && (
                      <p style={{ fontSize: 11, color: '#7A90AA', marginTop: 2 }}>
                        + {centsToUsd(i.tax_cents)} tax
                      </p>
                    )}
                    <div className="mt-2 flex flex-col items-end gap-1">
                      <StatusBadge status={effectiveStatus} size="sm" />
                      {dateLabel && (
                        <span style={{ fontSize: 11, color: dateColor }}>
                          {dateLabel}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}

function SummaryChip({
  label,
  value,
  tone,
}: {
  label: string
  value: string
  tone: 'default' | 'amber' | 'green' | 'red'
}) {
  const color =
    tone === 'amber'
      ? '#F0A500'
      : tone === 'green'
      ? '#4ADE80'
      : tone === 'red'
      ? '#F87171'
      : '#fff'
  return (
    <div
      className="rounded-xl bg-[#1A2E4A] border border-white/5"
      style={{ padding: 16, textAlign: 'center' }}
    >
      <p
        style={{
          fontSize: 22,
          fontWeight: 700,
          color,
          lineHeight: 1,
          letterSpacing: '-0.01em',
        }}
      >
        {value}
      </p>
      <p
        style={{
          fontSize: 10,
          color: '#7A90AA',
          textTransform: 'uppercase',
          letterSpacing: '0.14em',
          marginTop: 8,
          fontWeight: 700,
        }}
      >
        {label}
      </p>
    </div>
  )
}

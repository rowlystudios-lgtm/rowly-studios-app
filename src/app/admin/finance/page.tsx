import Link from 'next/link'
import {
  requireAdmin,
  centsToUsd,
  formatDate,
  invoiceStatusStyle,
  todayIso,
} from '@/lib/admin-auth'
import { FinanceFilterClient } from './FinanceFilterClient'

export const dynamic = 'force-dynamic'

export default async function AdminFinancePage({
  searchParams,
}: {
  searchParams: { status?: string }
}) {
  const { supabase } = await requireAdmin()

  const { data } = await supabase
    .from('invoices')
    .select(
      `id, invoice_number, status, total_cents, due_date, created_at,
       jobs (id, title),
       profiles!invoices_client_id_fkey (id, first_name, last_name, full_name,
         client_profiles (company_name))`
    )
    .order('created_at', { ascending: false })

  type Row = {
    id: string
    invoice_number: string | null
    status: string
    total_cents: number | null
    due_date: string | null
    created_at: string | null
    jobs: { id: string; title: string } | { id: string; title: string }[] | null
    profiles:
      | {
          first_name: string | null
          last_name: string | null
          full_name: string | null
          client_profiles:
            | { company_name: string | null }
            | { company_name: string | null }[]
            | null
        }
      | {
          first_name: string | null
          last_name: string | null
          full_name: string | null
          client_profiles:
            | { company_name: string | null }
            | { company_name: string | null }[]
            | null
        }[]
      | null
  }

  const rows = (data ?? []) as unknown as Row[]
  const today = todayIso()

  const outstandingTotal = rows
    .filter((r) => r.status === 'sent' || r.status === 'overdue')
    .reduce((sum, r) => sum + (r.total_cents ?? 0), 0)
  const paidTotal = rows
    .filter((r) => r.status === 'paid')
    .reduce((sum, r) => sum + (r.total_cents ?? 0), 0)
  const sentAwaiting = rows.filter((r) => r.status === 'sent').length
  const overdueCount = rows.filter(
    (r) =>
      r.status === 'overdue' ||
      (r.status === 'sent' && r.due_date && r.due_date < today)
  ).length

  const filter = searchParams.status ?? 'all'
  const shown = rows.filter((r) => {
    if (filter === 'all') return true
    if (filter === 'overdue') {
      return (
        r.status === 'overdue' ||
        (r.status === 'sent' && r.due_date && r.due_date < today)
      )
    }
    return r.status === filter
  })

  function clientDisplay(rawRow: Row['profiles']): string {
    const row = Array.isArray(rawRow) ? rawRow[0] : rawRow
    if (!row) return 'Unknown'
    const cp = Array.isArray(row.client_profiles)
      ? row.client_profiles[0]
      : row.client_profiles
    return (
      cp?.company_name ||
      [row.first_name, row.last_name].filter(Boolean).join(' ') ||
      row.full_name ||
      'Unknown'
    )
  }

  function jobOf(rawRow: Row['jobs']): { id: string; title: string } | null {
    if (!rawRow) return null
    return Array.isArray(rawRow) ? rawRow[0] ?? null : rawRow
  }

  return (
    <div style={{ padding: '18px 18px', maxWidth: 640, margin: '0 auto' }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, color: '#fff' }}>Finance</h1>

      {/* Summary chips */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, 1fr)',
          gap: 8,
          marginTop: 12,
        }}
      >
        <Chip label="Outstanding" value={centsToUsd(outstandingTotal)} tone="amber" />
        <Chip label="Paid" value={centsToUsd(paidTotal)} tone="green" />
        <Chip label="Awaiting" value={String(sentAwaiting)} />
        <Chip label="Overdue" value={String(overdueCount)} tone={overdueCount > 0 ? 'red' : 'default'} />
      </div>

      <div style={{ marginTop: 16 }}>
        <FinanceFilterClient current={filter} />
      </div>

      {shown.length === 0 ? (
        <p
          style={{
            fontSize: 13,
            color: '#7A90AA',
            fontStyle: 'italic',
            marginTop: 16,
          }}
        >
          No {filter === 'all' ? '' : filter} invoices
        </p>
      ) : (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            marginTop: 14,
          }}
        >
          {shown.map((inv) => {
            const s = invoiceStatusStyle(inv.status)
            const overdue =
              inv.status !== 'paid' && inv.due_date && inv.due_date < today
            return (
              <Link
                key={inv.id}
                href={`/admin/finance/${inv.id}`}
                style={{
                  background: '#1A2E4A',
                  border: '1px solid rgba(170,189,224,0.15)',
                  borderRadius: 12,
                  padding: '12px 14px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 10,
                  textDecoration: 'none',
                  color: '#fff',
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 13, fontWeight: 700 }}>{inv.invoice_number}</p>
                  <p
                    style={{
                      fontSize: 11,
                      color: '#AABDE0',
                      marginTop: 2,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {clientDisplay(inv.profiles)}
                    {jobOf(inv.jobs) && ` · ${jobOf(inv.jobs)!.title}`}
                  </p>
                  <p
                    style={{
                      fontSize: 11,
                      color: overdue ? '#F87171' : '#7A90AA',
                      marginTop: 2,
                    }}
                  >
                    {inv.due_date ? `Due ${formatDate(inv.due_date)}` : 'No due date'}
                  </p>
                </div>
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 6,
                    alignItems: 'flex-end',
                    flexShrink: 0,
                  }}
                >
                  <span style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>
                    {centsToUsd(inv.total_cents)}
                  </span>
                  <span
                    style={{
                      padding: '3px 8px',
                      borderRadius: 999,
                      fontSize: 10,
                      fontWeight: 700,
                      letterSpacing: '0.06em',
                      textTransform: 'uppercase',
                      background: s.bg,
                      color: s.color,
                    }}
                  >
                    {s.label}
                  </span>
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}

function Chip({
  label,
  value,
  tone = 'default',
}: {
  label: string
  value: string
  tone?: 'default' | 'amber' | 'green' | 'red'
}) {
  const colorByTone: Record<string, string> = {
    default: '#fff',
    amber: '#F0A500',
    green: '#4ADE80',
    red: '#F87171',
  }
  return (
    <div
      style={{
        background: '#1A2E4A',
        border: '1px solid rgba(170,189,224,0.15)',
        borderRadius: 12,
        padding: '12px 14px',
      }}
    >
      <p
        style={{
          fontSize: 20,
          fontWeight: 700,
          color: colorByTone[tone],
          lineHeight: 1,
        }}
      >
        {value}
      </p>
      <p
        style={{
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: '#AABDE0',
          marginTop: 6,
        }}
      >
        {label}
      </p>
    </div>
  )
}

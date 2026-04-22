import Link from 'next/link'
import type { Metadata } from 'next'
import { requireAdmin } from '@/lib/admin-auth'
import { JobsFilterClient, type JobFilterKey } from './JobsFilterClient'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Jobs — RS Admin',
}

function todayIsoLA(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Los_Angeles',
  }).format(new Date())
}

function dateDayMonth(iso: string | null): { day: string; month: string } {
  if (!iso) return { day: '—', month: '' }
  const parts = iso.split('-').map(Number)
  if (parts.length !== 3 || parts.some(Number.isNaN)) return { day: '—', month: '' }
  const d = new Date(parts[0], parts[1] - 1, parts[2])
  return {
    day: String(d.getDate()),
    month: d.toLocaleString('en-US', { month: 'short' }).toUpperCase(),
  }
}

type ClientJoin = {
  full_name: string | null
  client_profiles:
    | { company_name: string | null }
    | { company_name: string | null }[]
    | null
}

type BookingMini = { id: string; status: string }
type InvoiceMini = { job_id: string | null; status: string }

type Row = {
  id: string
  title: string
  status: string
  job_code: string | null
  start_date: string | null
  end_date: string | null
  location: string | null
  address_city: string | null
  address_state: string | null
  num_talent: number | null
  profiles: ClientJoin | ClientJoin[] | null
  job_bookings: BookingMini[] | null
}

function clientDisplay(p: ClientJoin | ClientJoin[] | null): string {
  const row = Array.isArray(p) ? (p[0] ?? null) : p
  if (!row) return 'Unknown client'
  const cp = Array.isArray(row.client_profiles)
    ? (row.client_profiles[0] ?? null)
    : row.client_profiles
  return cp?.company_name || row.full_name || 'Unknown client'
}

function normalizeFilter(raw: string | undefined): JobFilterKey {
  if (raw === 'active' || raw === 'action' || raw === 'wrapped') return raw
  return 'all'
}

type InvoiceState = 'paid' | 'invoiced' | 'draft' | 'none'

function foldInvoiceState(cur: InvoiceState, next: string): InvoiceState {
  if (cur === 'paid' || next === 'paid') return 'paid'
  if (next === 'sent' || next === 'overdue') return 'invoiced'
  if (cur === 'invoiced') return 'invoiced'
  if (next === 'draft') return cur === 'none' ? 'draft' : cur
  return cur
}

export default async function AdminJobsPage({
  searchParams,
}: {
  searchParams: { status?: string }
}) {
  const { supabase } = await requireAdmin()

  const [jobsRes, invoicesRes] = await Promise.all([
    supabase
      .from('jobs')
      .select(
        `id, title, status, job_code, start_date, end_date, location,
         address_city, address_state, num_talent,
         profiles!jobs_client_id_fkey (full_name,
           client_profiles (company_name)),
         job_bookings (id, status)`
      )
      .order('start_date', { ascending: false, nullsFirst: false }),
    supabase.from('invoices').select('job_id, status'),
  ])

  const rows = (jobsRes.data ?? []) as unknown as Row[]
  const invoices = (invoicesRes.data ?? []) as InvoiceMini[]

  const invoiceStateByJob = new Map<string, InvoiceState>()
  for (const inv of invoices) {
    if (!inv.job_id) continue
    const cur = invoiceStateByJob.get(inv.job_id) ?? 'none'
    invoiceStateByJob.set(inv.job_id, foldInvoiceState(cur, inv.status))
  }

  // ─── Per-job derived state ───
  type Enriched = Row & {
    confirmed: number
    needed: number
    invoiceState: InvoiceState
    actionNeeded: boolean
  }

  const today = todayIsoLA()

  const enriched: Enriched[] = rows.map((j) => {
    const bookings = Array.isArray(j.job_bookings) ? j.job_bookings : []
    // 'unavailable' bookings never count toward confirmed/needed.
    const countable = bookings.filter((b) => b.status !== 'unavailable')
    const confirmed = countable.filter(
      (b) => b.status === 'confirmed' || b.status === 'completed'
    ).length
    const needed = j.num_talent ?? 0
    const invoiceState = invoiceStateByJob.get(j.id) ?? 'none'
    const hasRequested = bookings.some(
      (b) => b.status === 'requested' || b.status === 'negotiating'
    )
    const wrappedUninvoiced =
      j.status === 'wrapped' &&
      (invoiceState === 'none' || invoiceState === 'draft')
    const actionNeeded = hasRequested || wrappedUninvoiced
    return { ...j, confirmed, needed, invoiceState, actionNeeded }
  })

  const actionCount = enriched.filter((j) => j.actionNeeded).length
  const filter = normalizeFilter(searchParams.status)

  const shown = enriched.filter((j) => {
    if (filter === 'all') return true
    if (filter === 'active')
      return (
        j.status === 'submitted' ||
        j.status === 'crewing' ||
        j.status === 'confirmed'
      )
    if (filter === 'action') return j.actionNeeded
    if (filter === 'wrapped') return j.status === 'wrapped'
    return true
  })

  // Primary sort: start_date desc (nulls last).
  // Within the same start_date: action-needed floats to top.
  shown.sort((a, b) => {
    const ad = a.start_date ?? ''
    const bd = b.start_date ?? ''
    if (ad !== bd) {
      if (!ad) return 1
      if (!bd) return -1
      return bd.localeCompare(ad)
    }
    if (a.actionNeeded !== b.actionNeeded) return a.actionNeeded ? -1 : 1
    return 0
  })

  return (
    <div className="px-5 pt-5 pb-6 mx-auto" style={{ maxWidth: 720 }}>
      <h1 className="text-white" style={{ fontSize: 20, fontWeight: 600 }}>
        Jobs
      </h1>

      <div className="mt-4">
        <JobsFilterClient current={filter} actionCount={actionCount} />
      </div>

      {shown.length === 0 ? (
        <div
          className="mt-4 rounded-xl bg-[#1A2E4A] border border-white/5"
          style={{ padding: '22px 20px' }}
        >
          <p className="text-center" style={{ fontSize: 13, color: '#7A90AA' }}>
            No {filter === 'all' ? '' : filter === 'action' ? 'action-needed' : filter} jobs
          </p>
        </div>
      ) : (
        <div className="mt-4 flex flex-col gap-2.5">
          {shown.map((j) => (
            <JobCard key={j.id} job={j} today={today} />
          ))}
        </div>
      )}
    </div>
  )
}

function JobCard({
  job,
  today,
}: {
  job: {
    id: string
    title: string
    status: string
    start_date: string | null
    end_date: string | null
    location: string | null
    address_city: string | null
    address_state: string | null
    profiles: ClientJoin | ClientJoin[] | null
    confirmed: number
    needed: number
    invoiceState: InvoiceState
    actionNeeded: boolean
  }
  today: string
}) {
  const dm = dateDayMonth(job.start_date)
  const loc =
    [job.address_city, job.address_state].filter(Boolean).join(', ') ||
    job.location ||
    ''
  const confirmed = job.confirmed
  const needed = job.needed || 1
  const invoiceLabel =
    job.invoiceState === 'paid'
      ? 'Paid'
      : job.invoiceState === 'invoiced'
        ? 'Invoiced'
        : job.invoiceState === 'draft'
          ? 'Draft invoice'
          : 'Not invoiced'
  const invoiceChipStyle =
    job.invoiceState === 'paid'
      ? 'bg-green-900/40 text-green-300'
      : job.invoiceState === 'invoiced'
        ? 'bg-blue-900/40 text-blue-300'
        : job.invoiceState === 'draft'
          ? 'bg-amber-900/40 text-amber-300'
          : 'bg-gray-800/60 text-gray-400'
  const bookingChipStyle =
    confirmed >= needed
      ? 'bg-green-900/40 text-green-300'
      : confirmed > 0
        ? 'bg-amber-900/40 text-amber-300'
        : 'bg-gray-800/60 text-gray-400'

  const upcoming = Boolean(job.start_date && job.start_date >= today)

  return (
    <Link
      href={`/admin/jobs/${job.id}`}
      className="block rounded-xl bg-[#1A2E4A] border border-white/5 hover:border-white/10 transition-colors relative"
      style={{ padding: 14, textDecoration: 'none' }}
    >
      {job.actionNeeded && (
        <span
          aria-label="Needs attention"
          style={{
            position: 'absolute',
            top: 8,
            right: 8,
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: '#F0A500',
            boxShadow: '0 0 0 2px rgba(240,165,0,0.25)',
          }}
        />
      )}

      <div className="flex items-center gap-3">
        <div
          className="flex flex-col items-center justify-center rounded-lg"
          style={{
            width: 48,
            minHeight: 52,
            background: upcoming ? '#253D5E' : '#1F334F',
            flexShrink: 0,
            opacity: job.start_date ? 1 : 0.6,
          }}
        >
          <span
            className="text-white"
            style={{ fontSize: 20, fontWeight: 700, lineHeight: 1 }}
          >
            {dm.day}
          </span>
          <span
            style={{
              fontSize: 10,
              color: '#7A90AA',
              letterSpacing: '0.12em',
              marginTop: 2,
            }}
          >
            {dm.month}
          </span>
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <p
            className="text-white"
            style={{
              fontSize: 15,
              fontWeight: 500,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              paddingRight: job.actionNeeded ? 14 : 0,
            }}
          >
            {job.title}
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
            {clientDisplay(job.profiles)}
          </p>
          {loc && (
            <p
              style={{
                fontSize: 12,
                color: '#7A90AA',
                marginTop: 2,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {loc}
            </p>
          )}
        </div>

        <div className="flex flex-col items-end gap-1.5" style={{ flexShrink: 0 }}>
          <span
            className={bookingChipStyle}
            style={{
              display: 'inline-block',
              padding: '3px 8px',
              borderRadius: 999,
              fontSize: 10,
              fontWeight: 600,
              letterSpacing: '0.04em',
              whiteSpace: 'nowrap',
            }}
          >
            {confirmed}/{needed} confirmed
          </span>
          <span
            className={invoiceChipStyle}
            style={{
              display: 'inline-block',
              padding: '3px 8px',
              borderRadius: 999,
              fontSize: 10,
              fontWeight: 600,
              letterSpacing: '0.04em',
              whiteSpace: 'nowrap',
            }}
          >
            {invoiceLabel}
          </span>
        </div>
      </div>
    </Link>
  )
}

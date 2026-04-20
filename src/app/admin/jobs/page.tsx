import Link from 'next/link'
import { requireAdmin } from '@/lib/admin-auth'
import { StatusBadge } from '@/components/StatusBadge'
import { JobsFilterClient } from './JobsFilterClient'

export const dynamic = 'force-dynamic'

function todayIsoLA(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Los_Angeles',
  }).format(new Date())
}

function formatShort(iso: string | null): string {
  if (!iso) return ''
  const parts = iso.split('-').map(Number)
  if (parts.length !== 3 || parts.some(Number.isNaN)) return ''
  const d = new Date(parts[0], parts[1] - 1, parts[2])
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function formatRange(start: string | null, end: string | null): string {
  if (!start) return ''
  if (!end || end === start) return formatShort(start)
  // If same month, compact e.g. "23–24 Apr"
  const sParts = start.split('-').map(Number)
  const eParts = end.split('-').map(Number)
  if (
    sParts.length === 3 &&
    eParts.length === 3 &&
    sParts[0] === eParts[0] &&
    sParts[1] === eParts[1]
  ) {
    const monthAbbrev = new Date(sParts[0], sParts[1] - 1, sParts[2])
      .toLocaleString('en-US', { month: 'short' })
    return `${sParts[2]}–${eParts[2]} ${monthAbbrev}`
  }
  return `${formatShort(start)} – ${formatShort(end)}`
}

function centsToUsd(cents: number | null | undefined): string {
  if (!cents && cents !== 0) return ''
  return `$${(cents / 100).toLocaleString('en-US', { maximumFractionDigits: 0 })}`
}

type ClientJoin = {
  full_name: string | null
  client_profiles:
    | { company_name: string | null }
    | { company_name: string | null }[]
    | null
}

type Row = {
  id: string
  title: string
  status: string
  start_date: string | null
  end_date: string | null
  location: string | null
  address_city: string | null
  address_state: string | null
  day_rate_cents: number | null
  num_talent: number | null
  call_time: string | null
  created_at: string | null
  updated_at: string | null
  profiles: ClientJoin | ClientJoin[] | null
  job_bookings: Array<{ id: string; status: string }> | null
}

export default async function AdminJobsPage({
  searchParams,
}: {
  searchParams: { status?: string }
}) {
  const { supabase } = await requireAdmin()

  const { data } = await supabase
    .from('jobs')
    .select(
      `id, title, status, start_date, end_date, location,
       address_city, address_state, day_rate_cents, num_talent, call_time,
       created_at, updated_at,
       profiles!jobs_client_id_fkey (full_name,
         client_profiles (company_name)),
       job_bookings (id, status)`
    )
    .order('start_date', { ascending: false, nullsFirst: false })

  const rows = (data ?? []) as unknown as Row[]
  const today = todayIsoLA()
  const filter = searchParams.status ?? 'all'

  const shown = rows.filter((j) => {
    if (filter === 'all') return true
    if (filter === 'upcoming') {
      if (j.status === 'cancelled') return false
      return Boolean(j.start_date && j.start_date >= today)
    }
    return j.status === filter
  })

  function clientDisplay(p: ClientJoin | ClientJoin[] | null): string {
    const row = Array.isArray(p) ? p[0] ?? null : p
    if (!row) return 'Unknown client'
    const cp = Array.isArray(row.client_profiles)
      ? row.client_profiles[0] ?? null
      : row.client_profiles
    return cp?.company_name || row.full_name || 'Unknown client'
  }

  return (
    <div className="px-5 pt-5 pb-6 mx-auto" style={{ maxWidth: 720 }}>
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-white" style={{ fontSize: 20, fontWeight: 600 }}>
          Jobs
        </h1>
        <Link
          href="/admin/jobs/new"
          className="rounded-lg bg-[#1E3A6B] hover:bg-[#253D8A] text-white transition-colors"
          style={{
            padding: '8px 16px',
            fontSize: 13,
            fontWeight: 500,
            textDecoration: 'none',
            letterSpacing: '0.01em',
            whiteSpace: 'nowrap',
          }}
        >
          + New job
        </Link>
      </div>

      <div className="mt-4">
        <JobsFilterClient current={filter} />
      </div>

      {shown.length === 0 ? (
        <div
          className="mt-4 rounded-xl bg-[#1A2E4A] border border-white/5"
          style={{ padding: '22px 20px' }}
        >
          <p className="text-center" style={{ fontSize: 13, color: '#7A90AA' }}>
            No {filter === 'all' ? '' : filter} jobs
          </p>
        </div>
      ) : (
        <div className="mt-4 flex flex-col gap-2.5">
          {shown.map((j) => {
            const bookings = Array.isArray(j.job_bookings) ? j.job_bookings : []
            const confirmedCount = bookings.filter(
              (b) => b.status === 'confirmed'
            ).length
            const numNeeded = j.num_talent ?? null
            const fullyCrewed =
              numNeeded != null && confirmedCount >= numNeeded && numNeeded > 0
            const inProgress = j.status !== 'wrapped' && j.status !== 'cancelled'
            const showDot = numNeeded != null || confirmedCount > 0
            const dotColor = fullyCrewed
              ? '#4ADE80'
              : inProgress
              ? '#F0A500'
              : null
            const loc =
              [j.address_city, j.address_state].filter(Boolean).join(', ') ||
              j.location ||
              ''
            const range = formatRange(j.start_date, j.end_date)

            return (
              <Link
                key={j.id}
                href={`/admin/jobs/${j.id}`}
                className="block rounded-xl bg-[#1A2E4A] border border-white/5 hover:border-white/10 transition-colors"
                style={{ padding: 16, textDecoration: 'none' }}
              >
                {/* Row 1: title + status badge */}
                <div className="flex items-center justify-between gap-3">
                  <p
                    className="text-white"
                    style={{
                      fontSize: 15,
                      fontWeight: 500,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      flex: 1,
                      minWidth: 0,
                    }}
                  >
                    {j.title}
                  </p>
                  <StatusBadge status={j.status} size="sm" />
                </div>

                {/* Row 2: client + date */}
                <div className="flex items-center gap-2 mt-1.5">
                  <span
                    style={{
                      fontSize: 13,
                      color: '#AABDE0',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      flex: 1,
                      minWidth: 0,
                    }}
                  >
                    {clientDisplay(j.profiles)}
                  </span>
                  {range && (
                    <>
                      <span style={{ color: '#7A90AA', fontSize: 12 }}>·</span>
                      <span
                        style={{
                          fontSize: 12,
                          color: '#7A90AA',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {range}
                      </span>
                    </>
                  )}
                </div>

                {/* Row 3: location + talent count + day rate */}
                <div className="flex items-center justify-between gap-3 mt-2">
                  <span
                    style={{
                      fontSize: 12,
                      color: '#7A90AA',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      maxWidth: '60%',
                    }}
                  >
                    {loc || '—'}
                  </span>
                  <div
                    className="flex items-center gap-3"
                    style={{ flexShrink: 0 }}
                  >
                    {showDot && (
                      <span className="flex items-center gap-1.5">
                        {dotColor && (
                          <span
                            aria-hidden
                            style={{
                              display: 'inline-block',
                              width: 6,
                              height: 6,
                              borderRadius: 999,
                              background: dotColor,
                              flexShrink: 0,
                            }}
                          />
                        )}
                        <span style={{ fontSize: 12, color: '#AABDE0' }}>
                          {confirmedCount}/{numNeeded ?? '?'} talent
                        </span>
                      </span>
                    )}
                    {j.day_rate_cents != null && (
                      <span style={{ fontSize: 12, color: '#AABDE0' }}>
                        {centsToUsd(j.day_rate_cents)}/day
                      </span>
                    )}
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

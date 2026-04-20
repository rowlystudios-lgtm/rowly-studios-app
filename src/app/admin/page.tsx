import Link from 'next/link'
import type { Metadata } from 'next'
import { requireAdmin, centsToUsd } from '@/lib/admin-auth'
import { StatusBadge } from '@/components/StatusBadge'
import { DashboardRefreshButton } from '@/components/DashboardRefreshButton'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Dashboard — RS Admin',
}

/** Today (YYYY-MM-DD) in LA time, independent of server TZ. */
function laToday(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Los_Angeles',
  }).format(new Date())
}

/** Hour 0–23 in LA time. */
function laHour(): number {
  const s = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles',
    hour: '2-digit',
    hour12: false,
  }).format(new Date())
  return parseInt(s.replace(/\D/g, ''), 10) % 24
}

function laGreeting(): string {
  const h = laHour()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

function laLongDate(): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'America/Los_Angeles',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date())
}

function daysOut(base: string, n: number): string {
  // base is YYYY-MM-DD; compute base+n days in ISO.
  const parts = base.split('-').map(Number)
  const d = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]))
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

function dateDayMonth(iso: string | null): { day: string; month: string } {
  if (!iso) return { day: '—', month: '' }
  const parts = iso.split('-').map(Number)
  if (parts.length !== 3 || parts.some(Number.isNaN)) return { day: '—', month: '' }
  const d = new Date(parts[0], parts[1] - 1, parts[2])
  const day = String(d.getDate())
  const month = d
    .toLocaleString('en-US', { month: 'short' })
    .toUpperCase()
  return { day, month }
}

function shortDate(iso: string | null): string {
  if (!iso) return ''
  const parts = iso.split('-').map(Number)
  if (parts.length !== 3 || parts.some(Number.isNaN)) return ''
  const d = new Date(parts[0], parts[1] - 1, parts[2])
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function unwrap<T>(v: T | T[] | null | undefined): T | null {
  if (v == null) return null
  return Array.isArray(v) ? v[0] ?? null : v
}

export default async function AdminDashboardPage() {
  const { supabase, profile } = await requireAdmin()
  const firstName =
    profile.first_name ?? profile.full_name?.split(' ')[0] ?? 'there'

  const today = laToday()
  const thirtyOut = daysOut(today, 30)

  // ─── Query 1: counts + sums, run as parallel head-only selects ───
  const [
    verifiedTalentRes,
    verifiedClientsRes,
    pendingAppsRes,
    pendingClientsRes,
    activeJobsRes,
    outstandingInvoicesRes,
    invoiceTotalsRes,
    upcomingRes,
    recentRes,
    todaysBookingsRes,
  ] = await Promise.all([
    supabase
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .eq('role', 'talent')
      .eq('verified', true),
    supabase
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .eq('role', 'client')
      .eq('verified', true),
    supabase
      .from('talent_applications')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending'),
    supabase
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .eq('role', 'client')
      .eq('verified', false),
    supabase
      .from('jobs')
      .select('id', { count: 'exact', head: true })
      .in('status', ['crewing', 'submitted']),
    supabase
      .from('invoices')
      .select('id', { count: 'exact', head: true })
      .in('status', ['sent', 'overdue']),
    supabase
      .from('invoices')
      .select('status, total_cents')
      .in('status', ['sent', 'overdue']),
    // Query 2 — upcoming jobs, next 30 days
    supabase
      .from('jobs')
      .select(
        `id, title, status, start_date, end_date, location, call_time,
         day_rate_cents, num_talent, address_city, address_state,
         profiles!jobs_client_id_fkey (full_name,
           client_profiles (company_name))`
      )
      .gte('start_date', today)
      .lte('start_date', thirtyOut)
      .neq('status', 'cancelled')
      .order('start_date', { ascending: true })
      .limit(10),
    // Query 3 — recent activity (by updated_at desc)
    supabase
      .from('jobs')
      .select(
        `id, title, status, start_date, updated_at,
         profiles!jobs_client_id_fkey (full_name,
           client_profiles (company_name))`
      )
      .order('updated_at', { ascending: false })
      .limit(5),
    // Query 4 — today's bookings (j.start_date = today)
    supabase
      .from('job_bookings')
      .select(
        `id, status, confirmed_rate_cents,
         jobs!inner (id, title, call_time, location, start_date),
         profiles!job_bookings_talent_id_fkey (id, full_name, first_name,
           last_name, avatar_url)`
      )
      .filter('jobs.start_date', 'eq', today)
      .neq('status', 'declined')
      .neq('status', 'cancelled'),
  ])

  const verifiedTalent = verifiedTalentRes.count ?? 0
  const verifiedClients = verifiedClientsRes.count ?? 0
  const pendingApps = pendingAppsRes.count ?? 0
  const pendingClients = pendingClientsRes.count ?? 0
  const activeJobs = activeJobsRes.count ?? 0
  const outstandingInvoices = outstandingInvoicesRes.count ?? 0
  const overdueCents = (invoiceTotalsRes.data ?? [])
    .filter((r) => r.status === 'overdue')
    .reduce((s, r) => s + (r.total_cents ?? 0), 0)
  const sentCents = (invoiceTotalsRes.data ?? [])
    .filter((r) => r.status === 'sent')
    .reduce((s, r) => s + (r.total_cents ?? 0), 0)
  const totalApprovals = pendingApps + pendingClients

  type ClientJoin = {
    full_name: string | null
    client_profiles:
      | { company_name: string | null }
      | { company_name: string | null }[]
      | null
  }

  type UpcomingRow = {
    id: string
    title: string
    status: string
    start_date: string | null
    end_date: string | null
    location: string | null
    call_time: string | null
    day_rate_cents: number | null
    num_talent: number | null
    address_city: string | null
    address_state: string | null
    profiles: ClientJoin | ClientJoin[] | null
  }
  const upcoming = (upcomingRes.data ?? []) as unknown as UpcomingRow[]

  type RecentRow = {
    id: string
    title: string
    status: string
    start_date: string | null
    updated_at: string | null
    profiles: ClientJoin | ClientJoin[] | null
  }
  const recent = (recentRes.data ?? []) as unknown as RecentRow[]

  type TodayRow = {
    id: string
    status: string
    confirmed_rate_cents: number | null
    jobs:
      | {
          id: string
          title: string
          call_time: string | null
          location: string | null
          start_date: string | null
        }
      | {
          id: string
          title: string
          call_time: string | null
          location: string | null
          start_date: string | null
        }[]
      | null
    profiles:
      | {
          id: string
          full_name: string | null
          first_name: string | null
          last_name: string | null
          avatar_url: string | null
        }
      | {
          id: string
          full_name: string | null
          first_name: string | null
          last_name: string | null
          avatar_url: string | null
        }[]
      | null
  }
  const todayBookings = (todaysBookingsRes.data ?? []) as unknown as TodayRow[]
  // Sort by call_time ascending (null call_time goes last).
  todayBookings.sort((a, b) => {
    const ja = unwrap(a.jobs)
    const jb = unwrap(b.jobs)
    const ca = ja?.call_time ?? '99:99'
    const cb = jb?.call_time ?? '99:99'
    return ca.localeCompare(cb)
  })

  function clientDisplay(p: ClientJoin | ClientJoin[] | null): string {
    const row = unwrap(p)
    if (!row) return 'Unknown client'
    const cp = unwrap(row.client_profiles)
    return cp?.company_name || row.full_name || 'Unknown client'
  }

  function talentDisplay(p: TodayRow['profiles']): string {
    const row = unwrap(p)
    if (!row) return 'Talent'
    return (
      [row.first_name, row.last_name].filter(Boolean).join(' ') ||
      row.full_name ||
      'Talent'
    )
  }

  function initials(name: string): string {
    const parts = name.trim().split(/\s+/).slice(0, 2)
    return parts.map((p) => p[0]?.toUpperCase() ?? '').join('') || '?'
  }

  return (
    <div className="px-5 pt-5 pb-6 mx-auto" style={{ maxWidth: 720 }}>
      {/* Greeting */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-white" style={{ fontSize: 22, fontWeight: 600 }}>
            {laGreeting()}, {firstName}
          </h1>
          <p className="mt-1" style={{ fontSize: 13, color: '#7A90AA' }}>
            {laLongDate()}
          </p>
        </div>
        <DashboardRefreshButton />
      </div>

      {/* Alert banner */}
      {totalApprovals > 0 && (
        <Link
          href={pendingApps > 0 ? '/admin/talent' : '/admin/clients'}
          className="mt-4 flex items-center justify-between rounded-xl px-4 py-3 bg-amber-500/15 border border-amber-500/30 text-amber-300"
          style={{ textDecoration: 'none' }}
        >
          <span className="flex items-center gap-2 text-[13px] font-semibold">
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
              <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
            {totalApprovals} account{totalApprovals === 1 ? '' : 's'} waiting for approval
          </span>
          <span className="text-[13px] font-semibold">Review →</span>
        </Link>
      )}

      {/* Stat cards 2×2 */}
      <div className="mt-5 grid grid-cols-2 gap-3">
        <StatCard
          href="/admin/jobs"
          label="Active jobs"
          value={activeJobs}
          sub="crewing or submitted"
        />
        <StatCard
          href="/admin/jobs"
          label="Upcoming"
          value={upcoming.length}
          sub="next 30 days"
        />
        <StatCard
          href="/admin/finance"
          label="Invoices due"
          value={outstandingInvoices}
          sub={centsToUsd(sentCents + overdueCents)}
        />
        <StatCard
          href="/admin/talent"
          label="Talent"
          value={verifiedTalent}
          sub={`${verifiedClients} client${verifiedClients === 1 ? '' : 's'}`}
        />
      </div>

      {/* Quick action */}
      <Link
        href="/admin/jobs/new"
        className="mt-4 flex items-center justify-center rounded-xl bg-[#1E3A6B] hover:bg-[#253D8A] text-white transition-colors"
        style={{
          padding: '14px 16px',
          fontSize: 15,
          fontWeight: 500,
          textDecoration: 'none',
          letterSpacing: '0.02em',
        }}
      >
        + New job
      </Link>

      {/* Upcoming shoots */}
      <section className="mt-6">
        <SectionHeading title="Upcoming shoots" href="/admin/jobs" />
        {upcoming.length === 0 ? (
          <div
            className="mt-3 rounded-xl bg-[#1A2E4A] border border-white/5"
            style={{ padding: '22px 20px' }}
          >
            <p className="text-center" style={{ fontSize: 13, color: '#7A90AA' }}>
              No shoots in the next 30 days
            </p>
          </div>
        ) : (
          <div className="mt-3 flex flex-col gap-2.5">
            {upcoming.slice(0, 5).map((j) => {
              const dm = dateDayMonth(j.start_date)
              const loc =
                [j.address_city, j.address_state].filter(Boolean).join(', ') ||
                j.location ||
                ''
              return (
                <Link
                  key={j.id}
                  href={`/admin/jobs/${j.id}`}
                  className="block rounded-xl bg-[#1A2E4A] border border-white/5 hover:border-white/10 transition-colors"
                  style={{ padding: 14, textDecoration: 'none' }}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="flex flex-col items-center justify-center rounded-lg"
                      style={{
                        width: 48,
                        minHeight: 52,
                        background: '#253D5E',
                        flexShrink: 0,
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
                        }}
                      >
                        {j.title}
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
                        {clientDisplay(j.profiles)}
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
                      {j.call_time && (
                        <p style={{ fontSize: 12, color: '#7A90AA', marginTop: 2 }}>
                          Call: {j.call_time.slice(0, 5)}
                        </p>
                      )}
                    </div>

                    <div
                      className="flex flex-col items-end gap-2"
                      style={{ flexShrink: 0 }}
                    >
                      <StatusBadge status={j.status} size="sm" />
                      {j.day_rate_cents != null && (
                        <span
                          className="text-white"
                          style={{ fontSize: 13, fontWeight: 600 }}
                        >
                          {centsToUsd(j.day_rate_cents)}/day
                        </span>
                      )}
                    </div>
                  </div>
                </Link>
              )
            })}
            {upcoming.length > 5 && (
              <Link
                href="/admin/jobs"
                className="text-center text-amber-400 hover:text-amber-300"
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                  padding: '6px 0',
                  textDecoration: 'none',
                }}
              >
                View all {upcoming.length} →
              </Link>
            )}
          </div>
        )}
      </section>

      {/* Today's shoots */}
      {todayBookings.length > 0 && (
        <section className="mt-6">
          <h2
            className="text-white"
            style={{ fontSize: 16, fontWeight: 600, marginBottom: 10 }}
          >
            Today
          </h2>
          <div className="flex flex-col gap-2.5">
            {todayBookings.map((b) => {
              const job = unwrap(b.jobs)
              const talent = unwrap(b.profiles)
              const name = talentDisplay(b.profiles)
              return (
                <Link
                  key={b.id}
                  href={job ? `/admin/jobs/${job.id}` : '/admin/jobs'}
                  className="block rounded-xl bg-green-900/20 border border-green-500/20 hover:border-green-500/40 transition-colors"
                  style={{ padding: 14, textDecoration: 'none' }}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="flex items-center justify-center rounded-full overflow-hidden"
                      style={{
                        width: 40,
                        height: 40,
                        background: '#1E3A6B',
                        color: '#fff',
                        fontSize: 13,
                        fontWeight: 700,
                        flexShrink: 0,
                      }}
                    >
                      {talent?.avatar_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={talent.avatar_url}
                          alt=""
                          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        />
                      ) : (
                        initials(name)
                      )}
                    </div>
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
                        {name}
                      </p>
                      <p
                        style={{
                          fontSize: 13,
                          color: '#AABDE0',
                          marginTop: 1,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {job?.title ?? 'Untitled job'}
                      </p>
                      {job?.location && (
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
                          {job.location}
                        </p>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-1.5" style={{ flexShrink: 0 }}>
                      {job?.call_time && (
                        <span
                          className="text-white"
                          style={{ fontSize: 13, fontWeight: 700 }}
                        >
                          {job.call_time.slice(0, 5)}
                        </span>
                      )}
                      <StatusBadge status={b.status} size="sm" />
                    </div>
                  </div>
                </Link>
              )
            })}
          </div>
        </section>
      )}

      {/* Recent activity */}
      <section className="mt-6">
        <h2
          className="text-white"
          style={{ fontSize: 16, fontWeight: 600, marginBottom: 6 }}
        >
          Recent
        </h2>
        {recent.length === 0 ? (
          <p style={{ fontSize: 13, color: '#7A90AA', fontStyle: 'italic' }}>
            No recent activity
          </p>
        ) : (
          <div>
            {recent.map((j) => (
              <Link
                key={j.id}
                href={`/admin/jobs/${j.id}`}
                className="flex items-center gap-3 border-b border-white/5"
                style={{
                  padding: '12px 0',
                  textDecoration: 'none',
                  color: '#fff',
                }}
              >
                <StatusBadge status={j.status} size="sm" />
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
                      color: '#7A90AA',
                      marginTop: 1,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {clientDisplay(j.profiles)}
                  </p>
                </div>
                <span
                  style={{
                    fontSize: 12,
                    color: '#7A90AA',
                    flexShrink: 0,
                  }}
                >
                  {shortDate(j.updated_at ?? j.start_date ?? null)}
                </span>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

function StatCard({
  href,
  label,
  value,
  sub,
}: {
  href: string
  label: string
  value: number | string
  sub: string
}) {
  return (
    <Link
      href={href}
      className="block rounded-xl bg-[#1A2E4A] border border-white/5 hover:border-white/10 transition-colors relative"
      style={{ padding: 16, textDecoration: 'none' }}
    >
      <p
        className="text-white"
        style={{ fontSize: 32, fontWeight: 700, lineHeight: 1, letterSpacing: '-0.01em' }}
      >
        {value}
      </p>
      <p
        style={{
          fontSize: 10,
          color: '#7A90AA',
          textTransform: 'uppercase',
          letterSpacing: '0.15em',
          marginTop: 8,
          fontWeight: 700,
        }}
      >
        {label}
      </p>
      <p style={{ fontSize: 12, color: '#AABDE0', marginTop: 4 }}>{sub}</p>
      <span
        aria-hidden
        style={{
          position: 'absolute',
          right: 12,
          bottom: 12,
          color: '#7A90AA',
          fontSize: 14,
          lineHeight: 1,
        }}
      >
        →
      </span>
    </Link>
  )
}

function SectionHeading({ title, href }: { title: string; href?: string }) {
  return (
    <div className="flex items-center justify-between">
      <h2
        className="text-white"
        style={{ fontSize: 16, fontWeight: 600 }}
      >
        {title}
      </h2>
      {href && (
        <Link
          href={href}
          className="text-amber-400 hover:text-amber-300"
          style={{
            fontSize: 12,
            fontWeight: 600,
            letterSpacing: '0.04em',
            textDecoration: 'none',
          }}
        >
          See all →
        </Link>
      )}
    </div>
  )
}

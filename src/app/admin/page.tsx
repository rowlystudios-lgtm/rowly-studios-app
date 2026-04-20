import Link from 'next/link'
import {
  requireAdmin,
  centsToUsd,
  formatDate,
  formatDateShort,
  greeting,
  jobStatusStyle,
  todayIso,
} from '@/lib/admin-auth'

export const dynamic = 'force-dynamic'

type StatCardProps = {
  label: string
  value: string | number
  href?: string
  tone?: 'default' | 'amber'
}

function StatCard({ label, value, href, tone = 'default' }: StatCardProps) {
  const content = (
    <div
      style={{
        background: '#1A2E4A',
        border: '1px solid rgba(170,189,224,0.15)',
        borderRadius: 14,
        padding: '16px 18px',
        height: '100%',
      }}
    >
      <p
        style={{
          fontSize: 28,
          fontWeight: 700,
          color: tone === 'amber' ? '#F0A500' : '#FFFFFF',
          lineHeight: 1,
          letterSpacing: '-0.01em',
        }}
      >
        {value}
      </p>
      <p
        style={{
          fontSize: 11,
          fontWeight: 600,
          color: '#AABDE0',
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          marginTop: 10,
        }}
      >
        {label}
      </p>
    </div>
  )
  if (href) {
    return (
      <Link href={href} style={{ textDecoration: 'none', display: 'block' }}>
        {content}
      </Link>
    )
  }
  return content
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p
      style={{
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: '0.14em',
        textTransform: 'uppercase',
        color: '#7A90AA',
        marginBottom: 10,
      }}
    >
      {children}
    </p>
  )
}

export default async function AdminDashboardPage() {
  const { supabase, profile } = await requireAdmin()
  const firstName =
    profile.first_name ?? profile.full_name?.split(' ')[0] ?? 'there'
  const today = todayIso()

  const [
    pendingAppsRes,
    pendingClientsRes,
    activeJobsRes,
    outstandingInvoicesRes,
    todaysBookingsRes,
    recentJobsRes,
  ] = await Promise.all([
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
      .in('status', ['crewing', 'confirmed']),
    supabase
      .from('invoices')
      .select('total_cents, status')
      .in('status', ['sent', 'overdue']),
    supabase
      .from('job_bookings')
      .select(
        `id, status, confirmed_rate_cents,
         jobs!inner (id, title, call_time, start_date, end_date,
           shoot_days, location),
         profiles!job_bookings_talent_id_fkey (id, first_name, last_name, full_name)`
      )
      .neq('status', 'declined')
      .neq('status', 'cancelled'),
    supabase
      .from('jobs')
      .select(
        `id, title, status, start_date, end_date, created_at,
         profiles!jobs_client_id_fkey (id, first_name, last_name, full_name,
           client_profiles (company_name))`
      )
      .order('created_at', { ascending: false })
      .limit(5),
  ])

  const pendingApps = pendingAppsRes.count ?? 0
  const pendingClients = pendingClientsRes.count ?? 0
  const activeJobs = activeJobsRes.count ?? 0
  const totalApprovals = pendingApps + pendingClients
  const outstandingCents =
    (outstandingInvoicesRes.data ?? []).reduce(
      (sum, i) => sum + (i.total_cents ?? 0),
      0
    ) ?? 0

  type BookingRow = {
    id: string
    status: string
    confirmed_rate_cents: number | null
    jobs:
      | {
          id: string
          title: string
          call_time: string | null
          start_date: string | null
          end_date: string | null
          shoot_days: Array<{ date: string; call_time: string | null }> | null
          location: string | null
        }
      | {
          id: string
          title: string
          call_time: string | null
          start_date: string | null
          end_date: string | null
          shoot_days: Array<{ date: string; call_time: string | null }> | null
          location: string | null
        }[]
      | null
    profiles:
      | {
          id: string
          first_name: string | null
          last_name: string | null
          full_name: string | null
        }
      | {
          id: string
          first_name: string | null
          last_name: string | null
          full_name: string | null
        }[]
      | null
  }
  const allBookings = (todaysBookingsRes.data ?? []) as unknown as BookingRow[]

  function bookingJob(b: BookingRow) {
    return Array.isArray(b.jobs) ? b.jobs[0] ?? null : b.jobs
  }
  function bookingTalent(b: BookingRow) {
    return Array.isArray(b.profiles) ? b.profiles[0] ?? null : b.profiles
  }

  const todaysBookings = allBookings.filter((b) => {
    const job = bookingJob(b)
    if (!job) return false
    const days = Array.isArray(job.shoot_days) ? job.shoot_days : []
    if (days.some((d) => d.date === today)) return true
    if (job.start_date && job.end_date) {
      return job.start_date <= today && job.end_date >= today
    }
    return job.start_date === today
  })

  type RecentJobRow = {
    id: string
    title: string
    status: string
    start_date: string | null
    end_date: string | null
    created_at: string | null
    profiles:
      | {
          id: string
          first_name: string | null
          last_name: string | null
          full_name: string | null
          client_profiles:
            | { company_name: string | null }
            | { company_name: string | null }[]
            | null
        }
      | {
          id: string
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
  const recentJobs = (recentJobsRes.data ?? []) as unknown as RecentJobRow[]

  function clientDisplay(raw: RecentJobRow['profiles']): string {
    const row = Array.isArray(raw) ? raw[0] : raw
    if (!row) return 'Unknown client'
    const cp = Array.isArray(row.client_profiles)
      ? row.client_profiles[0]
      : row.client_profiles
    return (
      cp?.company_name ||
      [row.first_name, row.last_name].filter(Boolean).join(' ') ||
      row.full_name ||
      'Unknown client'
    )
  }

  function talentDisplay(raw: BookingRow['profiles']): string {
    const row = Array.isArray(raw) ? raw[0] : raw
    if (!row) return 'Unknown talent'
    return (
      [row.first_name, row.last_name].filter(Boolean).join(' ') ||
      row.full_name ||
      'Unknown talent'
    )
  }

  return (
    <div style={{ padding: '20px 18px', maxWidth: 640, margin: '0 auto' }}>
      <p style={{ fontSize: 22, fontWeight: 700, color: '#fff' }}>
        {greeting()}, {firstName}
      </p>
      <p style={{ fontSize: 12, color: '#AABDE0', marginTop: 4 }}>
        {new Date().toLocaleDateString('en-US', {
          weekday: 'long',
          month: 'long',
          day: 'numeric',
          year: 'numeric',
        })}
      </p>

      {totalApprovals > 0 && (
        <Link
          href={pendingApps > 0 ? '/admin/talent' : '/admin/clients'}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginTop: 16,
            padding: '12px 14px',
            borderRadius: 12,
            background: 'rgba(240,165,0,0.15)',
            border: '1px solid rgba(240,165,0,0.35)',
            color: '#F0A500',
            textDecoration: 'none',
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          <span>
            ⚠ {totalApprovals} account{totalApprovals === 1 ? '' : 's'} need approval
          </span>
          <span>→</span>
        </Link>
      )}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 10,
          marginTop: 16,
        }}
      >
        <StatCard label="Active jobs" value={activeJobs} href="/admin/jobs" />
        <StatCard
          label="Today's shoots"
          value={todaysBookings.length}
          href="/admin/jobs"
        />
        <StatCard
          label="Outstanding"
          value={centsToUsd(outstandingCents)}
          href="/admin/finance"
        />
        <StatCard
          label="Pending approvals"
          value={totalApprovals}
          href="/admin/talent"
          tone={totalApprovals > 0 ? 'amber' : 'default'}
        />
      </div>

      {/* ─── Today ─── */}
      <div style={{ marginTop: 24 }}>
        <SectionLabel>Today</SectionLabel>
        {todaysBookings.length === 0 ? (
          <p style={{ fontSize: 13, color: '#7A90AA', fontStyle: 'italic' }}>
            No shoots today
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {todaysBookings.map((b) => {
              const job = bookingJob(b)
              return (
              <Link
                key={b.id}
                href={job?.id ? `/admin/jobs/${job.id}` : '/admin/jobs'}
                style={{
                  background: '#1A2E4A',
                  border: '1px solid rgba(170,189,224,0.15)',
                  borderRadius: 12,
                  padding: '12px 14px',
                  textDecoration: 'none',
                  color: '#fff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 10,
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p
                    style={{
                      fontSize: 13,
                      fontWeight: 600,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {job?.title ?? 'Untitled job'}
                  </p>
                  <p style={{ fontSize: 11, color: '#AABDE0', marginTop: 2 }}>
                    {talentDisplay(b.profiles)}
                  </p>
                </div>
                {job?.call_time && (
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      color: '#F0A500',
                      letterSpacing: '0.04em',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {job.call_time.slice(0, 5)}
                  </span>
                )}
              </Link>
              )
            })}
          </div>
        )}
      </div>

      {/* ─── Recent jobs ─── */}
      <div style={{ marginTop: 24 }}>
        <SectionLabel>Recent jobs</SectionLabel>
        {recentJobs.length === 0 ? (
          <p style={{ fontSize: 13, color: '#7A90AA', fontStyle: 'italic' }}>
            No jobs yet
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {recentJobs.map((j) => {
              const s = jobStatusStyle(j.status)
              return (
                <Link
                  key={j.id}
                  href={`/admin/jobs/${j.id}`}
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
                    <p
                      style={{
                        fontSize: 13,
                        fontWeight: 600,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {j.title}
                    </p>
                    <p style={{ fontSize: 11, color: '#AABDE0', marginTop: 2 }}>
                      {clientDisplay(j.profiles)}
                      {j.start_date && ` · ${formatDateShort(j.start_date)}`}
                    </p>
                  </div>
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
                      whiteSpace: 'nowrap',
                      flexShrink: 0,
                    }}
                  >
                    {s.label}
                  </span>
                </Link>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

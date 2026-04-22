import Link from 'next/link'
import type { Metadata } from 'next'
import { requireAdmin, centsToUsd } from '@/lib/admin-auth'
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

function dateDayMonth(iso: string | null): { day: string; month: string } {
  if (!iso) return { day: '—', month: '' }
  const parts = iso.split('-').map(Number)
  if (parts.length !== 3 || parts.some(Number.isNaN)) return { day: '—', month: '' }
  const d = new Date(parts[0], parts[1] - 1, parts[2])
  const day = String(d.getDate())
  const month = d.toLocaleString('en-US', { month: 'short' }).toUpperCase()
  return { day, month }
}

function relativeTime(iso: string | null): string {
  if (!iso) return ''
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return ''
  const diffSec = Math.max(0, Math.floor((Date.now() - then) / 1000))
  if (diffSec < 60) return 'just now'
  const diffMin = Math.floor(diffSec / 60)
  if (diffMin < 60) return `${diffMin}m ago`
  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24) return `${diffHr}h ago`
  const diffDay = Math.floor(diffHr / 24)
  return `${diffDay}d ago`
}

function unwrap<T>(v: T | T[] | null | undefined): T | null {
  if (v == null) return null
  return Array.isArray(v) ? (v[0] ?? null) : v
}

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
  num_talent: number | null
  profiles: ClientJoin | ClientJoin[] | null
}

type NotificationRow = {
  id: string
  type: string
  title: string
  body: string | null
  action_url: string | null
  link: string | null
  created_at: string
  priority: string
  user_id: string
}

type InvoiceRow = {
  job_id: string | null
  status: string
}

function clientDisplay(p: ClientJoin | ClientJoin[] | null): string {
  const row = unwrap(p)
  if (!row) return 'Unknown client'
  const cp = unwrap(row.client_profiles)
  return cp?.company_name || row.full_name || 'Unknown client'
}

export default async function AdminDashboardPage() {
  const { supabase, profile } = await requireAdmin()
  const firstName =
    profile.first_name ?? profile.full_name?.split(' ')[0] ?? 'there'

  const today = laToday()
  const fortyEightHoursAgo = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString()

  // ─── Parallel queries ───
  const [
    // Stat summary (4 chips, non-tappable)
    activeJobsRes,
    outstandingInvoicesRes,
    verifiedTalentRes,
    pendingAppsRes,
    // Action chip counts (only shown when > 0)
    offersAwaitingRes,
    readyToInvoiceRes,
    overdueInvoicesRes,
    // Next 5 upcoming jobs
    upcomingRes,
    // Activity feed — last 15 notifications from past 48hrs
    notificationsRes,
  ] = await Promise.all([
    supabase
      .from('jobs')
      .select('id', { count: 'exact', head: true })
      .in('status', ['crewing', 'submitted']),
    supabase
      .from('invoices')
      .select('status, total_cents')
      .in('status', ['sent', 'overdue']),
    supabase
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .eq('role', 'talent')
      .eq('verified', true),
    supabase
      .from('talent_applications')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending'),
    supabase
      .from('job_bookings')
      .select('id', { count: 'exact', head: true })
      .in('status', ['requested', 'negotiating']),
    supabase
      .from('invoices')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'draft'),
    supabase
      .from('invoices')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'overdue'),
    supabase
      .from('jobs')
      .select(
        `id, title, status, start_date, num_talent,
         profiles!jobs_client_id_fkey (full_name,
           client_profiles (company_name))`
      )
      .gte('start_date', today)
      .neq('status', 'cancelled')
      .order('start_date', { ascending: true })
      .limit(5),
    supabase
      .from('notifications')
      .select('id, type, title, body, action_url, link, created_at, priority, user_id')
      .gte('created_at', fortyEightHoursAgo)
      .is('cleared_at', null)
      .order('created_at', { ascending: false })
      .limit(15),
  ])

  const activeJobs = activeJobsRes.count ?? 0
  const outstandingCents = (outstandingInvoicesRes.data ?? []).reduce(
    (s, r) => s + (r.total_cents ?? 0),
    0
  )
  const verifiedTalent = verifiedTalentRes.count ?? 0
  const pendingApps = pendingAppsRes.count ?? 0
  const offersAwaiting = offersAwaitingRes.count ?? 0
  const readyToInvoice = readyToInvoiceRes.count ?? 0
  const overdueInvoices = overdueInvoicesRes.count ?? 0

  const upcoming = (upcomingRes.data ?? []) as unknown as UpcomingRow[]
  const notifications = (notificationsRes.data ?? []) as NotificationRow[]

  // ─── Booking + invoice status per upcoming job ───
  const upcomingIds = upcoming.map((j) => j.id)
  const [bookingsPerJobRes, invoicesPerJobRes] = await Promise.all([
    upcomingIds.length
      ? supabase
          .from('job_bookings')
          .select('job_id, status')
          .in('job_id', upcomingIds)
      : Promise.resolve({ data: [] as { job_id: string; status: string }[] }),
    upcomingIds.length
      ? supabase
          .from('invoices')
          .select('job_id, status')
          .in('job_id', upcomingIds)
      : Promise.resolve({ data: [] as InvoiceRow[] }),
  ])

  const confirmedByJob = new Map<string, number>()
  for (const b of bookingsPerJobRes.data ?? []) {
    if (b.status === 'confirmed' || b.status === 'completed') {
      confirmedByJob.set(b.job_id, (confirmedByJob.get(b.job_id) ?? 0) + 1)
    }
  }

  // Invoice state per job: 'paid' wins over 'sent'/'overdue' wins over 'draft' wins over none.
  const invoiceStateByJob = new Map<string, 'paid' | 'invoiced' | 'none'>()
  for (const inv of invoicesPerJobRes.data ?? []) {
    if (!inv.job_id) continue
    const cur = invoiceStateByJob.get(inv.job_id)
    if (inv.status === 'paid') {
      invoiceStateByJob.set(inv.job_id, 'paid')
    } else if (inv.status === 'sent' || inv.status === 'overdue') {
      if (cur !== 'paid') invoiceStateByJob.set(inv.job_id, 'invoiced')
    } else if (inv.status === 'draft') {
      if (!cur) invoiceStateByJob.set(inv.job_id, 'invoiced')
    }
  }

  // ─── Action chips — only rendered when count > 0 ───
  const actionChips: { label: string; count: number; href: string }[] = []
  if (pendingApps > 0)
    actionChips.push({
      label: 'Pending applications',
      count: pendingApps,
      href: '/admin/applications',
    })
  if (offersAwaiting > 0)
    actionChips.push({
      label: 'Offers awaiting response',
      count: offersAwaiting,
      href: '/admin/jobs',
    })
  if (readyToInvoice > 0)
    actionChips.push({
      label: 'Ready to invoice',
      count: readyToInvoice,
      href: '/admin/finance',
    })
  if (overdueInvoices > 0)
    actionChips.push({
      label: 'Overdue invoices',
      count: overdueInvoices,
      href: '/admin/finance',
    })

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

      {/* Today's Actions Strip — horizontal scroll of amber chips */}
      {actionChips.length > 0 && (
        <div
          className="mt-5 -mx-5 px-5"
          style={{
            overflowX: 'auto',
            overflowY: 'hidden',
            WebkitOverflowScrolling: 'touch',
          }}
        >
          <div className="flex gap-2" style={{ width: 'max-content' }}>
            {actionChips.map((c) => (
              <Link
                key={c.label}
                href={c.href}
                className="inline-flex items-center gap-2 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-300 hover:bg-amber-500/20 transition-colors"
                style={{
                  padding: '10px 14px',
                  fontSize: 13,
                  fontWeight: 600,
                  textDecoration: 'none',
                  whiteSpace: 'nowrap',
                  minHeight: 44,
                }}
              >
                <span
                  className="inline-flex items-center justify-center rounded-full bg-amber-500/30"
                  style={{
                    minWidth: 22,
                    height: 22,
                    fontSize: 12,
                    fontWeight: 700,
                    padding: '0 6px',
                  }}
                >
                  {c.count}
                </span>
                <span>{c.label}</span>
                <span aria-hidden style={{ fontSize: 14, marginLeft: 2 }}>
                  →
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Activity Feed — last 15 notifications from past 48hrs */}
      <section className="mt-6">
        <h2
          className="text-white"
          style={{ fontSize: 16, fontWeight: 600, marginBottom: 10 }}
        >
          Activity
        </h2>
        {notifications.length === 0 ? (
          <div
            className="rounded-xl bg-[#1A2E4A] border border-white/5"
            style={{ padding: '18px 16px' }}
          >
            <p className="text-center" style={{ fontSize: 13, color: '#7A90AA' }}>
              No activity in the last 48 hours
            </p>
          </div>
        ) : (
          <div className="rounded-xl bg-[#1A2E4A] border border-white/5 overflow-hidden">
            {notifications.map((n, i) => {
              const href = n.action_url || n.link || '#'
              const icon = notificationIcon(n.type)
              const dotColor = priorityColor(n.priority)
              return (
                <Link
                  key={n.id}
                  href={href}
                  className="flex items-center gap-3 hover:bg-white/5 transition-colors"
                  style={{
                    padding: '12px 14px',
                    textDecoration: 'none',
                    color: '#fff',
                    borderTop: i === 0 ? 'none' : '1px solid rgba(255,255,255,0.05)',
                  }}
                >
                  <div
                    className="flex items-center justify-center rounded-full relative"
                    style={{
                      width: 32,
                      height: 32,
                      background: '#253D5E',
                      flexShrink: 0,
                    }}
                  >
                    <span style={{ fontSize: 14 }} aria-hidden>
                      {icon}
                    </span>
                    {n.priority === 'high' || n.priority === 'urgent' ? (
                      <span
                        aria-hidden
                        style={{
                          position: 'absolute',
                          top: -1,
                          right: -1,
                          width: 8,
                          height: 8,
                          borderRadius: '50%',
                          background: dotColor,
                          border: '1.5px solid #1A2E4A',
                        }}
                      />
                    ) : null}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p
                      className="text-white"
                      style={{
                        fontSize: 13,
                        fontWeight: 500,
                        lineHeight: 1.35,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {n.title}
                    </p>
                    {n.body && (
                      <p
                        style={{
                          fontSize: 12,
                          color: '#AABDE0',
                          marginTop: 1,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {n.body}
                      </p>
                    )}
                  </div>
                  <div
                    className="flex items-center gap-2"
                    style={{ flexShrink: 0 }}
                  >
                    <span style={{ fontSize: 11, color: '#7A90AA' }}>
                      {relativeTime(n.created_at)}
                    </span>
                    <span aria-hidden style={{ color: '#7A90AA', fontSize: 14 }}>
                      →
                    </span>
                  </div>
                </Link>
              )
            })}
          </div>
        )}
      </section>

      {/* Next 5 Upcoming Jobs — condensed cards with two stacked chips */}
      <section className="mt-6">
        <div className="flex items-center justify-between">
          <h2 className="text-white" style={{ fontSize: 16, fontWeight: 600 }}>
            Next 5 upcoming
          </h2>
          <Link
            href="/admin/jobs"
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
        </div>
        {upcoming.length === 0 ? (
          <div
            className="mt-3 rounded-xl bg-[#1A2E4A] border border-white/5"
            style={{ padding: '22px 20px' }}
          >
            <p className="text-center" style={{ fontSize: 13, color: '#7A90AA' }}>
              No upcoming jobs
            </p>
          </div>
        ) : (
          <div className="mt-3 flex flex-col gap-2.5">
            {upcoming.map((j) => {
              const dm = dateDayMonth(j.start_date)
              const confirmed = confirmedByJob.get(j.id) ?? 0
              const needed = j.num_talent ?? 1
              const invState = invoiceStateByJob.get(j.id) ?? 'none'
              const invoiceLabel =
                invState === 'paid'
                  ? 'Paid'
                  : invState === 'invoiced'
                    ? 'Invoiced'
                    : 'Not invoiced'
              const invoiceChipStyle =
                invState === 'paid'
                  ? 'bg-green-900/40 text-green-300'
                  : invState === 'invoiced'
                    ? 'bg-blue-900/40 text-blue-300'
                    : 'bg-gray-800/60 text-gray-400'
              const bookingChipStyle =
                confirmed >= needed
                  ? 'bg-green-900/40 text-green-300'
                  : confirmed > 0
                    ? 'bg-amber-900/40 text-amber-300'
                    : 'bg-gray-800/60 text-gray-400'
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
                    </div>

                    <div
                      className="flex flex-col items-end gap-1.5"
                      style={{ flexShrink: 0 }}
                    >
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
            })}
          </div>
        )}
      </section>

      {/* Stat Summary Row — 4 non-tappable chips in 2x2 grid */}
      <section className="mt-6">
        <div className="admin-grid grid grid-cols-2 gap-3">
          <SummaryChip label="Active jobs" value={activeJobs} />
          <SummaryChip label="Outstanding" value={centsToUsd(outstandingCents)} />
          <SummaryChip label="Talent" value={verifiedTalent} />
          <SummaryChip label="Pending apps" value={pendingApps} />
        </div>
      </section>
    </div>
  )
}

function SummaryChip({
  label,
  value,
}: {
  label: string
  value: number | string
}) {
  return (
    <div
      className="rounded-xl bg-[#1A2E4A] border border-white/5"
      style={{ padding: 14 }}
    >
      <p
        className="text-white"
        style={{ fontSize: 22, fontWeight: 700, lineHeight: 1, letterSpacing: '-0.01em' }}
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
    </div>
  )
}

function notificationIcon(type: string): string {
  const t = type.toLowerCase()
  if (t.includes('invoice') || t.includes('payment') || t.includes('paid')) return '$'
  if (t.includes('booking') || t.includes('offer')) return '●'
  if (t.includes('application') || t.includes('signup')) return '+'
  if (t.includes('job') || t.includes('wrap') || t.includes('call_sheet')) return '▸'
  if (t.includes('restricted') || t.includes('alert') || t.includes('warning')) return '!'
  return '•'
}

function priorityColor(priority: string): string {
  if (priority === 'urgent') return '#EF4444'
  if (priority === 'high') return '#F59E0B'
  return '#7A90AA'
}

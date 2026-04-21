'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useAuth } from '@/lib/auth-context'
import { Avatar } from '@/components/Avatar'
import {
  formatCallTime,
  getMapsUrl,
  resolveShootDays,
  type ShootDay,
} from '@/lib/jobs'
import type { JobStatus } from '@/lib/job-status'
import { DEPARTMENT_LABELS, type Department } from '@/lib/types'

const CARD_BG = '#2E5099'
const CARD_BORDER = 'rgba(170,189,224,0.15)'
const SOFT_BORDER = 'rgba(170,189,224,0.1)'
const TEXT_PRIMARY = '#FFFFFF'
const TEXT_MUTED = '#AABDE0'
const LINK_COLOR = '#AABDE0'
const CONFIRMED_GREEN = '#4ade80'
const REQUESTED_AMBER = '#d4950a'

type TalentProfileMini =
  | { department: Department | null; primary_role: string | null }
  | { department: Department | null; primary_role: string | null }[]
  | null

type BookingProfile = {
  id: string
  first_name: string | null
  last_name: string | null
  avatar_url: string | null
  talent_profiles: TalentProfileMini
} | null

type BookingStatus =
  | 'requested'
  | 'admin_approved'
  | 'confirmed'
  | 'declined'
  | 'cancelled'

type JobBooking = {
  id: string
  status: BookingStatus
  confirmed_rate_cents: number | null
  offered_rate_cents: number | null
  response_deadline_at: string | null
  is_short_shoot: boolean | null
  profiles: BookingProfile | BookingProfile[] | null
}

// Client-facing booking-status copy + colours. Since the admin-approval
// step is gone, both `requested` and the legacy `admin_approved` now
// read the same to the client: the offer is in the talent's hands.
const BOOKING_STATUS_META: Record<
  BookingStatus,
  { label: string; color: string }
> = {
  requested: { label: 'Offer sent to talent', color: '#AABDE0' },
  admin_approved: { label: 'Offer sent to talent', color: '#AABDE0' },
  confirmed: { label: 'Confirmed', color: '#22c55e' },
  declined: { label: 'Declined', color: '#ef4444' },
  cancelled: { label: 'Cancelled', color: '#6b7280' },
}

function BookingStatusPill({ status }: { status: BookingStatus }) {
  const m = BOOKING_STATUS_META[status] ?? BOOKING_STATUS_META.requested
  return (
    <span
      style={{
        fontSize: 10,
        fontWeight: 700,
        padding: '3px 8px',
        borderRadius: 999,
        background: `${m.color}22`,
        color: m.color,
        border: `1px solid ${m.color}44`,
        whiteSpace: 'nowrap',
        letterSpacing: '0.04em',
        textTransform: 'uppercase',
      }}
    >
      {m.label}
    </span>
  )
}

type JobRow = {
  id: string
  title: string
  status: JobStatus
  job_code: string | null
  location: string | null
  client_notes: string | null
  description: string | null
  address_line: string | null
  address_city: string | null
  address_state: string | null
  address_zip: string | null
  shoot_days: ShootDay[] | null
  start_date: string | null
  end_date: string | null
  call_time: string | null
  crew_needed: string[] | null
  num_talent: number | null
  client_budget_cents: number | null
  total_budget_cents: number | null
  shoot_duration_hours: number | null
  created_at: string
  cancelled_at: string | null
  wrapped_at: string | null
  job_bookings: JobBooking[] | null
}

const DAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
]

function unwrap<T>(v: T | T[] | null | undefined): T | null {
  if (v == null) return null
  return Array.isArray(v) ? v[0] ?? null : v
}

function parseLocalDate(iso: string): Date | null {
  const parts = iso.split('-').map(Number)
  if (parts.length !== 3 || parts.some(Number.isNaN)) return null
  return new Date(parts[0], parts[1] - 1, parts[2])
}

function formatShootDay(date: string, call: string | null): string {
  const d = parseLocalDate(date)
  const datePart = d
    ? `${DAYS_SHORT[d.getDay()]} ${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`
    : date
  const callPart = formatCallTime(call)
  return callPart ? `${datePart}  ·  Call ${callPart}` : datePart
}

function collapsedLocation(job: JobRow): string {
  const parts = [job.address_city, job.address_state].filter(Boolean) as string[]
  return parts.join(', ') || job.location || ''
}

function collapsedDateLine(days: ShootDay[]): string {
  if (days.length === 0) return ''
  const first = days[0]
  const d = parseLocalDate(first.date)
  if (!d) return ''
  const dateStr = `${DAYS_SHORT[d.getDay()]} ${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`
  if (days.length === 1) {
    const call = formatCallTime(first.call_time)
    return call ? `${dateStr} · Call ${call}` : dateStr
  }
  const extra = days.length - 1
  return `${dateStr} + ${extra} more day${extra === 1 ? '' : 's'}`
}

function fullName(p: BookingProfile): string {
  if (!p) return 'Someone'
  return [p.first_name, p.last_name].filter(Boolean).join(' ') || 'Someone'
}

function fullMapsQuery(job: JobRow): string {
  const parts = [
    job.address_line,
    job.address_city,
    job.address_state,
    job.address_zip,
  ].filter(Boolean) as string[]
  return parts.join(', ') || job.location || ''
}

function todayLocalStr(): string {
  const t = new Date()
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`
}

function isLiveToday(job: JobRow): boolean {
  const todayStr = todayLocalStr()
  if (job.shoot_days && job.shoot_days.length > 0) {
    return job.shoot_days.some((d) => d.date === todayStr)
  }
  if (job.start_date && job.end_date) {
    return job.start_date <= todayStr && job.end_date >= todayStr
  }
  if (job.start_date) return job.start_date === todayStr
  return false
}

type StatusDotKind = JobStatus | 'live'

function getStatusDot(job: JobRow): StatusDotKind {
  if ((job.status === 'confirmed' || job.status === 'crewing') && isLiveToday(job)) {
    return 'live'
  }
  // While the job itself is still in 'crewing', surface the booking progression:
  // any booking confirmed → green, otherwise keep the amber crewing dot.
  if (job.status === 'crewing' && Array.isArray(job.job_bookings)) {
    const active = job.job_bookings.filter(
      (b) => b.status !== 'declined' && b.status !== 'cancelled'
    )
    if (active.some((b) => b.status === 'confirmed')) return 'confirmed'
  }
  return job.status
}

function StatusDot({ job }: { job: JobRow }) {
  const kind = getStatusDot(job)

  if (kind === 'live') {
    return (
      <span
        style={{
          background: '#22c55e',
          color: '#fff',
          fontSize: 9,
          fontWeight: 700,
          letterSpacing: '0.08em',
          padding: '3px 7px',
          borderRadius: 999,
          animation: 'rs-pulse 1.8s ease-in-out infinite',
          display: 'inline-block',
          lineHeight: 1,
        }}
      >
        LIVE
      </span>
    )
  }

  const base = {
    width: 16,
    height: 16,
    borderRadius: 999,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxSizing: 'border-box' as const,
  }

  if (kind === 'cancelled') {
    return (
      <span style={{ ...base, background: 'transparent', border: '2px solid #ef4444' }}>
        <svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="#ef4444" strokeWidth="1.8" strokeLinecap="round">
          <line x1="1" y1="1" x2="7" y2="7" />
          <line x1="7" y1="1" x2="1" y2="7" />
        </svg>
      </span>
    )
  }
  if (kind === 'crewing') {
    return <span style={{ ...base, background: '#d4950a', border: '2px solid #d4950a' }} />
  }
  if (kind === 'confirmed') {
    return <span style={{ ...base, background: '#22c55e', border: '2px solid #22c55e' }} />
  }
  if (kind === 'wrapped') {
    return <span style={{ ...base, background: 'rgba(170,189,224,0.3)', border: '2px solid rgba(170,189,224,0.4)' }} />
  }
  // submitted / draft — pending
  return <span style={{ ...base, background: '#1A3C6B', border: '2px solid #AABDE0' }} />
}

/**
 * A client can remove a booking while it's still open-ended — requested
 * offers the talent hasn't accepted yet, declined offers the client is
 * cleaning up, and anything on a cancelled job.
 */
function canRemove(booking: JobBooking, job: JobRow): boolean {
  if (job.status === 'cancelled') return true
  return booking.status === 'requested' || booking.status === 'declined'
}

const STATUS_ORDER: Record<JobStatus, number> = {
  submitted: 0,
  draft: 0,
  crewing: 1,
  confirmed: 2,
  cancelled: 3,
  wrapped: 4,
}

export function ClientOverview() {
  const { user, supabase } = useAuth()
  const [jobs, setJobs] = useState<JobRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [expandedJobId, setExpandedJobId] = useState<string | null>(null)
  const [completedOpen, setCompletedOpen] = useState(false)

  const load = useCallback(async () => {
    const uid = user?.id
    if (!uid) return
    const { data, error } = await supabase
      .from('jobs')
      .select(
        `id, title, status, job_code, location, client_notes, description,
         address_line, address_city, address_state, address_zip,
         shoot_days, start_date, end_date, call_time,
         crew_needed, num_talent, client_budget_cents, total_budget_cents,
         shoot_duration_hours,
         created_at,
         cancelled_at, wrapped_at,
         job_bookings (
           id, status, confirmed_rate_cents, offered_rate_cents,
           response_deadline_at, is_short_shoot,
           profiles (
             id, first_name, last_name, avatar_url,
             talent_profiles (department, primary_role)
           )
         )`
      )
      .eq('client_id', uid)
      .order('created_at', { ascending: false })

    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }
    setJobs((data ?? []) as JobRow[])
    setLoading(false)
  }, [user?.id, supabase])

  useEffect(() => {
    load()
  }, [load])

  async function deleteJob(job: JobRow): Promise<boolean> {
    const snapshot = jobs
    setJobs((js) => js.filter((j) => j.id !== job.id))
    if (expandedJobId === job.id) setExpandedJobId(null)

    const { error } = await supabase.from('jobs').delete().eq('id', job.id)
    if (error) {
      setJobs(snapshot)
      return false
    }
    return true
  }

  function toggleExpanded(id: string) {
    setExpandedJobId((prev) => (prev === id ? null : id))
  }

  const { activeJobs, completedJobs } = useMemo(() => {
    const now = new Date()
    const yesterday = new Date(now)
    yesterday.setDate(yesterday.getDate() - 1)
    const yesterdayStr = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`

    const fiveDaysAgo = new Date(now)
    fiveDaysAgo.setDate(fiveDaysAgo.getDate() - 5)

    const active: JobRow[] = []
    const completed: JobRow[] = []

    for (const j of jobs) {
      if (j.status === 'wrapped') {
        const wrappedYesterdayOrEarlier = j.wrapped_at
          ? new Date(j.wrapped_at) < yesterday
          : false
        const endOnOrBeforeYesterday = j.end_date ? j.end_date <= yesterdayStr : false
        if (wrappedYesterdayOrEarlier || endOnOrBeforeYesterday) {
          completed.push(j)
        } else {
          // Freshly wrapped today — still show up top so client can see it
          active.push(j)
        }
        continue
      }
      if (j.status === 'cancelled') {
        // Show cancelled jobs for 5 days from cancelled_at
        const stillVisible =
          !j.cancelled_at || new Date(j.cancelled_at) > fiveDaysAgo
        if (stillVisible) active.push(j)
        continue
      }
      active.push(j)
    }

    // Sort active by status group, then created_at desc within group
    active.sort((a, b) => {
      const oa = STATUS_ORDER[a.status] ?? 99
      const ob = STATUS_ORDER[b.status] ?? 99
      if (oa !== ob) return oa - ob
      return (b.created_at ?? '').localeCompare(a.created_at ?? '')
    })

    // Completed: newest wrapped first
    completed.sort((a, b) => {
      const wa = a.wrapped_at ?? a.end_date ?? a.created_at ?? ''
      const wb = b.wrapped_at ?? b.end_date ?? b.created_at ?? ''
      return wb.localeCompare(wa)
    })

    return { activeJobs: active, completedJobs: completed }
  }, [jobs])

  const hasAnything = activeJobs.length > 0 || completedJobs.length > 0
  const totalVisible = activeJobs.length + completedJobs.length

  return (
    <>
      <style>{`@keyframes rs-pulse { 0%, 100% { opacity: 1 } 50% { opacity: 0.6 } }`}</style>

      <h1 style={{ fontSize: 22, fontWeight: 600, marginBottom: 2 }}>My Jobs</h1>
      <p
        style={{
          fontSize: 12,
          color: TEXT_MUTED,
          marginBottom: 16,
        }}
      >
        {loading
          ? 'Loading…'
          : `${totalVisible} job${totalVisible === 1 ? '' : 's'}`}
      </p>

      {error && (
        <p style={{ fontSize: 13, color: '#fca5a5', marginBottom: 10 }}>{error}</p>
      )}

      {!loading && !error && activeJobs.length === 0 && (
        <div
          style={{
            background: CARD_BG,
            border: `1px solid ${CARD_BORDER}`,
            borderRadius: 14,
            padding: '22px 20px',
            textAlign: 'center',
            marginBottom: completedJobs.length > 0 ? 12 : 0,
          }}
        >
          <p style={{ fontSize: 14, marginBottom: 12 }}>No jobs posted yet.</p>
          <Link
            href="/app/post-job"
            style={{
              display: 'inline-block',
              padding: '10px 16px',
              borderRadius: 10,
              background: '#fff',
              color: '#1A3C6B',
              fontSize: 12,
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              textDecoration: 'none',
            }}
          >
            Post your first job →
          </Link>
        </div>
      )}

      {!loading &&
        !error &&
        activeJobs.map((job) => (
          <ClientJobRow
            key={job.id}
            job={job}
            expanded={expandedJobId === job.id}
            onToggle={() => toggleExpanded(job.id)}
            onDelete={() => deleteJob(job)}
            onRefresh={load}
            muted={job.status === 'cancelled'}
          />
        ))}

      {!loading && !error && completedJobs.length > 0 && (
        <div style={{ marginTop: activeJobs.length > 0 ? 16 : 0 }}>
          <button
            type="button"
            onClick={() => setCompletedOpen((v) => !v)}
            aria-expanded={completedOpen}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '12px 16px',
              background: 'rgba(170,189,224,0.08)',
              border: '1px solid rgba(170,189,224,0.12)',
              borderRadius: 10,
              color: TEXT_PRIMARY,
              cursor: 'pointer',
              marginBottom: 10,
            }}
          >
            <span
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                fontSize: 13,
                fontWeight: 600,
              }}
            >
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{
                  color: TEXT_MUTED,
                  transform: completedOpen ? 'rotate(90deg)' : 'rotate(0deg)',
                  transition: 'transform 150ms ease',
                }}
                aria-hidden
              >
                <polyline points="9 6 15 12 9 18" />
              </svg>
              Completed
            </span>
            <span style={{ fontSize: 12, color: TEXT_MUTED }}>
              {completedJobs.length} job{completedJobs.length === 1 ? '' : 's'}
            </span>
          </button>

          {completedOpen &&
            completedJobs.map((job) => (
              <ClientJobRow
                key={job.id}
                job={job}
                expanded={expandedJobId === job.id}
                onToggle={() => toggleExpanded(job.id)}
                onDelete={() => deleteJob(job)}
                onRefresh={load}
                muted
              />
            ))}
        </div>
      )}

      {/* Fallback when nothing at all (no active, no completed) — covered by empty state above already */}
      {!loading && !error && !hasAnything && null}
    </>
  )
}

function ClientJobRow({
  job,
  expanded,
  onToggle,
  onDelete,
  onRefresh,
  muted,
}: {
  job: JobRow
  expanded: boolean
  onToggle: () => void
  onDelete: () => Promise<boolean>
  onRefresh: () => void | Promise<void>
  muted?: boolean
}) {
  const { supabase } = useAuth()
  const [confirming, setConfirming] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState('')
  const [removingId, setRemovingId] = useState<string | null>(null)
  const [removeError, setRemoveError] = useState('')

  useEffect(() => {
    if (!expanded) {
      setConfirming(false)
      setDeleteError('')
      setRemoveError('')
    }
  }, [expanded])

  const locationSubtitle = collapsedLocation(job)
  const shootDays = resolveShootDays(job)
  // Keep declined rows visible so the client sees who bowed out and can
  // jump to finding a replacement via the inline CTA. Only cancelled
  // bookings are filtered out.
  const bookings = (job.job_bookings ?? []).filter(
    (b) => b.status !== 'cancelled'
  )

  const onSet: JobBooking[] = []
  const post: JobBooking[] = []
  for (const b of bookings) {
    const p = unwrap(b.profiles)
    const tp = unwrap(p?.talent_profiles)
    if (tp?.department === 'post') post.push(b)
    else onSet.push(b)
  }

  const hasLockedCrew =
    job.status !== 'cancelled' &&
    bookings.some(
      (b) => b.status === 'admin_approved' || b.status === 'confirmed'
    )

  async function handleDeleteConfirmed() {
    if (deleting) return
    setDeleting(true)
    setDeleteError('')
    const ok = await onDelete()
    if (!ok) {
      setDeleteError('Could not delete job.')
      setDeleting(false)
      setConfirming(false)
    }
  }

  async function handleRemoveBooking(bookingId: string) {
    if (removingId) return
    setRemovingId(bookingId)
    setRemoveError('')

    const { error } = await supabase
      .from('job_bookings')
      .delete()
      .eq('id', bookingId)

    if (error) {
      setRemoveError(`Could not remove — ${error.message}`)
      setRemovingId(null)
      return
    }

    await onRefresh()
    setRemovingId(null)
  }

  return (
    <article
      style={{
        background: CARD_BG,
        border: `1px solid ${CARD_BORDER}`,
        borderRadius: 12,
        marginBottom: 10,
        overflow: 'hidden',
        opacity: muted ? 0.6 : 1,
      }}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        style={{
          display: 'block',
          width: '100%',
          textAlign: 'left',
          padding: '14px 16px',
          background: 'transparent',
          border: 'none',
          color: TEXT_PRIMARY,
          cursor: 'pointer',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
          }}
        >
          <h3
            style={{
              flex: 1,
              minWidth: 0,
              fontSize: 15,
              fontWeight: 600,
              color: TEXT_PRIMARY,
              lineHeight: 1.25,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {job.title}
          </h3>
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 3,
              flexShrink: 0,
            }}
          >
            <span
              style={{
                fontSize: 9,
                fontWeight: 600,
                color: TEXT_MUTED,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
              }}
            >
              Status
            </span>
            <StatusDot job={job} />
          </div>
          <ChevronIcon expanded={expanded} />
        </div>
        {job.job_code && (
          <p
            style={{
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
              fontSize: 10,
              color: 'rgba(170,189,224,0.55)',
              marginTop: 4,
              letterSpacing: '0.04em',
            }}
          >
            Ref: {job.job_code}
          </p>
        )}
        {locationSubtitle && (
          <p
            style={{
              fontSize: 12,
              color: TEXT_MUTED,
              marginTop: 6,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {locationSubtitle}
          </p>
        )}
        {shootDays.length > 0 && (
          <p
            style={{
              fontSize: 12,
              color: TEXT_MUTED,
              marginTop: 3,
              display: 'flex',
              alignItems: 'center',
              gap: 5,
            }}
          >
            <svg
              width="11"
              height="11"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              aria-hidden
            >
              <rect x="3" y="5" width="18" height="16" rx="2" />
              <path d="M3 10h18M8 3v4M16 3v4" />
            </svg>
            {collapsedDateLine(shootDays)}
          </p>
        )}
        <CrewProgressStrip job={job} />
      </button>

      {expanded && (
        <div
          style={{
            padding: '4px 16px 16px',
            display: 'flex',
            flexDirection: 'column',
            gap: 14,
          }}
        >
          {shootDays.length > 0 && (
            <ExpandedSection label="Date & time" divider>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {shootDays.map((d, i) => (
                  <div
                    key={`${d.date}-${i}`}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}
                  >
                    <CalendarGlyph />
                    <span>{formatShootDay(d.date, d.call_time)}</span>
                  </div>
                ))}
              </div>
            </ExpandedSection>
          )}

          {/* Total budget — single source of truth, client editable. */}
          <ExpandedSection label="Total budget" divider>
            <TotalBudgetCard job={job} onRefresh={onRefresh} />
          </ExpandedSection>

          <ExpandedSection label="Full address" divider>
            <AddressBlock job={job} />
          </ExpandedSection>

          <ExpandedSection label="Assigned crew" divider>
            {bookings.length === 0 ? (
              <p style={{ fontSize: 12, color: TEXT_MUTED, fontStyle: 'italic' }}>
                Crew being assigned by Rowly Studios
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {onSet.length > 0 && (
                  <CrewGroup
                    title="On-set crew"
                    bookings={onSet}
                    job={job}
                    removingId={removingId}
                    onRemove={handleRemoveBooking}
                  />
                )}
                {post.length > 0 && (
                  <CrewGroup
                    title="Post-production"
                    bookings={post}
                    job={job}
                    removingId={removingId}
                    onRemove={handleRemoveBooking}
                  />
                )}
                {hasLockedCrew && (
                  <p
                    style={{
                      fontSize: 10,
                      color: 'rgba(170,189,224,0.5)',
                      marginTop: 2,
                      fontStyle: 'italic',
                    }}
                  >
                    Confirmed crew cannot be removed. Contact Rowly Studios to make changes.
                  </p>
                )}
                {removeError && (
                  <p style={{ fontSize: 11, color: '#fca5a5', marginTop: 4 }}>
                    {removeError}
                  </p>
                )}
              </div>
            )}
          </ExpandedSection>

          {job.client_notes && (
            <ExpandedSection label="Notes" divider>
              <p
                style={{
                  fontSize: 13,
                  color: TEXT_PRIMARY,
                  lineHeight: 1.5,
                  whiteSpace: 'pre-wrap',
                }}
              >
                {job.client_notes}
              </p>
            </ExpandedSection>
          )}

          <div
            style={{
              borderTop: `1px solid ${SOFT_BORDER}`,
              paddingTop: 12,
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
            }}
          >
            {deleteError && (
              <p style={{ fontSize: 12, color: '#fca5a5' }}>{deleteError}</p>
            )}
            {confirming ? (
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  type="button"
                  onClick={() => setConfirming(false)}
                  disabled={deleting}
                  style={{
                    flex: 1,
                    padding: '10px 0',
                    borderRadius: 10,
                    background: 'rgba(255,255,255,0.08)',
                    color: TEXT_MUTED,
                    border: `1px solid ${CARD_BORDER}`,
                    fontSize: 12,
                    fontWeight: 500,
                    cursor: deleting ? 'wait' : 'pointer',
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleDeleteConfirmed}
                  disabled={deleting}
                  style={{
                    flex: 1,
                    padding: '10px 0',
                    borderRadius: 10,
                    background: '#b91c1c',
                    color: '#fff',
                    border: 'none',
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: deleting ? 'wait' : 'pointer',
                    opacity: deleting ? 0.7 : 1,
                  }}
                >
                  {deleting ? 'Deleting…' : 'Yes, delete this job'}
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <Link
                  href={`/app/roster?jobId=${job.id}`}
                  style={{
                    flex: '1 1 55%',
                    minWidth: 180,
                    padding: '10px 12px',
                    borderRadius: 10,
                    background: '#fff',
                    color: '#1A3C6B',
                    textAlign: 'center',
                    fontSize: 12,
                    fontWeight: 600,
                    textDecoration: 'none',
                  }}
                >
                  Edit crew in Roster →
                </Link>
                <button
                  type="button"
                  onClick={() => {
                    setConfirming(true)
                    setDeleteError('')
                  }}
                  style={{
                    flex: '1 1 35%',
                    minWidth: 120,
                    padding: '10px 12px',
                    borderRadius: 10,
                    background: 'transparent',
                    color: '#fca5a5',
                    border: `1px solid rgba(252,165,165,0.3)`,
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Delete job
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </article>
  )
}

function ExpandedSection({
  label,
  children,
  divider,
}: {
  label: string
  children: React.ReactNode
  divider?: boolean
}) {
  return (
    <div
      style={{
        borderTop: divider ? `1px solid ${SOFT_BORDER}` : undefined,
        paddingTop: divider ? 12 : 0,
      }}
    >
      <p
        style={{
          fontSize: 10,
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          color: TEXT_MUTED,
          marginBottom: 8,
        }}
      >
        {label}
      </p>
      {children}
    </div>
  )
}

/**
 * A single-line progress strip that tells the client where their job stands
 * with its crew — e.g. "2 of 3 talent confirmed · awaiting 1 response".
 * Rendered on the collapsed client job card so they don't have to open it
 * to see booking health. Skipped for terminal states (cancelled / wrapped).
 */
function CrewProgressStrip({ job }: { job: JobRow }) {
  if (job.cancelled_at || job.wrapped_at) return null
  const bookings = (job.job_bookings ?? []).filter(
    (b) => b.status !== 'cancelled'
  )
  if (bookings.length === 0) return null

  const total = job.num_talent ?? bookings.length
  const confirmed = bookings.filter((b) => b.status === 'confirmed').length
  const pending = bookings.filter(
    (b) => b.status === 'requested' || b.status === 'admin_approved'
  ).length
  const declined = bookings.filter((b) => b.status === 'declined').length
  const overdue = bookings.some((b) => {
    if (b.status !== 'requested' && b.status !== 'admin_approved') return false
    if (!b.response_deadline_at) return false
    return new Date(b.response_deadline_at).getTime() < Date.now()
  })

  // Pick the right tone + message: green when complete, amber when waiting
  // (red if any response is overdue), blue-grey otherwise.
  let tone: 'green' | 'amber' | 'red' | 'muted' = 'muted'
  if (confirmed >= total && total > 0) tone = 'green'
  else if (overdue) tone = 'red'
  else if (pending > 0) tone = 'amber'

  const colorMap = {
    green: { bg: 'rgba(74,222,128,0.12)', fg: '#4ade80', border: 'rgba(74,222,128,0.3)' },
    amber: { bg: 'rgba(240,165,0,0.12)', fg: '#F0A500', border: 'rgba(240,165,0,0.35)' },
    red: { bg: 'rgba(239,68,68,0.12)', fg: '#F87171', border: 'rgba(239,68,68,0.35)' },
    muted: { bg: 'rgba(170,189,224,0.08)', fg: '#AABDE0', border: 'rgba(170,189,224,0.2)' },
  } as const
  const c = colorMap[tone]

  const parts: string[] = []
  parts.push(`${confirmed} of ${total} confirmed`)
  if (pending > 0) parts.push(`${pending} awaiting response`)
  if (declined > 0) parts.push(`${declined} declined`)

  return (
    <div
      style={{
        marginTop: 8,
        padding: '6px 10px',
        borderRadius: 8,
        background: c.bg,
        border: `1px solid ${c.border}`,
        color: c.fg,
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: '0.02em',
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
      }}
    >
      <span style={{ fontSize: 11 }}>
        {tone === 'green' ? '✓' : tone === 'red' ? '⚠' : tone === 'amber' ? '⏳' : '•'}
      </span>
      <span>{parts.join(' · ')}</span>
      {overdue && (
        <span style={{ color: '#F87171', marginLeft: 4 }}>Overdue</span>
      )}
    </div>
  )
}

/**
 * Working-budget card shown inside the expanded client job view. Shows
 * the headline per-person budget with an inline edit flow. If shoot days
 * carry mixed budgets, each day is listed individually below the header.
 */
/**
 * Total-budget card — single section, no "per person" copy, no per-day
 * breakdown. Reads total_budget_cents first and falls back to
 * client_budget_cents; saves through updateClientJobBudget which writes
 * both columns in lockstep.
 */
function TotalBudgetCard({
  job,
  onRefresh,
}: {
  job: JobRow
  onRefresh: () => void | Promise<void>
}) {
  const displayCents =
    job.total_budget_cents ?? job.client_budget_cents
  const startDollars = displayCents
    ? String(Math.round(displayCents / 100))
    : ''
  const [editing, setEditing] = useState(false)
  const [dollars, setDollars] = useState(startDollars)
  const [saving, setSaving] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  const isTerminal =
    job.status === 'cancelled' ||
    job.status === 'wrapped' ||
    !!job.cancelled_at ||
    !!job.wrapped_at

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setErrorMsg('')
    if (saving) return
    const num = parseFloat(dollars)
    if (!Number.isFinite(num) || num <= 0) {
      setErrorMsg('Enter a valid amount.')
      return
    }
    setSaving(true)
    try {
      const { updateClientJobBudget } = await import('@/app/actions/jobs')
      const fd = new FormData()
      fd.set('jobId', job.id)
      fd.set('budget', String(num))
      const result = await updateClientJobBudget(fd)
      if (result?.error) {
        setErrorMsg(result.error)
        return
      }
      setEditing(false)
      await onRefresh()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      style={{
        background: 'rgba(255,255,255,0.08)',
        border: `1px solid ${SOFT_BORDER}`,
        borderRadius: 10,
        padding: 12,
      }}
    >
      {!editing ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            {displayCents != null ? (
              <p
                style={{
                  fontSize: 20,
                  fontWeight: 700,
                  color: TEXT_PRIMARY,
                  lineHeight: 1.1,
                }}
              >
                ${Math.round(displayCents / 100).toLocaleString()}
              </p>
            ) : (
              <p style={{ fontSize: 14, color: '#F0A500', fontWeight: 600 }}>
                No budget set
              </p>
            )}
          </div>
          {!isTerminal && (
            <button
              type="button"
              onClick={() => {
                setDollars(startDollars)
                setEditing(true)
                setErrorMsg('')
              }}
              aria-label="Edit budget"
              style={{
                flexShrink: 0,
                padding: '6px 10px',
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: '0.04em',
                background: 'rgba(255,255,255,0.1)',
                color: TEXT_PRIMARY,
                border: `1px solid ${SOFT_BORDER}`,
                borderRadius: 8,
                cursor: 'pointer',
              }}
            >
              ✎ Edit
            </button>
          )}
        </div>
      ) : (
        <form
          onSubmit={save}
          style={{ display: 'flex', flexDirection: 'column', gap: 8 }}
        >
          <label style={{ display: 'block' }}>
            <span
              style={{
                fontSize: 10,
                color: TEXT_MUTED,
                letterSpacing: '0.04em',
                textTransform: 'uppercase',
              }}
            >
              Total budget
            </span>
            <div style={{ position: 'relative', marginTop: 4 }}>
              <span
                style={{
                  position: 'absolute',
                  left: 10,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: '#888',
                  fontSize: 14,
                  pointerEvents: 'none',
                }}
              >
                $
              </span>
              <input
                autoFocus
                type="number"
                min={300}
                step={5}
                value={dollars}
                onChange={(e) => setDollars(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px 10px 10px 22px',
                  borderRadius: 8,
                  background: 'rgba(255,255,255,0.1)',
                  border: `1px solid ${SOFT_BORDER}`,
                  color: TEXT_PRIMARY,
                  fontSize: 14,
                  outline: 'none',
                }}
              />
            </div>
          </label>
          <p style={{ fontSize: 11, color: TEXT_MUTED, lineHeight: 1.4 }}>
            Total budget for this shoot day. Can be adjusted later.
          </p>
          {errorMsg && (
            <p style={{ fontSize: 11, color: '#fca5a5' }}>{errorMsg}</p>
          )}
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              type="button"
              onClick={() => {
                setEditing(false)
                setErrorMsg('')
              }}
              disabled={saving}
              style={{
                flex: 1,
                padding: '8px 10px',
                fontSize: 12,
                fontWeight: 500,
                background: 'transparent',
                color: TEXT_MUTED,
                border: `1px solid ${SOFT_BORDER}`,
                borderRadius: 8,
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              style={{
                flex: 1,
                padding: '8px 10px',
                fontSize: 12,
                fontWeight: 700,
                letterSpacing: '0.04em',
                background: '#fff',
                color: '#1A3C6B',
                border: 'none',
                borderRadius: 8,
                cursor: saving ? 'wait' : 'pointer',
                opacity: saving ? 0.6 : 1,
              }}
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </form>
      )}
    </div>
  )
}

function CrewGroup({
  title,
  bookings,
  job,
  removingId,
  onRemove,
}: {
  title: string
  bookings: JobBooking[]
  job: JobRow
  removingId: string | null
  onRemove: (bookingId: string) => void | Promise<void>
}) {
  return (
    <div>
      <p
        style={{
          fontSize: 10,
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          color: TEXT_MUTED,
          marginBottom: 6,
        }}
      >
        {title}
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {bookings.map((b) => {
          const p = unwrap(b.profiles)
          const tp = unwrap(p?.talent_profiles)
          const name = fullName(p)
          const role = tp?.primary_role ?? (tp?.department ? DEPARTMENT_LABELS[tp.department as Department] : '')
          const removable = canRemove(b, job)
          const busy = removingId === b.id
          const pending =
            b.status === 'requested' || b.status === 'admin_approved'
          const overdue =
            pending &&
            !!b.response_deadline_at &&
            new Date(b.response_deadline_at).getTime() < Date.now()
          // For confirmed rows show the confirmed rate; for everyone else
          // show the offered amount so the client always has context.
          const displayCents =
            b.status === 'confirmed'
              ? b.confirmed_rate_cents ?? b.offered_rate_cents
              : b.offered_rate_cents
          const shortShoot = Boolean(b.is_short_shoot)
          const moneyText = displayCents
            ? shortShoot
              ? `Flat fee $${Math.round(displayCents / 100).toLocaleString()}`
              : `$${Math.round(displayCents / 100).toLocaleString()}/day`
            : null
          // Spec language per status:
          //   requested  → "Offer sent" + "$X/day offered"
          //   confirmed  → "✓ Confirmed" + "$X/day"
          //   declined   → "Declined" + "Find replacement →"
          let moneyLabel: string | null = null
          if (b.status === 'confirmed') moneyLabel = moneyText
          else if (pending) {
            moneyLabel = moneyText
              ? `${moneyText} offered`
              : 'No rate set — contact Rowly Studios'
          }
          return (
            <div
              key={b.id}
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 6,
              }}
            >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                justifyContent: 'space-between',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  flex: 1,
                  minWidth: 0,
                }}
              >
                <Avatar url={p?.avatar_url ?? null} name={name} size={32} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p
                    style={{
                      fontSize: 13,
                      fontWeight: 600,
                      color: TEXT_PRIMARY,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {name}
                  </p>
                  {role && (
                    <p
                      style={{
                        fontSize: 11,
                        color: TEXT_MUTED,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {role}
                    </p>
                  )}
                </div>
                <BookingStatusPill status={b.status} />
              </div>
              {removable && (
                <button
                  type="button"
                  onClick={() => onRemove(b.id)}
                  disabled={busy}
                  aria-label={`Remove ${name}`}
                  style={{
                    flexShrink: 0,
                    background: 'transparent',
                    border: '1px solid rgba(252,165,165,0.3)',
                    borderRadius: 6,
                    color: '#fca5a5',
                    fontSize: 11,
                    fontWeight: 600,
                    padding: '4px 8px',
                    cursor: busy ? 'wait' : 'pointer',
                    opacity: busy ? 0.5 : 1,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {busy ? '…' : 'Remove'}
                </button>
              )}
            </div>
            {/* Secondary line — money + in-flight state. Declined rows
                get their own line below so the CTA has breathing room. */}
            {(moneyLabel || overdue) && b.status !== 'declined' && (
              <div
                style={{
                  marginLeft: 42, // align with the avatar + gap
                  fontSize: 11,
                  color: TEXT_MUTED,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  flexWrap: 'wrap',
                }}
              >
                {moneyLabel && <span>{moneyLabel}</span>}
                {pending && !overdue && (
                  <span style={{ color: '#d4950a' }}>Offer sent</span>
                )}
                {overdue && (
                  <span style={{ color: '#F87171', fontWeight: 600 }}>
                    24hrs passed · Rowly Studios is following up
                  </span>
                )}
              </div>
            )}

            {/* Declined row — inline CTA to deep-link into the roster so
                the client can pick a replacement without leaving their job. */}
            {b.status === 'declined' && (
              <div
                style={{
                  marginLeft: 42,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  flexWrap: 'wrap',
                  marginTop: 4,
                }}
              >
                <span
                  style={{
                    fontSize: 11,
                    color: '#fca5a5',
                    fontWeight: 600,
                  }}
                >
                  Declined this offer
                </span>
                <Link
                  href={`/app/roster?jobId=${job.id}`}
                  onClick={(e) => e.stopPropagation()}
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    color: '#AABDE0',
                    textDecoration: 'underline',
                  }}
                >
                  Add someone else →
                </Link>
              </div>
            )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function AddressBlock({ job }: { job: JobRow }) {
  const query = fullMapsQuery(job)
  const line = job.address_line ?? job.location ?? ''
  const cityLine = [
    job.address_city,
    [job.address_state, job.address_zip].filter(Boolean).join(' '),
  ]
    .filter(Boolean)
    .join(', ')

  function openMaps() {
    if (!query) return
    window.open(getMapsUrl(query), '_blank', 'noopener,noreferrer')
  }

  if (!line && !cityLine) {
    return <p style={{ fontSize: 13, color: TEXT_MUTED }}>No address set</p>
  }

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation()
        openMaps()
      }}
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 8,
        padding: 0,
        background: 'transparent',
        border: 'none',
        textAlign: 'left',
        color: TEXT_PRIMARY,
        cursor: query ? 'pointer' : 'default',
        textDecoration: query ? 'underline' : 'none',
        textUnderlineOffset: 3,
      }}
      disabled={!query}
    >
      <PinIcon />
      <span style={{ fontSize: 13, lineHeight: 1.5 }}>
        {line && <span style={{ display: 'block' }}>{line}</span>}
        {cityLine && (
          <span style={{ display: 'block', color: TEXT_MUTED }}>{cityLine}</span>
        )}
        {query && (
          <span style={{ display: 'inline-block', color: LINK_COLOR, marginTop: 2 }}>
            Open in Maps ↗
          </span>
        )}
      </span>
    </button>
  )
}

function ChevronIcon({ expanded }: { expanded: boolean }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{
        color: TEXT_MUTED,
        flexShrink: 0,
        transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
        transition: 'transform 150ms ease',
      }}
      aria-hidden
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  )
}

function CalendarGlyph() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ color: TEXT_MUTED, flexShrink: 0 }}
      aria-hidden
    >
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </svg>
  )
}

function PinIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ color: TEXT_MUTED, flexShrink: 0, marginTop: 2 }}
      aria-hidden
    >
      <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  )
}

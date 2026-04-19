'use client'

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { useAuth } from '@/lib/auth-context'
import { Avatar } from '@/components/Avatar'
import { AdminGuard } from '@/components/AdminGuard'
import {
  JobStatusBadge,
  BookingStatusBadge,
} from '@/components/StatusBadge'
import { PageShell, TEXT_MUTED, TEXT_PRIMARY } from '@/components/PageShell'
import {
  CREW_LABELS,
  summariseShootDays,
  type ShootDay,
} from '@/lib/jobs'
import type { BookingStatus, JobStatus } from '@/lib/job-status'
import { DEPARTMENT_LABELS, type Department } from '@/lib/types'

const CARD_BG = '#2E5099'
const CARD_BORDER = 'rgba(170,189,224,0.15)'
const SOFT_BORDER = 'rgba(170,189,224,0.1)'
const BUTTON_PRIMARY = '#1A3C6B'

type Segment = 'pending' | 'active' | 'completed' | 'cancelled'

type ClientMini = {
  id: string
  first_name: string | null
  last_name: string | null
  full_name: string | null
}

type JobRow = {
  id: string
  title: string
  description: string | null
  location: string | null
  start_date: string | null
  end_date: string | null
  call_time: string | null
  day_rate_cents: number | null
  num_talent: number | null
  client_notes: string | null
  admin_notes: string | null
  status: JobStatus
  client_id: string | null
  shoot_days: ShootDay[] | null
  crew_needed: string[] | null
  cancelled_at: string | null
  wrapped_at: string | null
  profiles: ClientMini | ClientMini[] | null
}

function todayLocalStr(): string {
  const t = new Date()
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`
}

function isLiveToday(job: JobRow): boolean {
  const todayStr = todayLocalStr()
  if (Array.isArray(job.shoot_days) && job.shoot_days.length > 0) {
    return job.shoot_days.some((d) => d.date === todayStr)
  }
  if (job.start_date && job.end_date) {
    return job.start_date <= todayStr && job.end_date >= todayStr
  }
  if (job.start_date) return job.start_date === todayStr
  return false
}

function formatCancelledOn(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  return `${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`
}

type TalentMini = {
  id: string
  first_name: string | null
  last_name: string | null
  full_name: string | null
  avatar_url: string | null
  available: boolean
  verified: boolean
  talent_profiles:
    | { department: Department | null; primary_role: string | null }
    | { department: Department | null; primary_role: string | null }[]
    | null
}

type BookingWithTalent = {
  id: string
  status: BookingStatus
  confirmed_rate_cents: number | null
  talent_id: string | null
  profiles: TalentMini | TalentMini[] | null
}

function unwrap<T>(v: T | T[] | null): T | null {
  if (!v) return null
  return Array.isArray(v) ? v[0] ?? null : v
}

function clientName(row: ClientMini | ClientMini[] | null): string {
  const c = unwrap(row)
  if (!c) return 'Unknown client'
  return (
    [c.first_name, c.last_name].filter(Boolean).join(' ') ||
    c.full_name ||
    'Unknown client'
  )
}

function talentName(row: TalentMini | TalentMini[] | null): string {
  const t = unwrap(row)
  if (!t) return 'Someone'
  return (
    [t.first_name, t.last_name].filter(Boolean).join(' ') ||
    t.full_name ||
    'Someone'
  )
}

function formatMoney(cents: number | null | undefined): string {
  if (!cents) return '—'
  return `$${(cents / 100).toLocaleString()}`
}

export default function AdminJobsPage() {
  return (
    <AdminGuard>
      <Suspense
        fallback={
          <PageShell>
            <p style={{ fontSize: 13, color: TEXT_MUTED }}>Loading…</p>
          </PageShell>
        }
      >
        <AdminJobsInner />
      </Suspense>
    </AdminGuard>
  )
}

function AdminJobsInner() {
  const params = useSearchParams()
  const initialFilter = params.get('filter')
  const { supabase } = useAuth()

  const [segment, setSegment] = useState<Segment>(
    initialFilter === 'active'
      ? 'active'
      : initialFilter === 'completed'
      ? 'completed'
      : initialFilter === 'cancelled'
      ? 'cancelled'
      : 'pending'
  )
  const [jobs, setJobs] = useState<JobRow[]>([])
  const [bookings, setBookings] = useState<Record<string, BookingWithTalent[]>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [actionError, setActionError] = useState('')
  const [assignSheetJob, setAssignSheetJob] = useState<JobRow | null>(null)
  const [cancelledQuery, setCancelledQuery] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    const { data, error } = await supabase
      .from('jobs')
      .select(
        `id, title, description, location, start_date, end_date, call_time,
         day_rate_cents, num_talent, client_notes, admin_notes, status, client_id,
         shoot_days, crew_needed, cancelled_at, wrapped_at,
         profiles!jobs_client_id_fkey (id, first_name, last_name, full_name)`
      )
      .order('start_date', { ascending: false, nullsFirst: false })

    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }

    const list = (data ?? []) as JobRow[]
    setJobs(list)

    // Fetch bookings for active jobs
    const activeIds = list
      .filter((j) => j.status === 'crewing' || j.status === 'confirmed')
      .map((j) => j.id)
    if (activeIds.length) {
      const { data: bks } = await supabase
        .from('job_bookings')
        .select(
          `id, status, confirmed_rate_cents, talent_id, job_id,
           profiles!job_bookings_talent_id_fkey (id, first_name, last_name, full_name,
             avatar_url, available, verified,
             talent_profiles (department, primary_role))`
        )
        .in('job_id', activeIds)
      const byJob: Record<string, BookingWithTalent[]> = {}
      for (const b of (bks ?? []) as (BookingWithTalent & { job_id: string })[]) {
        const list = byJob[b.job_id] ?? []
        list.push(b)
        byJob[b.job_id] = list
      }
      setBookings(byJob)
    } else {
      setBookings({})
    }

    setLoading(false)
  }, [supabase])

  useEffect(() => {
    load()
  }, [load])

  const filtered = useMemo(() => {
    if (segment === 'pending') return jobs.filter((j) => j.status === 'submitted')
    if (segment === 'active')
      return jobs.filter((j) => j.status === 'crewing' || j.status === 'confirmed')
    if (segment === 'completed') return jobs.filter((j) => j.status === 'wrapped')

    // cancelled — show for 6 months from cancelled_at, then filter + search
    const sixMonthsAgo = new Date()
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6)
    const q = cancelledQuery.trim().toLowerCase()
    return jobs
      .filter((j) => j.status === 'cancelled')
      .filter((j) => !j.cancelled_at || new Date(j.cancelled_at) > sixMonthsAgo)
      .filter((j) => {
        if (!q) return true
        const title = j.title?.toLowerCase() ?? ''
        const cname = clientName(j.profiles).toLowerCase()
        return title.includes(q) || cname.includes(q)
      })
      .sort((a, b) => (b.cancelled_at ?? '').localeCompare(a.cancelled_at ?? ''))
  }, [jobs, segment, cancelledQuery])

  async function reject(job: JobRow) {
    setActionError('')
    const nowIso = new Date().toISOString()
    const snapshot = jobs
    setJobs((js) =>
      js.map((j) =>
        j.id === job.id
          ? { ...j, status: 'cancelled' as JobStatus, cancelled_at: nowIso }
          : j
      )
    )
    const { error } = await supabase
      .from('jobs')
      .update({ status: 'cancelled', cancelled_at: nowIso })
      .eq('id', job.id)
    if (error) {
      setJobs(snapshot)
      setActionError(error.message)
    }
  }

  async function approve(
    job: JobRow,
    adminNotes: string,
    numTalent: number,
    adminId: string
  ) {
    setActionError('')
    const snapshot = jobs
    setJobs((js) =>
      js.map((j) =>
        j.id === job.id
          ? {
              ...j,
              status: 'crewing' as JobStatus,
              admin_notes: adminNotes || null,
              num_talent: numTalent,
            }
          : j
      )
    )
    const { error } = await supabase
      .from('jobs')
      .update({
        status: 'crewing',
        approved_by: adminId,
        approved_at: new Date().toISOString(),
        admin_notes: adminNotes || null,
        num_talent: numTalent,
      })
      .eq('id', job.id)
    if (error) {
      setJobs(snapshot)
      setActionError(error.message)
    }
  }

  async function markWrapped(job: JobRow) {
    setActionError('')
    const nowIso = new Date().toISOString()
    const snapshot = jobs
    setJobs((js) =>
      js.map((j) =>
        j.id === job.id
          ? { ...j, status: 'wrapped' as JobStatus, wrapped_at: nowIso }
          : j
      )
    )
    const { error } = await supabase
      .from('jobs')
      .update({ status: 'wrapped', wrapped_at: nowIso })
      .eq('id', job.id)
    if (error) {
      setJobs(snapshot)
      setActionError(error.message)
    }
  }

  function openAssign(job: JobRow) {
    setAssignSheetJob(job)
  }

  async function onAssigned(jobId: string, booking: BookingWithTalent) {
    setBookings((prev) => {
      const list = prev[jobId] ?? []
      return { ...prev, [jobId]: [...list, booking] }
    })
  }

  return (
    <PageShell>
      <style>{`@keyframes rs-pulse { 0%, 100% { opacity: 1 } 50% { opacity: 0.6 } }`}</style>
      <h1 style={{ fontSize: 22, fontWeight: 600, marginBottom: 12 }}>Jobs</h1>

      <div
        role="tablist"
        style={{
          display: 'inline-flex',
          padding: 3,
          background: 'rgba(255,255,255,0.08)',
          borderRadius: 999,
          marginBottom: 16,
        }}
      >
        {(['pending', 'active', 'completed', 'cancelled'] as Segment[]).map((s) => {
          const active = s === segment
          return (
            <button
              key={s}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setSegment(s)}
              style={{
                padding: '7px 14px',
                borderRadius: 999,
                fontSize: 12,
                fontWeight: 600,
                background: active ? '#fff' : 'transparent',
                color: active ? '#1A3C6B' : TEXT_MUTED,
                border: 'none',
                cursor: 'pointer',
                textTransform: 'capitalize',
              }}
            >
              {s}
            </button>
          )
        })}
      </div>

      {error && (
        <p style={{ fontSize: 13, color: '#fca5a5', marginBottom: 10 }}>{error}</p>
      )}
      {actionError && (
        <p
          style={{
            fontSize: 12,
            color: '#fca5a5',
            background: 'rgba(248,113,113,0.12)',
            border: '1px solid rgba(248,113,113,0.25)',
            borderRadius: 10,
            padding: '10px 12px',
            marginBottom: 10,
          }}
        >
          {actionError}
        </p>
      )}
      {segment === 'cancelled' && !loading && (
        <input
          type="text"
          value={cancelledQuery}
          onChange={(e) => setCancelledQuery(e.target.value)}
          placeholder="Search cancelled jobs by title or client…"
          className="rs-input"
          style={{ marginBottom: 12 }}
        />
      )}

      {loading && <p style={{ fontSize: 13, color: TEXT_MUTED }}>Loading…</p>}
      {!loading && filtered.length === 0 && (
        <p style={{ fontSize: 13, color: TEXT_MUTED }}>No jobs in this view.</p>
      )}

      {segment === 'pending' &&
        filtered.map((job) => (
          <PendingCard
            key={job.id}
            job={job}
            onReject={() => reject(job)}
            onApprove={(notes, n, adminId) => approve(job, notes, n, adminId)}
          />
        ))}

      {segment === 'active' &&
        filtered.map((job) => (
          <ActiveCard
            key={job.id}
            job={job}
            bookings={bookings[job.id] ?? []}
            onAssignOpen={() => openAssign(job)}
            onWrap={() => markWrapped(job)}
          />
        ))}

      {segment === 'completed' &&
        filtered.map((job) => (
          <CompletedCard
            key={job.id}
            job={job}
            confirmedCount={
              (bookings[job.id] ?? []).filter((b) => b.status === 'confirmed')
                .length
            }
          />
        ))}

      {segment === 'cancelled' &&
        filtered.map((job) => <CancelledCard key={job.id} job={job} />)}

      {assignSheetJob && (
        <AssignTalentSheet
          job={assignSheetJob}
          existingTalentIds={(bookings[assignSheetJob.id] ?? [])
            .map((b) => b.talent_id)
            .filter((id): id is string => id !== null)}
          onClose={() => setAssignSheetJob(null)}
          onAssigned={(booking) => onAssigned(assignSheetJob.id, booking)}
          supabase={supabase}
        />
      )}
    </PageShell>
  )
}

function PendingCard({
  job,
  onReject,
  onApprove,
}: {
  job: JobRow
  onReject: () => void | Promise<void>
  onApprove: (adminNotes: string, numTalent: number, adminId: string) => void | Promise<void>
}) {
  const { user } = useAuth()
  const [expanded, setExpanded] = useState(false)
  const [notes, setNotes] = useState(job.admin_notes ?? '')
  const [numTalent, setNumTalent] = useState<string>(
    String(job.num_talent ?? 1)
  )
  const [busy, setBusy] = useState<'approve' | 'reject' | null>(null)

  async function doReject() {
    if (busy) return
    setBusy('reject')
    await onReject()
    setBusy(null)
  }

  async function doApprove() {
    if (busy || !user?.id) return
    setBusy('approve')
    const n = Math.max(1, parseInt(numTalent, 10) || 1)
    await onApprove(notes.trim(), n, user.id)
    setBusy(null)
    setExpanded(false)
  }

  return (
    <div
      style={{
        background: CARD_BG,
        border: `1px solid ${CARD_BORDER}`,
        borderRadius: 14,
        padding: 14,
        marginBottom: 10,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 10,
        }}
      >
        <h3 style={{ flex: 1, fontSize: 15, fontWeight: 700 }}>{job.title}</h3>
        <span
          style={{
            padding: '4px 10px',
            borderRadius: 999,
            fontSize: 11,
            fontWeight: 600,
            background: 'rgba(212,149,10,0.2)',
            color: '#d4950a',
            border: '1px solid rgba(212,149,10,0.35)',
            whiteSpace: 'nowrap',
          }}
        >
          Needs review
        </span>
      </div>

      <JobDetailLines job={job} />

      {job.client_notes && (
        <div
          style={{
            marginTop: 10,
            paddingTop: 10,
            borderTop: `1px solid ${SOFT_BORDER}`,
            fontSize: 12,
            color: TEXT_MUTED,
            lineHeight: 1.5,
          }}
        >
          <Label>Client notes</Label>
          <p style={{ marginTop: 2 }}>{job.client_notes}</p>
        </div>
      )}

      {!expanded ? (
        <div
          style={{
            display: 'flex',
            gap: 8,
            marginTop: 12,
            paddingTop: 12,
            borderTop: `1px solid ${SOFT_BORDER}`,
          }}
        >
          <button
            type="button"
            onClick={doReject}
            disabled={busy !== null}
            style={{
              flex: 1,
              padding: '10px 0',
              borderRadius: 10,
              background: 'rgba(255,255,255,0.08)',
              color: TEXT_MUTED,
              border: '1px solid rgba(170,189,224,0.2)',
              fontSize: 12,
              fontWeight: 500,
              cursor: busy ? 'wait' : 'pointer',
            }}
          >
            {busy === 'reject' ? 'Rejecting…' : 'Reject'}
          </button>
          <button
            type="button"
            onClick={() => setExpanded(true)}
            disabled={busy !== null}
            style={{
              flex: 1,
              padding: '10px 0',
              borderRadius: 10,
              background: '#fff',
              color: BUTTON_PRIMARY,
              border: 'none',
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Approve
          </button>
        </div>
      ) : (
        <div
          style={{
            marginTop: 12,
            paddingTop: 12,
            borderTop: `1px solid ${SOFT_BORDER}`,
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
          }}
        >
          <label>
            <Label>Admin notes</Label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="rs-input resize-none"
              style={{ marginTop: 4 }}
              placeholder="Private notes for the crewing team (optional)"
            />
          </label>
          <label>
            <Label>Number of talent needed</Label>
            <input
              type="number"
              min={1}
              value={numTalent}
              onChange={(e) => setNumTalent(e.target.value)}
              className="rs-input"
              style={{ marginTop: 4 }}
            />
          </label>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              onClick={() => setExpanded(false)}
              style={{
                flex: 1,
                padding: '10px 0',
                borderRadius: 10,
                background: 'rgba(255,255,255,0.08)',
                color: TEXT_MUTED,
                border: '1px solid rgba(170,189,224,0.2)',
                fontSize: 12,
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={doApprove}
              disabled={busy !== null}
              style={{
                flex: 1,
                padding: '10px 0',
                borderRadius: 10,
                background: '#fff',
                color: BUTTON_PRIMARY,
                border: 'none',
                fontSize: 12,
                fontWeight: 600,
                cursor: busy ? 'wait' : 'pointer',
              }}
            >
              {busy === 'approve' ? 'Approving…' : 'Confirm approval'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function ActiveCard({
  job,
  bookings,
  onAssignOpen,
  onWrap,
}: {
  job: JobRow
  bookings: BookingWithTalent[]
  onAssignOpen: () => void
  onWrap: () => void | Promise<void>
}) {
  const [wrapping, setWrapping] = useState(false)
  const allConfirmed =
    bookings.length > 0 && bookings.every((b) => b.status === 'confirmed')

  async function doWrap() {
    if (wrapping) return
    setWrapping(true)
    await onWrap()
    setWrapping(false)
  }

  return (
    <div
      style={{
        background: CARD_BG,
        border: `1px solid ${CARD_BORDER}`,
        borderRadius: 14,
        padding: 14,
        marginBottom: 10,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 10,
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <h3 style={{ fontSize: 15, fontWeight: 700 }}>{job.title}</h3>
          <p style={{ fontSize: 11, color: TEXT_MUTED, marginTop: 2 }}>
            {clientName(job.profiles)}
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          {isLiveToday(job) && (
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
                lineHeight: 1,
              }}
            >
              LIVE
            </span>
          )}
          <JobStatusBadge status={job.status} small />
        </div>
      </div>

      <JobDetailLines job={job} />

      <div
        style={{
          marginTop: 10,
          paddingTop: 10,
          borderTop: `1px solid ${SOFT_BORDER}`,
        }}
      >
        <Label>
          Bookings ({bookings.length}
          {typeof job.num_talent === 'number' && job.num_talent > 0
            ? ` / ${job.num_talent}`
            : ''}
          )
        </Label>
        {bookings.length === 0 && (
          <p style={{ fontSize: 12, color: TEXT_MUTED, marginTop: 6 }}>
            No talent assigned yet.
          </p>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 6 }}>
          {bookings.map((b) => {
            const t = unwrap(b.profiles)
            const name = talentName(b.profiles)
            return (
              <div
                key={b.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '8px 10px',
                  background: 'rgba(255,255,255,0.05)',
                  borderRadius: 10,
                  border: `1px solid ${SOFT_BORDER}`,
                }}
              >
                <Avatar
                  url={t && !Array.isArray(t) ? t.avatar_url : null}
                  name={name}
                  size={28}
                />
                <p style={{ flex: 1, fontSize: 12, fontWeight: 600 }}>{name}</p>
                <BookingStatusBadge status={b.status} />
              </div>
            )
          })}
        </div>
      </div>

      <div
        style={{
          display: 'flex',
          gap: 8,
          marginTop: 12,
          paddingTop: 12,
          borderTop: `1px solid ${SOFT_BORDER}`,
        }}
      >
        {job.status === 'crewing' && (
          <button
            type="button"
            onClick={onAssignOpen}
            style={{
              flex: 1,
              padding: '10px 0',
              borderRadius: 10,
              background: '#fff',
              color: BUTTON_PRIMARY,
              border: 'none',
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            + Assign talent
          </button>
        )}
        {allConfirmed && (
          <button
            type="button"
            onClick={doWrap}
            disabled={wrapping}
            style={{
              flex: 1,
              padding: '10px 0',
              borderRadius: 10,
              background: 'rgba(74,222,128,0.2)',
              color: '#4ade80',
              border: '1px solid rgba(74,222,128,0.35)',
              fontSize: 12,
              fontWeight: 600,
              cursor: wrapping ? 'wait' : 'pointer',
            }}
          >
            {wrapping ? 'Marking…' : 'Mark wrapped'}
          </button>
        )}
      </div>
    </div>
  )
}

function CompletedCard({
  job,
  confirmedCount,
}: {
  job: JobRow
  confirmedCount: number
}) {
  return (
    <div
      style={{
        background: CARD_BG,
        border: `1px solid ${CARD_BORDER}`,
        borderRadius: 12,
        padding: '12px 14px',
        marginBottom: 8,
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        gap: 10,
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 13, fontWeight: 600, color: TEXT_PRIMARY }}>
          {job.title}
        </p>
        <p style={{ fontSize: 11, color: TEXT_MUTED, marginTop: 2 }}>
          {clientName(job.profiles)}
          {summariseShootDays(job) && ` · ${summariseShootDays(job).split(' · Call ')[0]}`}
          {confirmedCount > 0 && ` · ${confirmedCount} talent`}
        </p>
      </div>
      <JobStatusBadge status={job.status} small />
    </div>
  )
}

function CancelledCard({ job }: { job: JobRow }) {
  const cancelledOn = formatCancelledOn(job.cancelled_at)
  return (
    <div
      style={{
        background: CARD_BG,
        border: `1px solid ${CARD_BORDER}`,
        borderRadius: 12,
        padding: '12px 14px',
        marginBottom: 8,
        opacity: 0.85,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 10,
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: 13, fontWeight: 600, color: TEXT_PRIMARY }}>
            {job.title}
          </p>
          <p style={{ fontSize: 11, color: TEXT_MUTED, marginTop: 2 }}>
            {clientName(job.profiles)}
            {cancelledOn && ` · Cancelled on ${cancelledOn}`}
          </p>
        </div>
        <JobStatusBadge status={job.status} small />
      </div>
    </div>
  )
}

function JobDetailLines({ job }: { job: JobRow }) {
  const dateSummary = summariseShootDays(job)
  const crewLabels =
    Array.isArray(job.crew_needed) && job.crew_needed.length > 0
      ? job.crew_needed.map((k) => CREW_LABELS[k] ?? k)
      : []
  return (
    <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
      {dateSummary && (
        <p style={{ fontSize: 12, color: TEXT_PRIMARY }}>
          <span style={{ color: TEXT_MUTED }}>When: </span>
          {dateSummary}
        </p>
      )}
      {job.location && (
        <p style={{ fontSize: 12, color: TEXT_PRIMARY }}>
          <span style={{ color: TEXT_MUTED }}>Where: </span>
          {job.location}
        </p>
      )}
      {(job.day_rate_cents || typeof job.num_talent === 'number') && (
        <p style={{ fontSize: 12, color: TEXT_PRIMARY }}>
          <span style={{ color: TEXT_MUTED }}>Rate: </span>
          {formatMoney(job.day_rate_cents)} / day
          {typeof job.num_talent === 'number' && (
            <span style={{ color: TEXT_MUTED }}> · {job.num_talent} talent</span>
          )}
        </p>
      )}
      <p style={{ fontSize: 12, color: TEXT_PRIMARY }}>
        <span style={{ color: TEXT_MUTED }}>Client: </span>
        {clientName(job.profiles)}
      </p>
      {crewLabels.length > 0 && (
        <p style={{ fontSize: 12, color: TEXT_PRIMARY, lineHeight: 1.4 }}>
          <span style={{ color: TEXT_MUTED }}>Crew: </span>
          {crewLabels.join(' · ')}
        </p>
      )}
      {job.description && (
        <p
          style={{
            fontSize: 12,
            color: TEXT_PRIMARY,
            lineHeight: 1.5,
            marginTop: 4,
            whiteSpace: 'pre-wrap',
          }}
        >
          {job.description}
        </p>
      )}
    </div>
  )
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <span
      style={{
        fontSize: 10,
        fontWeight: 600,
        textTransform: 'uppercase',
        letterSpacing: '0.08em',
        color: TEXT_MUTED,
      }}
    >
      {children}
    </span>
  )
}

type AssignableTalent = {
  id: string
  first_name: string | null
  last_name: string | null
  full_name: string | null
  avatar_url: string | null
  available: boolean
  talent_profiles:
    | { department: Department | null; primary_role: string | null; day_rate_cents: number | null }
    | { department: Department | null; primary_role: string | null; day_rate_cents: number | null }[]
    | null
}

function AssignTalentSheet({
  job,
  existingTalentIds,
  onClose,
  onAssigned,
  supabase,
}: {
  job: JobRow
  existingTalentIds: string[]
  onClose: () => void
  onAssigned: (booking: BookingWithTalent) => void
  supabase: ReturnType<typeof useAuth>['supabase']
}) {
  const [talent, setTalent] = useState<AssignableTalent[]>([])
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [assigning, setAssigning] = useState<string | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    async function load() {
      const { data, error } = await supabase
        .from('profiles')
        .select(
          `id, first_name, last_name, full_name, avatar_url, available,
           talent_profiles (department, primary_role, day_rate_cents)`
        )
        .eq('role', 'talent')
        .eq('verified', true)
        .order('first_name')
      if (cancelled) return
      if (error) {
        setError(error.message)
        setLoading(false)
        return
      }
      setTalent((data ?? []) as AssignableTalent[])
      setLoading(false)
    }
    load()
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      cancelled = true
      document.body.style.overflow = prev
    }
  }, [supabase])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return talent
    return talent.filter((t) => {
      const tp = unwrap(t.talent_profiles)
      const name =
        [t.first_name, t.last_name].filter(Boolean).join(' ') ||
        t.full_name ||
        ''
      const dept = tp?.department ? DEPARTMENT_LABELS[tp.department] : ''
      const role = tp?.primary_role ?? ''
      return (
        name.toLowerCase().includes(q) ||
        dept.toLowerCase().includes(q) ||
        role.toLowerCase().includes(q)
      )
    })
  }, [talent, query])

  async function assign(t: AssignableTalent) {
    if (assigning) return
    setAssigning(t.id)
    setError('')
    const { data, error } = await supabase
      .from('job_bookings')
      .insert({
        job_id: job.id,
        talent_id: t.id,
        status: 'requested',
        confirmed_rate_cents: job.day_rate_cents,
      })
      .select(
        `id, status, confirmed_rate_cents, talent_id,
         profiles!job_bookings_talent_id_fkey (id, first_name, last_name, full_name,
           avatar_url, available, verified,
           talent_profiles (department, primary_role))`
      )
      .single()

    if (error) {
      setError(error.message)
      setAssigning(null)
      return
    }

    onAssigned(data as BookingWithTalent)
    setAssigning(null)
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 200,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex',
        alignItems: 'flex-end',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          background: '#1A3C6B',
          borderRadius: '20px 20px 0 0',
          maxHeight: '85dvh',
          overflowY: 'auto',
          paddingBottom: 'calc(40px + env(safe-area-inset-bottom))',
          color: '#fff',
        }}
      >
        <div style={{ padding: '12px 0 4px', display: 'flex', justifyContent: 'center' }}>
          <div
            style={{
              width: 36,
              height: 4,
              borderRadius: 2,
              background: 'rgba(170,189,224,0.3)',
            }}
          />
        </div>
        <div style={{ padding: '4px 16px 12px' }}>
          <h2 style={{ fontSize: 16, fontWeight: 600 }}>Assign talent</h2>
          <p style={{ fontSize: 12, color: TEXT_MUTED, marginTop: 2 }}>
            {job.title}
          </p>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name, role, or department…"
            className="rs-input"
            style={{ marginTop: 10 }}
          />
          {error && (
            <p style={{ fontSize: 12, color: '#fca5a5', marginTop: 8 }}>{error}</p>
          )}
          {loading && (
            <p style={{ fontSize: 13, color: TEXT_MUTED, marginTop: 10 }}>Loading…</p>
          )}
          {!loading && filtered.length === 0 && (
            <p style={{ fontSize: 13, color: TEXT_MUTED, marginTop: 10 }}>
              No talent matches.
            </p>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 }}>
            {filtered.map((t) => {
              const tp = unwrap(t.talent_profiles)
              const name =
                [t.first_name, t.last_name].filter(Boolean).join(' ') ||
                t.full_name ||
                'Unnamed'
              const already = existingTalentIds.includes(t.id)
              const dept = tp?.department ? DEPARTMENT_LABELS[tp.department] : ''
              const role = tp?.primary_role ?? ''
              const meta = [role, dept].filter(Boolean).join(' · ')
              const isAssigning = assigning === t.id
              return (
                <div
                  key={t.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '10px 12px',
                    background: CARD_BG,
                    border: `1px solid ${CARD_BORDER}`,
                    borderRadius: 12,
                    opacity: already ? 0.45 : 1,
                  }}
                >
                  <Avatar url={t.avatar_url} name={name} size={36} />
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
                      {name}
                    </p>
                    <p
                      style={{
                        fontSize: 11,
                        color: TEXT_MUTED,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {meta || 'Talent'}
                    </p>
                  </div>
                  <span
                    aria-hidden
                    title={t.available ? 'Available' : 'Unavailable'}
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: 999,
                      background: t.available ? '#4ade80' : 'rgba(170,189,224,0.4)',
                      flexShrink: 0,
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => assign(t)}
                    disabled={already || isAssigning}
                    style={{
                      padding: '7px 12px',
                      borderRadius: 10,
                      background: already ? 'rgba(255,255,255,0.08)' : '#fff',
                      color: already ? TEXT_MUTED : BUTTON_PRIMARY,
                      border: 'none',
                      fontSize: 11,
                      fontWeight: 600,
                      textTransform: 'uppercase',
                      letterSpacing: '0.06em',
                      cursor: already || isAssigning ? 'default' : 'pointer',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {already ? 'Assigned' : isAssigning ? 'Adding…' : 'Assign'}
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

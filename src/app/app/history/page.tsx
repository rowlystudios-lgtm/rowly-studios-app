'use client'

import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '@/lib/auth-context'

const BG = '#1A3C6B'
const TEXT_PRIMARY = '#FFFFFF'
const TEXT_MUTED = '#AABDE0'
const ROW_BORDER = 'rgba(170,189,224,0.1)'
const GROUP_DIVIDER = 'rgba(170,189,224,0.12)'
const CARD_BG = '#2E5099'
const CARD_BORDER = 'rgba(170,189,224,0.2)'

type JobRow = {
  id: string
  title: string | null
  start_date: string | null
  end_date: string | null
  status: string | null
}

type BookingRow = {
  id: string
  confirmed_rate_cents: number | null
  paid: boolean | null
  paid_at: string | null
  jobs: JobRow | JobRow[] | null
}

type Booking = {
  id: string
  confirmed_rate_cents: number
  paid: boolean
  job: JobRow
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
]

function unwrapJob(raw: JobRow | JobRow[] | null): JobRow | null {
  if (!raw) return null
  if (Array.isArray(raw)) return raw[0] ?? null
  return raw
}

function normalizeBooking(raw: BookingRow): Booking | null {
  const job = unwrapJob(raw.jobs)
  if (!job || !job.start_date) return null
  return {
    id: raw.id,
    confirmed_rate_cents: raw.confirmed_rate_cents ?? 0,
    paid: raw.paid === true,
    job,
  }
}

function parseLocalDate(iso: string): Date | null {
  const parts = iso.split('-').map(Number)
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) return null
  return new Date(parts[0], parts[1] - 1, parts[2])
}

function getQuarter(date: Date): string {
  const q = Math.floor(date.getMonth() / 3) + 1
  return `Q${q} ${date.getFullYear()}`
}

function quarterRange(q: string): { start: Date; end: Date } {
  const [quarter, year] = q.split(' ')
  const qNum = parseInt(quarter.slice(1), 10) - 1
  const y = parseInt(year, 10)
  const start = new Date(y, qNum * 3, 1)
  const end = new Date(y, qNum * 3 + 3, 0)
  return { start, end }
}

function ymd(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function prevQuarter(q: string): string {
  const [quarter, year] = q.split(' ')
  const qNum = parseInt(quarter.slice(1), 10)
  const y = parseInt(year, 10)
  if (qNum === 1) return `Q4 ${y - 1}`
  return `Q${qNum - 1} ${y}`
}

function quarterSortKey(q: string): number {
  const [quarter, year] = q.split(' ')
  const qNum = parseInt(quarter.slice(1), 10)
  const y = parseInt(year, 10)
  return y * 10 + qNum
}

function currentQuarter(): string {
  return getQuarter(new Date())
}

function formatMoney(cents: number): string {
  return `$${(cents / 100).toLocaleString()}`
}

function formatJobDate(startISO: string, endISO: string | null): string {
  const s = parseLocalDate(startISO)
  if (!s) return ''
  if (!endISO || endISO === startISO) {
    return `${DAYS[s.getDay()]} ${s.getDate()} ${MONTHS[s.getMonth()]} ${s.getFullYear()}`
  }
  const e = parseLocalDate(endISO)
  if (!e) {
    return `${DAYS[s.getDay()]} ${s.getDate()} ${MONTHS[s.getMonth()]} ${s.getFullYear()}`
  }
  const sameMonth = s.getMonth() === e.getMonth() && s.getFullYear() === e.getFullYear()
  const sameYear = s.getFullYear() === e.getFullYear()
  if (sameMonth) {
    return `${DAYS[s.getDay()]} ${s.getDate()} — ${DAYS[e.getDay()]} ${e.getDate()} ${MONTHS[e.getMonth()]} ${e.getFullYear()}`
  }
  if (sameYear) {
    return `${DAYS[s.getDay()]} ${s.getDate()} ${MONTHS[s.getMonth()]} — ${DAYS[e.getDay()]} ${e.getDate()} ${MONTHS[e.getMonth()]} ${e.getFullYear()}`
  }
  return `${DAYS[s.getDay()]} ${s.getDate()} ${MONTHS[s.getMonth()]} ${s.getFullYear()} — ${DAYS[e.getDay()]} ${e.getDate()} ${MONTHS[e.getMonth()]} ${e.getFullYear()}`
}

type QuarterGroup = { label: string; bookings: Booking[] }

function groupByQuarter(bookings: Booking[]): QuarterGroup[] {
  const map = new Map<string, Booking[]>()
  for (const b of bookings) {
    if (!b.job.start_date) continue
    const d = parseLocalDate(b.job.start_date)
    if (!d) continue
    const q = getQuarter(d)
    const list = map.get(q) ?? []
    list.push(b)
    map.set(q, list)
  }
  const keys = Array.from(map.keys()).sort(
    (a, b) => quarterSortKey(b) - quarterSortKey(a)
  )
  return keys.map((k) => ({
    label: k,
    bookings: (map.get(k) ?? []).sort((a, b) =>
      (b.job.start_date ?? '').localeCompare(a.job.start_date ?? '')
    ),
  }))
}

export default function HistoryPage() {
  const { user, supabase } = useAuth()
  const userId = user?.id ?? null

  const [loading, setLoading] = useState(true)
  const [bookings, setBookings] = useState<Booking[]>([])
  const [error, setError] = useState('')

  const [selectedPrev, setSelectedPrev] = useState('')
  const [prevLoading, setPrevLoading] = useState(false)
  const [prevBookings, setPrevBookings] = useState<Booking[]>([])
  const [prevError, setPrevError] = useState('')

  useEffect(() => {
    if (!userId) return
    let cancelled = false

    async function load() {
      setLoading(true)
      setError('')

      const { data, error } = await supabase
        .from('job_bookings')
        .select(
          `id, confirmed_rate_cents, paid, paid_at,
           jobs (id, title, start_date, end_date, status)`
        )
        .eq('talent_id', userId)
        .eq('status', 'confirmed')
        .order('jobs(start_date)', { ascending: false })

      if (cancelled) return
      if (error) {
        setError(error.message)
        setLoading(false)
        return
      }

      const raw = (data ?? []) as BookingRow[]
      const normalized = raw
        .map(normalizeBooking)
        .filter((b): b is Booking => b !== null)
        .filter((b) => b.job.status === 'wrapped')

      setBookings(normalized)
      setLoading(false)
    }

    load()
    return () => {
      cancelled = true
    }
  }, [userId, supabase])

  const groups = useMemo(() => groupByQuarter(bookings), [bookings])

  const orderedGroups = useMemo(() => {
    const cur = currentQuarter()
    const idx = groups.findIndex((g) => g.label === cur)
    if (idx <= 0) return groups
    const copy = [...groups]
    const [curGroup] = copy.splice(idx, 1)
    copy.unshift(curGroup)
    return copy
  }, [groups])

  const previousOptions = useMemo(() => {
    if (groups.length === 0) return []
    const oldestShown = groups[groups.length - 1].label
    const opts: string[] = []
    let q = prevQuarter(oldestShown)
    for (let i = 0; i < 8; i++) {
      opts.push(q)
      q = prevQuarter(q)
    }
    return opts
  }, [groups])

  async function onSelectPrev(q: string) {
    setSelectedPrev(q)
    setPrevBookings([])
    setPrevError('')
    if (!q || !userId) return

    setPrevLoading(true)
    const { start, end } = quarterRange(q)
    const { data, error } = await supabase
      .from('job_bookings')
      .select(
        `id, confirmed_rate_cents, paid, paid_at,
         jobs (id, title, start_date, end_date, status)`
      )
      .eq('talent_id', userId)
      .eq('status', 'confirmed')
      .gte('jobs.start_date', ymd(start))
      .lte('jobs.start_date', ymd(end))

    if (error) {
      setPrevError(error.message)
      setPrevLoading(false)
      return
    }

    const raw = (data ?? []) as BookingRow[]
    const normalized = raw
      .map(normalizeBooking)
      .filter((b): b is Booking => b !== null)
      .filter((b) => b.job.status === 'wrapped')
      .sort((a, b) => (b.job.start_date ?? '').localeCompare(a.job.start_date ?? ''))

    setPrevBookings(normalized)
    setPrevLoading(false)
  }

  const hasAnyJobs = bookings.length > 0

  return (
    <main
      className="rounded-t-rs-lg"
      style={{ background: BG, color: TEXT_PRIMARY, minHeight: 'calc(100dvh - 64px)' }}
    >
      <div className="max-w-md mx-auto pt-6 pb-10">
        <h1 style={{ fontSize: 18, fontWeight: 500, color: TEXT_PRIMARY, padding: '0 16px' }}>
          Job history
        </h1>

        {loading && (
          <p style={{ padding: '16px', fontSize: 13, color: TEXT_MUTED }}>Loading…</p>
        )}

        {!loading && error && (
          <p style={{ padding: '16px', fontSize: 13, color: '#fca5a5' }}>{error}</p>
        )}

        {!loading && !error && !hasAnyJobs && (
          <div style={{ padding: '0 16px', marginTop: 20 }}>
            <div
              style={{
                background: CARD_BG,
                border: `1px solid ${CARD_BORDER}`,
                borderRadius: 14,
                padding: '22px 20px',
                textAlign: 'center',
              }}
            >
              <p style={{ fontSize: 13, color: TEXT_MUTED, lineHeight: 1.5 }}>
                No completed jobs yet.
                <br />
                Your job history will appear here once a booking is wrapped.
              </p>
            </div>
          </div>
        )}

        {!loading && !error && hasAnyJobs &&
          orderedGroups.map((group, gi) => (
            <QuarterBlock
              key={group.label}
              group={group}
              isLast={gi === orderedGroups.length - 1}
            />
          ))}

        {!loading && !error && previousOptions.length > 0 && (
          <div style={{ padding: '24px 16px 0' }}>
            {selectedPrev && (
              <PreviousSection
                quarter={selectedPrev}
                loading={prevLoading}
                error={prevError}
                bookings={prevBookings}
              />
            )}
            <p
              style={{
                fontSize: 10,
                textTransform: 'uppercase',
                letterSpacing: '0.1em',
                color: TEXT_MUTED,
                fontWeight: 600,
                marginTop: 16,
                marginBottom: 8,
              }}
            >
              Previous quarters
            </p>
            <select
              value={selectedPrev}
              onChange={(e) => onSelectPrev(e.target.value)}
              style={{
                background: CARD_BG,
                border: `1px solid ${CARD_BORDER}`,
                borderRadius: 10,
                color: TEXT_PRIMARY,
                fontSize: 13,
                padding: '10px 12px',
                width: '100%',
                appearance: 'none',
              }}
            >
              <option value="">Select a quarter…</option>
              {previousOptions.map((q) => (
                <option key={q} value={q} style={{ background: CARD_BG, color: TEXT_PRIMARY }}>
                  {q}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>
    </main>
  )
}

function QuarterBlock({
  group,
  isLast,
}: {
  group: QuarterGroup
  isLast: boolean
}) {
  const isCurrent = group.label === currentQuarter()
  const total = group.bookings.reduce((n, b) => n + b.confirmed_rate_cents, 0)
  const paid = group.bookings
    .filter((b) => b.paid)
    .reduce((n, b) => n + b.confirmed_rate_cents, 0)
  const count = group.bookings.length
  const jobsNoun = count === 1 ? 'job' : 'jobs'

  return (
    <section>
      <h2
        style={{
          fontSize: 11,
          textTransform: 'uppercase',
          letterSpacing: '0.1em',
          color: TEXT_MUTED,
          fontWeight: 600,
          padding: '14px 16px 8px',
        }}
      >
        {group.label}
        {isCurrent && ' — current'}
      </h2>

      {group.bookings.map((booking, i) => (
        <JobRow
          key={booking.id}
          booking={booking}
          firstInGroup={i === 0}
        />
      ))}

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          gap: 12,
          padding: '12px 16px 0',
          fontSize: 13,
          color: TEXT_PRIMARY,
        }}
      >
        <span>
          {count} {jobsNoun} · {formatMoney(total)} earned
        </span>
        <span>{formatMoney(paid)} paid</span>
      </div>

      {!isLast && (
        <div
          style={{
            borderTop: `1px solid ${GROUP_DIVIDER}`,
            margin: '12px 16px 0',
          }}
        />
      )}
    </section>
  )
}

function JobRow({
  booking,
  firstInGroup,
}: {
  booking: Booking
  firstInGroup: boolean
}) {
  const date = formatJobDate(booking.job.start_date ?? '', booking.job.end_date)
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '11px 16px',
        borderTop: firstInGroup ? 'none' : `1px solid ${ROW_BORDER}`,
        transition: 'background 120ms ease',
      }}
      onMouseEnter={(e) => {
        ;(e.currentTarget as HTMLDivElement).style.background = 'rgba(255,255,255,0.04)'
      }}
      onMouseLeave={(e) => {
        ;(e.currentTarget as HTMLDivElement).style.background = 'transparent'
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <p
          style={{
            fontSize: 13,
            fontWeight: 700,
            color: TEXT_PRIMARY,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {booking.job.title ?? 'Untitled job'}
        </p>
        <p style={{ fontSize: 11, color: TEXT_MUTED, marginTop: 2 }}>{date}</p>
      </div>
      <PaidBadge paid={booking.paid} />
    </div>
  )
}

function PaidBadge({ paid }: { paid: boolean }) {
  if (paid) {
    return (
      <span
        style={{
          padding: '4px 10px',
          borderRadius: 999,
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: '0.04em',
          background: 'rgba(74,222,128,0.15)',
          color: '#4ade80',
          border: '1px solid rgba(74,222,128,0.25)',
          whiteSpace: 'nowrap',
        }}
      >
        Paid
      </span>
    )
  }
  return (
    <span
      style={{
        padding: '4px 10px',
        borderRadius: 999,
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: '0.04em',
        background: 'rgba(250,204,21,0.12)',
        color: '#facc15',
        border: '1px solid rgba(250,204,21,0.25)',
        whiteSpace: 'nowrap',
      }}
    >
      Awaiting payment
    </span>
  )
}

function PreviousSection({
  quarter,
  loading,
  error,
  bookings,
}: {
  quarter: string
  loading: boolean
  error: string
  bookings: Booking[]
}) {
  if (loading) {
    return (
      <div style={{ padding: '4px 0 12px' }}>
        <p style={{ fontSize: 13, color: TEXT_MUTED }}>Loading {quarter}…</p>
      </div>
    )
  }
  if (error) {
    return (
      <div style={{ padding: '4px 0 12px' }}>
        <p style={{ fontSize: 13, color: '#fca5a5' }}>{error}</p>
      </div>
    )
  }
  if (bookings.length === 0) {
    return (
      <div style={{ padding: '4px 0 12px' }}>
        <h2
          style={{
            fontSize: 11,
            textTransform: 'uppercase',
            letterSpacing: '0.1em',
            color: TEXT_MUTED,
            fontWeight: 600,
            padding: '0 0 6px',
          }}
        >
          {quarter}
        </h2>
        <p style={{ fontSize: 13, color: TEXT_MUTED }}>No jobs in this quarter.</p>
      </div>
    )
  }
  const group: QuarterGroup = { label: quarter, bookings }
  return (
    <div style={{ margin: '0 -16px 4px' }}>
      <QuarterBlock group={group} isLast />
    </div>
  )
}

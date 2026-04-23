'use client'

import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '@/lib/auth-context'

type DayState = 'booked' | 'requested' | 'unavailable' | 'available'

const BG = '#1A3C6B'
const TEXT = '#FFFFFF'
const TEXT_MUTED = '#AABDE0'

const AVAILABLE_HOVER_BG = '#f0f4ff'

const STATE_STYLE: Record<DayState, { bg: string; color: string; borderColor?: string }> = {
  available: {
    bg: '#FFFFFF',
    color: '#1A3C6B',
    borderColor: 'rgba(26,60,107,0.12)',
  },
  unavailable: { bg: '#0a1f44', color: TEXT_MUTED },
  requested: { bg: '#d4950a', color: TEXT },
  booked: { bg: '#166534', color: TEXT },
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]
const DOW = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']

function ymd(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function parseLocalDate(iso: string): Date | null {
  const parts = iso.split('-').map(Number)
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) return null
  return new Date(parts[0], parts[1] - 1, parts[2])
}

function addDays(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n)
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

type JobDateRow = {
  start_date: string | null
  end_date: string | null
  shoot_days: Array<{ date: string }> | null
}
type BookingRow = {
  status: 'requested' | 'confirmed' | 'declined'
  jobs: JobDateRow | JobDateRow[] | null
}

function unwrapJob(raw: JobDateRow | JobDateRow[] | null): JobDateRow | null {
  if (!raw) return null
  if (Array.isArray(raw)) return raw[0] ?? null
  return raw
}

export default function CalendarPage() {
  const { user, supabase } = useAuth()
  const userId = user?.id ?? null

  const [viewDate, setViewDate] = useState<Date>(() => {
    const now = new Date()
    return new Date(now.getFullYear(), now.getMonth(), 1)
  })
  const [statuses, setStatuses] = useState<Record<string, DayState>>({})
  const [loading, setLoading] = useState(true)
  const [savingDate, setSavingDate] = useState<string | null>(null)
  const [error, setError] = useState<string>('')

  const monthStart = useMemo(
    () => new Date(viewDate.getFullYear(), viewDate.getMonth(), 1),
    [viewDate]
  )
  const monthEnd = useMemo(
    () => new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 0),
    [viewDate]
  )
  const today = useMemo(() => {
    const t = new Date()
    return new Date(t.getFullYear(), t.getMonth(), t.getDate())
  }, [])

  useEffect(() => {
    if (!userId) return
    let cancelled = false

    async function load() {
      setLoading(true)
      setError('')

      const fromStr = ymd(monthStart)
      const toStr = ymd(monthEnd)

      const [unavailRes, confirmedRes, requestedRes] = await Promise.all([
        supabase
          .from('talent_unavailability')
          .select('date')
          .eq('talent_id', userId)
          .gte('date', fromStr)
          .lte('date', toStr),
        supabase
          .from('job_bookings')
          .select('status, jobs(start_date, end_date, shoot_days)')
          .eq('talent_id', userId)
          .eq('status', 'confirmed'),
        supabase
          .from('job_bookings')
          .select('status, jobs(start_date, end_date, shoot_days)')
          .eq('talent_id', userId)
          .eq('status', 'requested'),
      ])

      if (cancelled) return

      const map: Record<string, DayState> = {}

      // Apply in increasing priority: unavailable < requested < booked
      for (const row of (unavailRes.data as { date: string }[] | null) ?? []) {
        map[row.date] = 'unavailable'
      }

      const expand = (rows: BookingRow[] | null, state: 'requested' | 'booked') => {
        for (const row of rows ?? []) {
          const job = unwrapJob(row.jobs)
          if (!job) continue

          let datesToMark: Date[] = []

          // Use explicit shoot_days if available
          if (Array.isArray(job.shoot_days) && job.shoot_days.length > 0) {
            datesToMark = job.shoot_days
              .map((d) => parseLocalDate(d.date))
              .filter((d): d is Date => d !== null)
          } else if (job.start_date) {
            // Fall back to start→end range expansion
            const start = parseLocalDate(job.start_date)
            const end = job.end_date ? parseLocalDate(job.end_date) : start
            if (start && end) {
              for (let d = new Date(start); d <= end; d = addDays(d, 1)) {
                datesToMark.push(new Date(d))
              }
            }
          }

          for (const d of datesToMark) {
            const key = ymd(d)
            const current = map[key]
            // Booked overrides requested, requested overrides unavailable.
            if (state === 'booked' || !current || current === 'unavailable') {
              map[key] = state
            }
          }
        }
      }

      expand(requestedRes.data as BookingRow[] | null, 'requested')
      expand(confirmedRes.data as BookingRow[] | null, 'booked')

      setStatuses(map)
      setLoading(false)
    }

    load()
    return () => {
      cancelled = true
    }
  }, [userId, supabase, monthStart, monthEnd])

  async function toggleDay(date: Date) {
    if (!userId) return
    const dateStr = ymd(date)
    if (savingDate) return

    const current = statuses[dateStr] ?? 'available'
    if (current === 'booked' || current === 'requested') return

    const next: DayState = current === 'unavailable' ? 'available' : 'unavailable'
    setStatuses((s) => ({ ...s, [dateStr]: next }))
    setSavingDate(dateStr)
    setError('')

    let err: { message: string } | null = null
    if (next === 'unavailable') {
      const { error } = await supabase
        .from('talent_unavailability')
        .insert({ talent_id: userId, date: dateStr })
      err = error
    } else {
      const { error } = await supabase
        .from('talent_unavailability')
        .delete()
        .eq('talent_id', userId)
        .eq('date', dateStr)
      err = error
    }

    if (err) {
      setStatuses((s) => ({ ...s, [dateStr]: current }))
      setError(err.message)
    }

    setSavingDate(null)
  }

  function changeMonth(delta: number) {
    setViewDate((d) => new Date(d.getFullYear(), d.getMonth() + delta, 1))
  }

  const firstDow = monthStart.getDay()
  const daysInMonth = monthEnd.getDate()
  const cells: { date: Date | null }[] = []
  for (let i = 0; i < firstDow; i++) cells.push({ date: null })
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ date: new Date(viewDate.getFullYear(), viewDate.getMonth(), d) })
  }
  while (cells.length % 7 !== 0) cells.push({ date: null })

  return (
    <main
      className="rounded-t-rs-lg"
      style={{ background: BG, color: TEXT, minHeight: 'calc(100dvh - 64px)' }}
    >
      <div className="max-w-md mx-auto px-5 pt-6 pb-10">
        <h1 style={{ fontSize: 20, fontWeight: 600, marginBottom: 4 }}>Calendar</h1>
        <p style={{ fontSize: 12, color: TEXT_MUTED, marginBottom: 18 }}>
          Tap a day to mark yourself unavailable.
        </p>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0 12px',
            marginBottom: 12,
          }}
        >
          <ArrowButton aria-label="Previous month" onClick={() => changeMonth(-1)}>
            ‹
          </ArrowButton>
          <h2 style={{ fontSize: 16, fontWeight: 500, color: TEXT }}>
            {MONTHS[viewDate.getMonth()]} {viewDate.getFullYear()}
          </h2>
          <ArrowButton aria-label="Next month" onClick={() => changeMonth(1)}>
            ›
          </ArrowButton>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(7, 1fr)',
            gap: 3,
            padding: '0 12px',
            marginBottom: 6,
          }}
        >
          {DOW.map((d) => (
            <div
              key={d}
              style={{
                textAlign: 'center',
                fontSize: 11,
                color: TEXT_MUTED,
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
                paddingBottom: 4,
              }}
            >
              {d}
            </div>
          ))}
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(7, 1fr)',
            gap: 3,
            padding: '0 12px',
            opacity: loading ? 0.6 : 1,
          }}
        >
          {cells.map((cell, i) => {
            if (!cell.date) {
              return <div key={i} style={{ aspectRatio: '1 / 1' }} />
            }
            const dateStr = ymd(cell.date)
            const state: DayState = statuses[dateStr] ?? 'available'
            const style = STATE_STYLE[state]
            const isToday = isSameDay(cell.date, today)
            const inPast = cell.date < today && !isToday
            const saving = savingDate === dateStr
            const systemLocked = state === 'booked' || state === 'requested'

            const title = systemLocked
              ? state === 'booked'
                ? 'Confirmed booking — this date is locked'
                : 'Pending job offer — accept or decline this offer first'
              : state === 'unavailable'
              ? 'Marked unavailable — tap to clear'
              : 'Tap to mark unavailable'

            return (
              <button
                key={i}
                type="button"
                title={title}
                onClick={() => toggleDay(cell.date!)}
                disabled={loading || saving || systemLocked}
                style={{
                  aspectRatio: '1 / 1',
                  borderRadius: 8,
                  border: 'none',
                  outline: isToday ? '2px solid #1A3C6B' : 'none',
                  outlineOffset: isToday ? -2 : 0,
                  background: style.bg,
                  color: style.color,
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: systemLocked ? 'default' : saving ? 'wait' : 'pointer',
                  opacity: inPast ? 0.4 : 1,
                  transition: 'background 120ms ease, opacity 120ms ease',
                  boxShadow:
                    state === 'available' && style.borderColor
                      ? `inset 0 0 0 1px ${style.borderColor}`
                      : undefined,
                }}
                onMouseEnter={(e) => {
                  if (state === 'available' && !saving) {
                    ;(e.currentTarget as HTMLButtonElement).style.background =
                      AVAILABLE_HOVER_BG
                  }
                }}
                onMouseLeave={(e) => {
                  if (state === 'available') {
                    ;(e.currentTarget as HTMLButtonElement).style.background =
                      STATE_STYLE.available.bg
                  }
                }}
              >
                {cell.date.getDate()}
              </button>
            )
          })}
        </div>

        {error && (
          <p
            style={{
              fontSize: 12,
              color: '#fca5a5',
              marginTop: 12,
              padding: '10px 12px',
              background: 'rgba(248,113,113,0.12)',
              border: '1px solid rgba(248,113,113,0.25)',
              borderRadius: 10,
            }}
          >
            {error}
          </p>
        )}

        <div style={{ marginTop: 24, padding: '0 12px' }}>
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 12,
              marginBottom: 10,
            }}
          >
            <LegendItem label="Available" swatchStyle={STATE_STYLE.available} outlined />
            <LegendItem label="Unavailable" swatchStyle={STATE_STYLE.unavailable} />
            <LegendItem label="On hold" swatchStyle={STATE_STYLE.requested} />
            <LegendItem label="Booked" swatchStyle={STATE_STYLE.booked} />
          </div>
          <p style={{ fontSize: 11, color: TEXT_MUTED, lineHeight: 1.5 }}>
            Tap any available day to mark unavailable. Tap again to clear.
          </p>
          {Object.values(statuses).includes('booked') && (
            <p
              style={{
                fontSize: 11,
                color: TEXT_MUTED,
                lineHeight: 1.5,
                marginTop: 8,
              }}
            >
              🔒 Green days are confirmed bookings and cannot be changed.
              Contact hello@rowlystudios.com if there&apos;s an issue.
            </p>
          )}
        </div>
      </div>
    </main>
  )
}

function ArrowButton({
  children,
  onClick,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      onClick={onClick}
      {...rest}
      style={{
        width: 32,
        height: 32,
        borderRadius: 999,
        background: 'rgba(255,255,255,0.08)',
        border: 'none',
        color: TEXT,
        fontSize: 18,
        cursor: 'pointer',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        lineHeight: 1,
      }}
    >
      {children}
    </button>
  )
}

function LegendItem({
  label,
  swatchStyle,
  outlined,
}: {
  label: string
  swatchStyle: { bg: string; color: string; borderColor?: string }
  outlined?: boolean
}) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <span
        aria-hidden
        style={{
          width: 12,
          height: 12,
          borderRadius: 3,
          background: swatchStyle.bg,
          boxShadow:
            outlined && swatchStyle.borderColor
              ? `inset 0 0 0 1px ${swatchStyle.borderColor}`
              : undefined,
        }}
      />
      <span style={{ fontSize: 11, color: TEXT_MUTED, fontWeight: 500 }}>{label}</span>
    </span>
  )
}

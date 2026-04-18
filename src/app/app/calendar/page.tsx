'use client'

import { useState, useEffect, useMemo } from 'react'
import { useAuth } from '@/lib/auth-context'
import type { AvailabilityStatus } from '@/lib/types'

type DayStatus = AvailabilityStatus | null

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

function ymd(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function nextStatus(current: DayStatus): DayStatus {
  if (current === null) return 'available'
  if (current === 'available') return 'hold'
  if (current === 'hold') return 'unavailable'
  return null
}

export default function CalendarPage() {
  const { user, supabase } = useAuth()
  const userId = user?.id ?? null
  const [loading, setLoading] = useState(true)
  const [savingDate, setSavingDate] = useState<string | null>(null)
  const [statuses, setStatuses] = useState<Record<string, DayStatus>>({})
  const [viewDate, setViewDate] = useState(new Date())

  const monthStart = useMemo(
    () => new Date(viewDate.getFullYear(), viewDate.getMonth(), 1),
    [viewDate]
  )
  const monthEnd = useMemo(
    () => new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 0),
    [viewDate]
  )

  useEffect(() => {
    if (!userId) return
    let cancelled = false
    async function load() {
      const from = ymd(monthStart)
      const to = ymd(monthEnd)

      const { data } = await supabase
        .from('availability')
        .select('date, status')
        .eq('talent_id', userId)
        .gte('date', from)
        .lte('date', to)

      if (cancelled) return
      const map: Record<string, DayStatus> = {}
      for (const row of data ?? []) {
        map[row.date] = row.status as AvailabilityStatus
      }
      setStatuses(map)
      setLoading(false)
    }
    load()
    return () => {
      cancelled = true
    }
  }, [monthStart, monthEnd, supabase, userId])

  async function toggleDay(date: Date) {
    if (!userId) return
    const dateStr = ymd(date)
    if (savingDate) return

    const current = statuses[dateStr] ?? null
    const next = nextStatus(current)

    setStatuses((s) => ({ ...s, [dateStr]: next }))
    setSavingDate(dateStr)

    if (next === null) {
      await supabase.from('availability').delete().eq('talent_id', userId).eq('date', dateStr)
    } else {
      await supabase.from('availability').upsert(
        { talent_id: userId, date: dateStr, status: next },
        { onConflict: 'talent_id,date' }
      )
    }

    setSavingDate(null)
  }

  function changeMonth(delta: number) {
    setViewDate((d) => new Date(d.getFullYear(), d.getMonth() + delta, 1))
  }

  const today = new Date()
  const todayStr = ymd(today)

  const firstDayOfWeek = monthStart.getDay()
  const daysInMonth = monthEnd.getDate()

  const cells: { date: Date | null; dateStr: string | null }[] = []
  for (let i = 0; i < firstDayOfWeek; i++) cells.push({ date: null, dateStr: null })
  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(viewDate.getFullYear(), viewDate.getMonth(), d)
    cells.push({ date, dateStr: ymd(date) })
  }
  while (cells.length % 7 !== 0) cells.push({ date: null, dateStr: null })

  const availCount = Object.values(statuses).filter((s) => s === 'available').length
  const holdCount = Object.values(statuses).filter((s) => s === 'hold').length
  const blockedCount = Object.values(statuses).filter((s) => s === 'unavailable').length

  return (
    <main className="px-5 py-6 max-w-md mx-auto">
      <h1 className="text-[22px] font-semibold text-rs-blue-logo">My availability</h1>
      <p className="text-[11px] uppercase tracking-widest text-rs-blue-fusion/60 font-semibold mt-1 mb-4">
        Tap a date to cycle status
      </p>

      <div className="flex items-center justify-between mb-3">
        <button
          onClick={() => changeMonth(-1)}
          className="text-[12px] font-semibold text-rs-blue-fusion px-3 py-1 rounded-rs hover:bg-rs-blue-fusion/5"
        >
          ← Prev
        </button>
        <h2 className="text-[14px] font-semibold text-rs-blue-logo">
          {MONTHS[viewDate.getMonth()]} {viewDate.getFullYear()}
        </h2>
        <button
          onClick={() => changeMonth(1)}
          className="text-[12px] font-semibold text-rs-blue-fusion px-3 py-1 rounded-rs hover:bg-rs-blue-fusion/5"
        >
          Next →
        </button>
      </div>

      <div className="flex gap-3 mb-3 text-[10px] flex-wrap font-medium">
        <Legend color="#DCE7EC" label="Available" textColor="#496275" />
        <Legend color="#F6EBC8" label="Hold" textColor="#8a6f1a" />
        <Legend color="#1E3A6B" label="Unavailable" textColor="#fff" />
      </div>

      <div className="bg-white rounded-rs p-3 border border-rs-blue-fusion/10">
        <div className="grid grid-cols-7 gap-1 mb-1.5 text-[9px] text-rs-blue-fusion/50 text-center uppercase tracking-wider font-semibold">
          <div>S</div><div>M</div><div>T</div><div>W</div><div>T</div><div>F</div><div>S</div>
        </div>
        <div className="grid grid-cols-7 gap-1">
          {cells.map((cell, i) => {
            if (!cell.date || !cell.dateStr) {
              return <div key={i} className="aspect-square" />
            }
            const status = statuses[cell.dateStr] ?? null
            const isToday = cell.dateStr === todayStr
            const saving = savingDate === cell.dateStr

            let bg = 'transparent'
            let color = 'rgba(30,58,107,0.7)'
            if (status === 'available') { bg = '#DCE7EC'; color = '#496275' }
            if (status === 'hold') { bg = '#F6EBC8'; color = '#8a6f1a' }
            if (status === 'unavailable') { bg = '#1E3A6B'; color = '#FBF5E4' }

            return (
              <button
                key={i}
                onClick={() => toggleDay(cell.date!)}
                disabled={loading || saving}
                className="aspect-square rounded-md flex items-center justify-center text-[11px] font-semibold transition-opacity disabled:opacity-50"
                style={{
                  background: bg,
                  color,
                  boxShadow: isToday ? 'inset 0 0 0 2px #1E3A6B' : undefined,
                }}
              >
                {cell.date.getDate()}
              </button>
            )
          })}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 mt-4">
        <Stat label="Available" value={availCount} />
        <Stat label="Hold" value={holdCount} />
        <Stat label="Blocked" value={blockedCount} />
      </div>

      {loading && (
        <p className="text-[11px] text-rs-blue-fusion/60 text-center mt-4">Loading dates…</p>
      )}
    </main>
  )
}

function Legend({ color, label, textColor }: { color: string; label: string; textColor: string }) {
  return (
    <span className="flex items-center gap-1.5 text-rs-blue-logo">
      <span className="w-2.5 h-2.5 rounded-sm" style={{ background: color }} />
      {label}
    </span>
  )
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-white rounded-rs p-3 border border-rs-blue-fusion/10 text-center">
      <p className="text-[9px] uppercase tracking-wider text-rs-blue-fusion/60 font-semibold">
        {label}
      </p>
      <p className="text-[20px] font-bold text-rs-blue-logo mt-1">{value}</p>
    </div>
  )
}

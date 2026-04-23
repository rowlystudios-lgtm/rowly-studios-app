'use client'

import { useRouter, usePathname, useSearchParams } from 'next/navigation'

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

function getQuarters(year: number) {
  return [
    { label: `Q1 ${year}`, months: [`${year}-01`, `${year}-02`, `${year}-03`] },
    { label: `Q2 ${year}`, months: [`${year}-04`, `${year}-05`, `${year}-06`] },
    { label: `Q3 ${year}`, months: [`${year}-07`, `${year}-08`, `${year}-09`] },
    { label: `Q4 ${year}`, months: [`${year}-10`, `${year}-11`, `${year}-12`] },
  ]
}

function monthLabel(ym: string) {
  const [y, m] = ym.split('-')
  return `${MONTHS[parseInt(m) - 1]} ${y}`
}

export function FinancePeriodSelector({ currentMonth }: { currentMonth: string }) {
  const router = useRouter()
  const pathname = usePathname()
  // useSearchParams kept for parity with the spec — not currently read,
  // but referenced so it's available if we add quarter URL state later.
  useSearchParams()

  const now = new Date()
  const currentYear = now.getFullYear()
  // Show current year and previous year in dropdown
  const allYears = [currentYear, currentYear - 1]
  const allQuarters = allYears.flatMap(y => getQuarters(y))

  // Find which quarter contains the current month
  const currentQuarter = allQuarters.find(q => q.months.includes(currentMonth))
  const months =
    currentQuarter?.months
    ?? getQuarters(currentYear).find(q => q.months.includes(currentMonth))?.months
    ?? getQuarters(currentYear)[Math.floor(now.getMonth() / 3)].months

  function navigate(month: string) {
    router.push(`${pathname}?month=${month}`)
  }

  function onQuarterChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const q = allQuarters.find(q => q.label === e.target.value)
    if (q) navigate(q.months[0])
  }

  return (
    <div style={{ marginTop: 16, marginBottom: 4 }}>
      {/* Quarter dropdown */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <label style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#7A90AA', whiteSpace: 'nowrap' }}>
          Period
        </label>
        <select
          value={currentQuarter?.label ?? ''}
          onChange={onQuarterChange}
          style={{
            background: '#1A2E4A', color: '#CDD9E5', border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 8, padding: '7px 12px', fontSize: 13, fontWeight: 600,
            cursor: 'pointer', outline: 'none', fontFamily: 'inherit',
          }}
        >
          {allQuarters.map(q => (
            <option key={q.label} value={q.label}>{q.label}</option>
          ))}
        </select>
      </div>

      {/* Month pills within the quarter */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {(months ?? []).map(ym => {
          const active = ym === currentMonth
          return (
            <button
              key={ym}
              type="button"
              onClick={() => navigate(ym)}
              style={{
                padding: '7px 14px', borderRadius: 20, fontSize: 12, fontWeight: 600,
                cursor: 'pointer', border: 'none', fontFamily: 'inherit',
                background: active ? '#F0A500' : 'rgba(255,255,255,0.06)',
                color: active ? '#0F1B2E' : '#CDD9E5',
                letterSpacing: '0.02em',
              }}
            >
              {monthLabel(ym)}
            </button>
          )
        })}
      </div>
    </div>
  )
}

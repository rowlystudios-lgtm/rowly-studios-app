'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'upcoming', label: 'Upcoming' },
  { key: 'crewing', label: 'Crewing' },
  { key: 'submitted', label: 'Submitted' },
  { key: 'confirmed', label: 'Confirmed' },
  { key: 'wrapped', label: 'Wrapped' },
  { key: 'cancelled', label: 'Cancelled' },
]

export function JobsFilterClient({ current }: { current: string }) {
  const pathname = usePathname()
  return (
    <div
      className="flex gap-1"
      style={{
        overflowX: 'auto',
        scrollbarWidth: 'none',
        msOverflowStyle: 'none',
      }}
    >
      <style>{`
        div::-webkit-scrollbar { display: none; }
      `}</style>
      {FILTERS.map((f) => {
        const active = current === f.key
        const href = f.key === 'all' ? pathname : `${pathname}?status=${f.key}`
        return (
          <Link
            key={f.key}
            href={href}
            className={
              active
                ? 'text-white border-b-2 border-[#F0A500]'
                : 'text-[#7A90AA] border-b-2 border-transparent hover:text-white/80'
            }
            style={{
              padding: '8px 12px',
              fontSize: 13,
              fontWeight: 600,
              letterSpacing: '0.02em',
              whiteSpace: 'nowrap',
              textDecoration: 'none',
            }}
          >
            {f.label}
          </Link>
        )
      })}
    </div>
  )
}

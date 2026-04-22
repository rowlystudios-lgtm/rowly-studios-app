'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

export type JobFilterKey = 'all' | 'active' | 'action' | 'wrapped'

const FILTERS: { key: JobFilterKey; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'active', label: 'Active' },
  { key: 'action', label: 'Action needed' },
  { key: 'wrapped', label: 'Wrapped' },
]

export function JobsFilterClient({
  current,
  actionCount,
}: {
  current: JobFilterKey
  actionCount: number
}) {
  const pathname = usePathname()
  return (
    <div
      className="inline-flex rounded-full bg-[#0F1B2E] border border-white/5 p-1"
      style={{ width: '100%', maxWidth: 520 }}
      role="tablist"
    >
      {FILTERS.map((f) => {
        const active = current === f.key
        const href = f.key === 'all' ? pathname : `${pathname}?status=${f.key}`
        return (
          <Link
            key={f.key}
            href={href}
            role="tab"
            aria-selected={active}
            className={
              active
                ? 'text-white bg-[#1E3A6B]'
                : 'text-[#7A90AA] hover:text-white/80'
            }
            style={{
              flex: 1,
              textAlign: 'center',
              padding: '10px 12px',
              fontSize: 12,
              fontWeight: 600,
              letterSpacing: '0.02em',
              whiteSpace: 'nowrap',
              textDecoration: 'none',
              borderRadius: 999,
              transition: 'background-color 0.15s, color 0.15s',
              minHeight: 40,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
            }}
          >
            <span
              style={{
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {f.label}
            </span>
            {f.key === 'action' && actionCount > 0 && (
              <span
                className="inline-flex items-center justify-center rounded-full bg-amber-500/30 text-amber-200"
                style={{
                  minWidth: 20,
                  height: 18,
                  fontSize: 11,
                  fontWeight: 700,
                  padding: '0 6px',
                }}
              >
                {actionCount}
              </span>
            )}
          </Link>
        )
      })}
    </div>
  )
}

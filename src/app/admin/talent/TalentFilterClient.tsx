'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'verified', label: 'Verified' },
  { key: 'unverified', label: 'Unverified' },
]

export function TalentFilterClient({ current }: { current: string }) {
  const pathname = usePathname()
  return (
    <div style={{ display: 'flex', gap: 6, marginBottom: 4 }}>
      {FILTERS.map((f) => {
        const active = current === f.key
        const href = f.key === 'all' ? pathname : `${pathname}?filter=${f.key}`
        return (
          <Link
            key={f.key}
            href={href}
            style={{
              padding: '6px 12px',
              borderRadius: 999,
              fontSize: 11,
              fontWeight: 600,
              textDecoration: 'none',
              background: active ? '#F0A500' : 'rgba(255,255,255,0.05)',
              color: active ? '#0F1B2E' : '#AABDE0',
              border: active
                ? '1px solid transparent'
                : '1px solid rgba(170,189,224,0.18)',
              letterSpacing: '0.04em',
            }}
          >
            {f.label}
          </Link>
        )
      })}
    </div>
  )
}

'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'draft', label: 'Draft' },
  { key: 'sent', label: 'Sent' },
  { key: 'paid', label: 'Paid' },
  { key: 'overdue', label: 'Overdue' },
]

export function FinanceFilterClient({ current }: { current: string }) {
  const pathname = usePathname()
  return (
    <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 4 }}>
      {FILTERS.map((f) => {
        const active = current === f.key
        const href = f.key === 'all' ? pathname : `${pathname}?status=${f.key}`
        return (
          <Link
            key={f.key}
            href={href}
            style={{
              padding: '7px 12px',
              borderRadius: 999,
              fontSize: 11,
              fontWeight: 600,
              textDecoration: 'none',
              whiteSpace: 'nowrap',
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

'use client'

import Link from 'next/link'
import { useSearchParams } from 'next/navigation'

type Filter =
  | 'all'
  | 'pending'
  | 'talent'
  | 'clients'
  | 'approved'
  | 'rejected'

const TABS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'pending', label: 'Pending' },
  { key: 'talent', label: 'Talent' },
  { key: 'clients', label: 'Clients' },
  { key: 'approved', label: 'Approved' },
  { key: 'rejected', label: 'Rejected' },
]

export function FilterTabs() {
  const params = useSearchParams()
  const current = (params?.get('filter') as Filter) || 'pending'
  return (
    <div
      style={{
        display: 'flex',
        gap: 6,
        flexWrap: 'wrap',
        marginTop: 12,
      }}
    >
      {TABS.map((t) => {
        const active = t.key === current
        return (
          <Link
            key={t.key}
            href={`/admin/applications?filter=${t.key}`}
            style={{
              padding: '6px 12px',
              borderRadius: 999,
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              textDecoration: 'none',
              border: '1px solid',
              borderColor: active
                ? '#F0A500'
                : 'rgba(255,255,255,0.12)',
              background: active ? '#F0A500' : 'transparent',
              color: active ? '#0F1B2E' : 'rgba(255,255,255,0.65)',
              whiteSpace: 'nowrap',
            }}
          >
            {t.label}
          </Link>
        )
      })}
    </div>
  )
}

'use client'

import { useMemo, useState } from 'react'
import { ApplicationCard, type Application } from './ApplicationCard'

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

type Props = {
  applications: Application[]
  reviewerMap: Record<string, string>
}

export function ApplicationsList({ applications, reviewerMap }: Props) {
  const [filter, setFilter] = useState<Filter>('pending')

  const filtered = useMemo(() => {
    if (filter === 'all') return applications
    if (filter === 'pending')
      return applications.filter((a) => a.status === 'pending')
    if (filter === 'approved')
      return applications.filter((a) => a.status === 'approved')
    if (filter === 'rejected')
      return applications.filter((a) => a.status === 'rejected')
    if (filter === 'talent')
      return applications.filter((a) => a.type === 'talent')
    if (filter === 'clients')
      return applications.filter((a) => a.type === 'client')
    return applications
  }, [applications, filter])

  return (
    <>
      <div
        style={{
          display: 'flex',
          gap: 6,
          flexWrap: 'wrap',
          marginTop: 12,
        }}
      >
        {TABS.map((t) => {
          const active = t.key === filter
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setFilter(t.key)}
              style={{
                padding: '6px 12px',
                borderRadius: 999,
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                border: '1px solid',
                borderColor: active ? '#F0A500' : 'rgba(255,255,255,0.12)',
                background: active ? '#F0A500' : 'transparent',
                color: active ? '#0F1B2E' : 'rgba(255,255,255,0.65)',
                whiteSpace: 'nowrap',
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              {t.label}
            </button>
          )
        })}
      </div>

      <div style={{ marginTop: 18 }}>
        {filtered.length === 0 ? (
          <div
            style={{
              padding: '40px 16px',
              textAlign: 'center',
              color: 'rgba(255,255,255,0.45)',
              fontSize: 14,
              background: 'rgba(255,255,255,0.03)',
              border: '1px dashed rgba(255,255,255,0.1)',
              borderRadius: 12,
            }}
          >
            No applications for this filter.
          </div>
        ) : (
          filtered.map((app) => (
            <ApplicationCard
              key={app.id}
              app={app}
              reviewerName={
                app.reviewed_by ? reviewerMap[app.reviewed_by] : null
              }
            />
          ))
        )}
      </div>
    </>
  )
}

'use client'

import { useAuth } from '@/lib/auth-context'
import type { ViewMode } from '@/lib/types'

const MODES: ViewMode[] = ['talent', 'admin', 'client']
const LABELS: Record<ViewMode, string> = {
  talent: 'Talent',
  admin: 'Admin',
  client: 'Client',
}

export const MODE_SWITCHER_HEIGHT = 52

export function ModeSwitcher() {
  const { profile, viewMode, setViewMode } = useAuth()
  if (profile?.role !== 'admin') return null

  return (
    <div
      style={{
        background: 'rgba(0,0,0,0.25)',
        padding: '8px 12px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div
        role="tablist"
        aria-label="View mode"
        style={{
          width: '100%',
          maxWidth: 360,
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          padding: 3,
          borderRadius: 999,
          background: 'rgba(255,255,255,0.08)',
          border: '1px solid rgba(170,189,224,0.2)',
        }}
      >
        {MODES.map((mode) => {
          const active = viewMode === mode
          return (
            <button
              key={mode}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setViewMode(mode)}
              style={{
                padding: '6px 0',
                borderRadius: 999,
                border: 'none',
                background: active ? '#fff' : 'transparent',
                color: active ? '#1A3C6B' : 'rgba(170,189,224,0.6)',
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                cursor: 'pointer',
                transition: 'background 150ms ease, color 150ms ease',
              }}
            >
              {LABELS[mode]}
            </button>
          )
        })}
      </div>
    </div>
  )
}

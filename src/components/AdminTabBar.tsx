'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

type Tab = {
  href: string
  label: string
  match: (p: string) => boolean
  icon: React.ReactNode
}

const GridIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" width="20" height="20">
    <rect x="3" y="3" width="7" height="7" rx="1.5" />
    <rect x="14" y="3" width="7" height="7" rx="1.5" />
    <rect x="3" y="14" width="7" height="7" rx="1.5" />
    <rect x="14" y="14" width="7" height="7" rx="1.5" />
  </svg>
)

const BriefcaseIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" width="20" height="20">
    <rect x="3" y="6" width="18" height="15" rx="2" />
    <path d="M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2" />
  </svg>
)

const UsersIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" width="20" height="20">
    <circle cx="9" cy="8" r="3.5" />
    <path d="M2 20a7 7 0 0 1 14 0" />
    <circle cx="17" cy="9" r="2.5" />
    <path d="M16 20a5 5 0 0 1 6-5" />
  </svg>
)

const BuildingIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" width="20" height="20">
    <rect x="4" y="3" width="16" height="18" rx="1.5" />
    <path d="M9 8h1M9 12h1M9 16h1M14 8h1M14 12h1M14 16h1" />
  </svg>
)

const ReceiptIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" width="20" height="20">
    <path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3z" />
    <path d="M9 8h6M9 12h6M9 16h3" />
  </svg>
)

const ClipboardIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" width="20" height="20">
    <rect x="6" y="4" width="12" height="17" rx="2" />
    <path d="M9 4V3a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v1" />
    <path d="M9 11h6M9 15h4" />
  </svg>
)

const TABS: Tab[] = [
  { href: '/admin', label: 'Dashboard', match: (p) => p === '/admin', icon: GridIcon },
  { href: '/admin/jobs', label: 'Jobs', match: (p) => p.startsWith('/admin/jobs'), icon: BriefcaseIcon },
  { href: '/admin/talent', label: 'Talent', match: (p) => p.startsWith('/admin/talent'), icon: UsersIcon },
  { href: '/admin/clients', label: 'Clients', match: (p) => p.startsWith('/admin/clients'), icon: BuildingIcon },
  { href: '/admin/applications', label: 'Applications', match: (p) => p.startsWith('/admin/applications'), icon: ClipboardIcon },
  { href: '/admin/finance', label: 'Finance', match: (p) => p.startsWith('/admin/finance'), icon: ReceiptIcon },
]

export function AdminTabBar({ pendingApplicationsCount = 0 }: { pendingApplicationsCount?: number } = {}) {
  const pathname = usePathname()

  return (
    <nav
      style={{
        flexShrink: 0,
        display: 'flex',
        justifyContent: 'space-around',
        background: '#0F1B2E',
        borderTop: '1px solid rgba(255,255,255,0.1)',
        paddingTop: 10,
        paddingBottom: 'calc(env(safe-area-inset-bottom) + 10px)',
      }}
    >
      {TABS.map((tab) => {
        const active = tab.match(pathname)
        const color = active ? '#F0A500' : 'rgba(255,255,255,0.45)'
        const showBadge = tab.href === '/admin/applications' && pendingApplicationsCount > 0
        return (
          <Link
            key={tab.href}
            href={tab.href}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 4,
              padding: '4px 10px',
              color,
              textDecoration: 'none',
              position: 'relative',
            }}
          >
            <span style={{ position: 'relative', display: 'inline-flex' }}>
              {tab.icon}
              {showBadge && (
                <span
                  style={{
                    position: 'absolute',
                    top: -4,
                    right: -8,
                    minWidth: 16,
                    height: 16,
                    padding: '0 4px',
                    borderRadius: 8,
                    background: '#E23B3B',
                    color: '#fff',
                    fontSize: 9,
                    fontWeight: 800,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    lineHeight: 1,
                    boxShadow: '0 0 0 1.5px #0F1B2E',
                  }}
                >
                  {pendingApplicationsCount > 99 ? '99+' : pendingApplicationsCount}
                </span>
              )}
            </span>
            <span
              style={{
                fontSize: 9,
                fontWeight: 700,
                letterSpacing: '0.14em',
                textTransform: 'uppercase',
                lineHeight: 1,
              }}
            >
              {tab.label}
            </span>
          </Link>
        )
      })}
    </nav>
  )
}

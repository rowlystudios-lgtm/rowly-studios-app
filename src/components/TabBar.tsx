'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useAuth } from '@/lib/auth-context'
import type { ViewMode } from '@/lib/types'

type Tab = { href: string; label: string; icon: React.ReactNode; matches?: (path: string) => boolean }

const BriefcaseIcon = (
  <svg viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
    <rect x="3" y="6" width="16" height="13" rx="2" />
    <path d="M8 6V4a2 2 0 012-2h2a2 2 0 012 2v2" />
  </svg>
)

const CalendarIcon = (
  <svg viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
    <rect x="3" y="5" width="16" height="14" rx="2" />
    <path d="M3 9h16M8 3v4M14 3v4" />
  </svg>
)

const ProfileIcon = (
  <svg viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
    <circle cx="11" cy="8" r="4" />
    <path d="M3 20a8 8 0 0116 0" />
  </svg>
)

const ClockIcon = (
  <svg viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
    <circle cx="11" cy="11" r="8" />
    <polyline points="11 6 11 11 14 13" />
  </svg>
)

const PeopleIcon = (
  <svg viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
    <circle cx="8" cy="8" r="3" />
    <path d="M2 19a6 6 0 0112 0" />
    <circle cx="16" cy="9" r="2.5" />
    <path d="M14 19a5 5 0 016-5" />
  </svg>
)

const PlusCircleIcon = (
  <svg viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
    <circle cx="11" cy="11" r="8" />
    <path d="M11 7v8M7 11h8" />
  </svg>
)

const GridIcon = (
  <svg viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
    <rect x="3" y="3" width="7" height="7" rx="1.5" />
    <rect x="12" y="3" width="7" height="7" rx="1.5" />
    <rect x="3" y="12" width="7" height="7" rx="1.5" />
    <rect x="12" y="12" width="7" height="7" rx="1.5" />
  </svg>
)

const BuildingIcon = (
  <svg viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
    <rect x="4" y="3" width="14" height="17" rx="1.5" />
    <path d="M8 8h1M8 12h1M8 16h1M13 8h1M13 12h1M13 16h1" />
  </svg>
)

const TABS: Record<ViewMode, Tab[]> = {
  talent: [
    { href: '/app', label: 'Overview', icon: BriefcaseIcon, matches: (p) => p === '/app' },
    { href: '/app/calendar', label: 'Calendar', icon: CalendarIcon },
    { href: '/app/profile', label: 'Profile', icon: ProfileIcon, matches: (p) => p.startsWith('/app/profile') },
    { href: '/app/history', label: 'History', icon: ClockIcon },
  ],
  client: [
    { href: '/app', label: 'My Jobs', icon: BriefcaseIcon, matches: (p) => p === '/app' },
    { href: '/app/roster', label: 'Roster', icon: PeopleIcon, matches: (p) => p.startsWith('/app/roster') },
    { href: '/app/post-job', label: 'Post Job', icon: PlusCircleIcon },
    { href: '/app/account', label: 'Account', icon: ProfileIcon },
  ],
  admin: [
    { href: '/app', label: 'Dashboard', icon: GridIcon, matches: (p) => p === '/app' },
    { href: '/app/talent', label: 'Talent', icon: PeopleIcon, matches: (p) => p.startsWith('/app/talent') },
    { href: '/app/clients', label: 'Clients', icon: BuildingIcon, matches: (p) => p.startsWith('/app/clients') },
    { href: '/app/jobs', label: 'Jobs', icon: BriefcaseIcon, matches: (p) => p.startsWith('/app/jobs') },
  ],
}

export function TabBar() {
  const pathname = usePathname()
  const { viewMode } = useAuth()
  const tabs = TABS[viewMode] ?? TABS.talent

  return (
    <nav
      className="flex justify-around border-t border-rs-blue-fusion/10 px-3 pt-2"
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 100,
        background: 'var(--rs-cream, #FBF5E4)',
        paddingBottom: 'calc(env(safe-area-inset-bottom) + 8px)',
      }}
    >
      {tabs.map((tab) => {
        const active = tab.matches ? tab.matches(pathname) : pathname === tab.href
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`flex flex-col items-center gap-1 px-3 py-1.5 text-[10px] tracking-wider uppercase font-semibold ${
              active ? 'text-rs-blue-logo' : 'text-rs-blue-fusion/40'
            }`}
          >
            {tab.icon}
            <span>{tab.label}</span>
          </Link>
        )
      })}
    </nav>
  )
}

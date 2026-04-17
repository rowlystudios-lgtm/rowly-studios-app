'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { UserRole } from '@/lib/types'

const TABS: Record<UserRole, { href: string; label: string; icon: React.ReactNode }[]> = {
  talent: [
    {
      href: '/app',
      label: 'Jobs',
      icon: (
        <svg viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-5 h-5">
          <rect x="3" y="6" width="16" height="13" rx="2" />
          <path d="M8 6V4a2 2 0 012-2h2a2 2 0 012 2v2" />
        </svg>
      ),
    },
    {
      href: '/app/calendar',
      label: 'Calendar',
      icon: (
        <svg viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-5 h-5">
          <rect x="3" y="5" width="16" height="14" rx="2" />
          <path d="M3 9h16M8 3v4M14 3v4" />
        </svg>
      ),
    },
    {
      href: '/app/team',
      label: 'Team',
      icon: (
        <svg viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-5 h-5">
          <circle cx="8" cy="8" r="3" />
          <path d="M2 19a6 6 0 0112 0" />
          <circle cx="16" cy="9" r="2.5" />
          <path d="M14 19a5 5 0 016-5" />
        </svg>
      ),
    },
    {
      href: '/app/profile',
      label: 'Profile',
      icon: (
        <svg viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-5 h-5">
          <circle cx="11" cy="8" r="4" />
          <path d="M3 20a8 8 0 0116 0" />
        </svg>
      ),
    },
  ],
  client: [
    { href: '/app', label: 'Dashboard', icon: null },
    { href: '/app/calendar', label: 'Calendar', icon: null },
    { href: '/app/team', label: 'Team', icon: null },
    { href: '/app/profile', label: 'Profile', icon: null },
  ],
  admin: [
    { href: '/app', label: 'Overview', icon: null },
    { href: '/app/calendar', label: 'Calendar', icon: null },
    { href: '/app/team', label: 'Team', icon: null },
    { href: '/app/profile', label: 'Profile', icon: null },
  ],
}

export function TabBar({ role }: { role: UserRole }) {
  const pathname = usePathname()
  const tabs = TABS[role]

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-rs-cream border-t border-rs-blue-fusion/10 px-3 pt-2 pb-[env(safe-area-inset-bottom,1rem)] flex justify-around z-50">
      {tabs.map((tab) => {
        const isActive = pathname === tab.href
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`flex flex-col items-center gap-1 px-3 py-1.5 text-[10px] tracking-wider uppercase font-semibold ${
              isActive ? 'text-rs-blue-logo' : 'text-rs-blue-fusion/40'
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

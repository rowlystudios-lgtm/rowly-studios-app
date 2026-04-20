'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { RSLogo } from './RSLogo'
import { useAuth } from '@/lib/auth-context'

export function AppHeader() {
  const { user, supabase } = useAuth()
  const pathname = usePathname()
  const [unread, setUnread] = useState(0)

  // Re-fetch the unread count whenever the user navigates — cheap head query
  // — and also subscribe to realtime INSERT events so the badge increments
  // the moment a new notification row lands.
  useEffect(() => {
    if (!user?.id) {
      setUnread(0)
      return
    }
    let cancelled = false
    const userId = user.id

    async function refresh() {
      const { count } = await supabase
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .is('read_at', null)
      if (cancelled) return
      const next = count ?? 0
      setUnread(next)
      // Mirror the count onto the PWA app icon where supported. Safari/iOS
      // and modern Chrome both expose this; everything else simply no-ops.
      try {
        const nav = navigator as Navigator & {
          setAppBadge?: (n: number) => Promise<void>
          clearAppBadge?: () => Promise<void>
        }
        if (next > 0 && nav.setAppBadge) {
          void nav.setAppBadge(next)
        } else if (next === 0 && nav.clearAppBadge) {
          void nav.clearAppBadge()
        }
      } catch {
        // setAppBadge isn't critical — never let it throw up the UI.
      }
    }

    refresh()

    // Realtime: watch for any new notification row for this user.
    const channel = supabase
      .channel(`notifications:${userId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${userId}`,
        },
        () => {
          void refresh()
        }
      )
      .subscribe()

    return () => {
      cancelled = true
      try {
        void supabase.removeChannel(channel)
      } catch {
        // ignore cleanup errors on unmount
      }
    }
  }, [user?.id, supabase, pathname])

  return (
    <header
      className="flex items-center justify-between px-5 bg-rs-blue-fusion"
      style={{
        paddingTop: 'calc(16px + env(safe-area-inset-top))',
        paddingBottom: 16,
      }}
    >
      <div className="flex items-center gap-2">
        <RSLogo size={28} />
        <span className="text-[11px] font-semibold tracking-[1.5px] text-rs-cream uppercase">
          Rowly Studios
        </span>
      </div>
      <div className="flex items-center gap-3">
        <Link
          href="/app/notifications"
          aria-label={`Notifications${unread > 0 ? ` (${unread} unread)` : ''}`}
          className="relative inline-flex items-center justify-center"
          style={{
            width: 32,
            height: 32,
            borderRadius: 999,
            background: 'rgba(255,255,255,0.08)',
            color: '#FBF5E4',
          }}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
            <path d="M13.73 21a2 2 0 0 1-3.46 0" />
          </svg>
          {unread > 0 && (
            <span
              aria-hidden
              style={{
                position: 'absolute',
                top: -2,
                right: -2,
                minWidth: 16,
                height: 16,
                padding: '0 4px',
                borderRadius: 999,
                background: '#EF4444',
                color: '#fff',
                fontSize: 9,
                fontWeight: 700,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                lineHeight: 1,
                boxShadow: '0 0 0 2px #496275',
              }}
            >
              {unread > 99 ? '99+' : unread}
            </span>
          )}
        </Link>
        <form action="/auth/signout" method="post">
          <button
            type="submit"
            className="text-[10px] uppercase tracking-wider text-rs-cream/60 hover:text-rs-cream"
          >
            Sign out
          </button>
        </form>
      </div>
    </header>
  )
}

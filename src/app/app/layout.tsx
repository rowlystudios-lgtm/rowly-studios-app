'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { AppHeader } from '@/components/AppHeader'
import { TabBar } from '@/components/TabBar'
import { AuthGate } from '@/components/AuthGate'
import { Toast } from '@/components/Toast'
import { ModeSwitcher } from '@/components/ModeSwitcher'
import { ErrorBoundary } from '@/components/ui/ErrorBoundary'
import { useAuth } from '@/lib/auth-context'
import { PausedAccountScreen } from '@/components/AccountManagement'

export default function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <LayoutInner>{children}</LayoutInner>
}

function LayoutInner({ children }: { children: React.ReactNode }) {
  const { user, profile, loading } = useAuth()
  const router = useRouter()
  const isAdmin = profile?.role === 'admin'

  // First-login redirect: talent and client roles each have their own
  // wizard. A missing `onboarded` column reads as `undefined`, which
  // deliberately doesn't trigger the redirect.
  useEffect(() => {
    if (loading || !user || !profile) return
    if (profile.onboarded !== false) return
    if (profile.role === 'talent') {
      router.replace('/onboarding')
    } else if (profile.role === 'client') {
      router.replace('/onboarding/client')
    }
  }, [loading, user, profile, router])

  // Paused-account lock-out. Admins bypass — they may need to unpause
  // themselves or another account. For everyone else, render a full-
  // screen PausedAccountScreen instead of the normal layout children.
  const isPaused = !isAdmin && profile?.account_status === 'paused'

  return (
    <AuthGate>
      {isPaused ? (
        <PausedAccountScreen
          displayName={
            [profile?.first_name, profile?.last_name].filter(Boolean).join(' ') ||
            profile?.full_name ||
            null
          }
          reason={profile?.paused_reason ?? null}
        />
      ) : (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            background: 'var(--rs-blue-fusion)',
          }}
        >
          <Toast />
          <AppHeader />
          {isAdmin && <ModeSwitcher />}

          {/* Scrollable content area — this scrolls, nothing else */}
          <div
            className="bg-rs-cream rounded-t-rs-lg"
            style={{
              flex: 1,
              overflowY: 'auto',
              overflowX: 'hidden',
              WebkitOverflowScrolling: 'touch',
              // Padding so content doesn't hide behind tab bar
              paddingBottom: 'calc(72px + env(safe-area-inset-bottom))',
            }}
          >
            <ErrorBoundary>
              {children}
            </ErrorBoundary>
          </div>

          <TabBar />
        </div>
      )}
    </AuthGate>
  )
}

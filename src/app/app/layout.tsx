'use client'

import { AppHeader } from '@/components/AppHeader'
import { TabBar } from '@/components/TabBar'
import { AuthGate } from '@/components/AuthGate'
import { Toast } from '@/components/Toast'
import { ModeSwitcher } from '@/components/ModeSwitcher'
import { useAuth } from '@/lib/auth-context'

export default function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <AuthGate>
      <LayoutInner>{children}</LayoutInner>
    </AuthGate>
  )
}

function LayoutInner({ children }: { children: React.ReactNode }) {
  const { profile } = useAuth()
  const isAdmin = profile?.role === 'admin'

  return (
    <div className="min-h-[100dvh] bg-rs-blue-fusion">
      <Toast />
      {isAdmin && <ModeSwitcher />}
      <AppHeader />
      <div
        className="bg-rs-cream min-h-[calc(100dvh-64px)] rounded-t-rs-lg"
        style={{
          paddingBottom: 'calc(72px + env(safe-area-inset-bottom))',
        }}
      >
        {children}
      </div>
      <TabBar />
    </div>
  )
}

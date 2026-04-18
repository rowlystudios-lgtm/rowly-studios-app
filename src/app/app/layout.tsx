'use client'

import { AppHeader } from '@/components/AppHeader'
import { TabBar } from '@/components/TabBar'
import { AuthGate } from '@/components/AuthGate'
import { Toast } from '@/components/Toast'

export default function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <AuthGate>
      <div className="min-h-[100dvh] bg-rs-blue-fusion">
        <Toast />
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
    </AuthGate>
  )
}

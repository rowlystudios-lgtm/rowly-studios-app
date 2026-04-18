'use client'

import { useAuth } from '@/lib/auth-context'
import { TalentOverview } from '@/components/TalentOverview'
import { ClientOverview } from '@/components/ClientOverview'
import { AdminDashboard } from '@/components/AdminDashboard'
import { PageShell } from '@/components/PageShell'

export default function AppHome() {
  const { viewMode } = useAuth()

  if (viewMode === 'admin') {
    return (
      <PageShell>
        <AdminDashboard />
      </PageShell>
    )
  }

  if (viewMode === 'client') {
    return (
      <PageShell>
        <ClientOverview />
      </PageShell>
    )
  }

  return <TalentOverview />
}

'use client'

import { useAuth, roleOf } from '@/lib/auth-context'
import { TalentOverview } from '@/components/TalentOverview'
import { ClientOverview } from '@/components/ClientOverview'
import { AdminDashboard } from '@/components/AdminDashboard'
import { PageShell } from '@/components/PageShell'

export default function AppHome() {
  const { profile } = useAuth()
  const role = roleOf(profile)

  if (role === 'admin') {
    return (
      <PageShell>
        <AdminDashboard />
      </PageShell>
    )
  }

  if (role === 'client') {
    return (
      <PageShell>
        <ClientOverview />
      </PageShell>
    )
  }

  return <TalentOverview />
}

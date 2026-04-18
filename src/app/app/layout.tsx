import { createClient } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import { AppHeader } from '@/components/AppHeader'
import { TabBar } from '@/components/TabBar'
import { Toast } from '@/components/Toast'
import type { UserRole } from '@/lib/types'

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle()

  const role: UserRole = (profile?.role as UserRole) ?? 'talent'

  return (
    <div className="min-h-[100dvh] bg-rs-blue-fusion">
      <Toast />
      <AppHeader />
      <div className="bg-rs-cream min-h-[calc(100dvh-64px)] rounded-t-rs-lg pb-[100px]">
        {children}
      </div>
      <TabBar role={role} />
    </div>
  )
}

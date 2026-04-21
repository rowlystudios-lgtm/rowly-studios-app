import { AdminHeader } from '@/components/AdminHeader'
import { AdminTabBar } from '@/components/AdminTabBar'
import { ErrorBoundary } from '@/components/ui/ErrorBoundary'
import { requireAdmin } from '@/lib/admin-auth'

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const { supabase, profile } = await requireAdmin()
  const displayName =
    [profile.first_name, profile.last_name].filter(Boolean).join(' ') ||
    profile.full_name ||
    profile.email ||
    null

  // Admin oversight: count every unread notification across all users.
  const { count } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .is('read_at', null)
  const unreadCount = count ?? 0

  // Pending applications count for the tab-bar badge
  const { count: pendingApps } = await supabase
    .from('talent_applications')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'pending')
  const pendingApplicationsCount = pendingApps ?? 0

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        display: 'flex',
        flexDirection: 'column',
        background: '#0F1B2E',
        color: '#E8EEF7',
        overflow: 'hidden',
      }}
    >
      <AdminHeader
        displayName={displayName}
        avatarUrl={profile.avatar_url}
        unreadCount={unreadCount}
      />
      <main
        style={{
          flex: 1,
          overflowY: 'auto',
          overflowX: 'hidden',
          WebkitOverflowScrolling: 'touch',
          paddingBottom: 'calc(88px + env(safe-area-inset-bottom))',
        }}
      >
        <ErrorBoundary>
          {children}
        </ErrorBoundary>
      </main>
      <AdminTabBar pendingApplicationsCount={pendingApplicationsCount} />
    </div>
  )
}

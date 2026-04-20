import { AdminHeader } from '@/components/AdminHeader'
import { AdminTabBar } from '@/components/AdminTabBar'
import { requireAdmin } from '@/lib/admin-auth'

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const { profile } = await requireAdmin()
  const displayName =
    [profile.first_name, profile.last_name].filter(Boolean).join(' ') ||
    profile.full_name ||
    profile.email ||
    null

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
      <AdminHeader displayName={displayName} avatarUrl={profile.avatar_url} />
      <main
        style={{
          flex: 1,
          overflowY: 'auto',
          overflowX: 'hidden',
          WebkitOverflowScrolling: 'touch',
          paddingBottom: 'calc(88px + env(safe-area-inset-bottom))',
        }}
      >
        {children}
      </main>
      <AdminTabBar />
    </div>
  )
}

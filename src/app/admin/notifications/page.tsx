import type { Metadata } from 'next'
import Link from 'next/link'
import { requireAdmin } from '@/lib/admin-auth'
import { NotificationsClient, type NotificationRow } from './NotificationsClient'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Notifications — RS Admin',
}

export default async function AdminNotificationsPage() {
  const { supabase } = await requireAdmin()

  // Pull the last 7 days plus any open-queue items regardless of age.
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
  const { data } = await supabase
    .from('notifications')
    .select(
      `id, type, title, body, link, action_url, priority, clearable, cleared_at,
       read_at, created_at, user_id,
       profiles!notifications_user_id_fkey (full_name, first_name, last_name,
         avatar_url, role)`
    )
    .or(`created_at.gte.${sevenDaysAgo},and(clearable.eq.true,cleared_at.is.null)`)
    .order('created_at', { ascending: false })
    .limit(400)

  const rows = (data ?? []) as unknown as NotificationRow[]

  return (
    <div className="mx-auto" style={{ maxWidth: 720, padding: '20px 18px 28px' }}>
      <Link
        href="/admin"
        style={{ fontSize: 13, color: '#7A90AA', textDecoration: 'none' }}
      >
        ← Dashboard
      </Link>
      <h1
        className="text-white"
        style={{ fontSize: 20, fontWeight: 600, marginTop: 8 }}
      >
        Notifications
      </h1>
      <p style={{ fontSize: 12, color: '#7A90AA', marginTop: 2 }}>
        Work the to-do queue, review recent activity, or send something new.
      </p>

      <NotificationsClient initial={rows} />
    </div>
  )
}

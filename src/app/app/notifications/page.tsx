import Link from 'next/link'
import { createClient } from '@/lib/supabase-server'
import { markAllNotificationsRead } from '@/app/actions/bookings'
import { NotificationRow } from './NotificationRow'

export const dynamic = 'force-dynamic'

type Row = {
  id: string
  type: string | null
  title: string | null
  body: string | null
  action_url: string | null
  read_at: string | null
  created_at: string | null
}

function relativeTime(iso: string | null): string {
  if (!iso) return ''
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return ''
  const diffMs = Date.now() - then
  const mins = Math.round(diffMs / 60_000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.round(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.round(hrs / 24)
  if (days < 7) return `${days}d ago`
  const d = new Date(iso)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export default async function NotificationsPage() {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return (
      <div style={{ padding: 24 }}>
        <p style={{ color: '#AABDE0' }}>Please sign in.</p>
      </div>
    )
  }

  const { data } = await supabase
    .from('notifications')
    .select('id, type, title, body, action_url, read_at, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(50)

  const rows = (data ?? []) as Row[]
  const unread = rows.filter((r) => !r.read_at)

  return (
    <main
      className="rounded-t-rs-lg"
      style={{
        background: '#1A3C6B',
        color: '#fff',
        minHeight: 'calc(100dvh - 64px)',
      }}
    >
      <div className="max-w-md mx-auto px-5 pt-6 pb-10">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 600 }}>Notifications</h1>
            <p style={{ fontSize: 12, color: '#AABDE0', marginTop: 2 }}>
              {unread.length > 0
                ? `${unread.length} unread`
                : 'All caught up'}
            </p>
          </div>
          {unread.length > 0 && (
            <form action={markAllNotificationsRead}>
              <button
                type="submit"
                className="rounded-lg"
                style={{
                  padding: '8px 12px',
                  background: 'rgba(255,255,255,0.08)',
                  color: '#AABDE0',
                  border: '1px solid rgba(170,189,224,0.25)',
                  fontSize: 11,
                  fontWeight: 600,
                  letterSpacing: '0.04em',
                  textTransform: 'uppercase',
                  cursor: 'pointer',
                }}
              >
                Mark all read
              </button>
            </form>
          )}
        </div>

        {rows.length === 0 ? (
          <div
            className="mt-6 rounded-xl text-center"
            style={{
              background: '#2E5099',
              border: '1px solid rgba(170,189,224,0.15)',
              padding: '26px 18px',
            }}
          >
            <p style={{ fontSize: 13, color: '#AABDE0' }}>
              Nothing here yet. We&apos;ll ping you when something happens.
            </p>
          </div>
        ) : (
          <div className="mt-4 flex flex-col gap-2">
            {rows.map((n) => (
              <NotificationRow
                key={n.id}
                id={n.id}
                title={n.title ?? 'Notification'}
                body={n.body ?? ''}
                actionUrl={n.action_url}
                read={Boolean(n.read_at)}
                relative={relativeTime(n.created_at)}
              />
            ))}
          </div>
        )}

        <div className="mt-6 text-center">
          <Link
            href="/app"
            style={{
              fontSize: 12,
              color: '#AABDE0',
              textDecoration: 'underline',
            }}
          >
            ← Back to app
          </Link>
        </div>
      </div>
    </main>
  )
}

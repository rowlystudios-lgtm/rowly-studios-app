import Link from 'next/link'
import type { Metadata } from 'next'
import { requireAdmin, formatDate } from '@/lib/admin-auth'
import { SendNotificationForm } from './SendNotificationForm'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Notifications — RS Admin',
}

type NotificationRow = {
  id: string
  type: string | null
  title: string | null
  body: string | null
  link: string | null
  read_at: string | null
  created_at: string | null
  user_id: string | null
  profiles:
    | {
        full_name: string | null
        first_name: string | null
        last_name: string | null
        avatar_url: string | null
        role: string | null
      }
    | {
        full_name: string | null
        first_name: string | null
        last_name: string | null
        avatar_url: string | null
        role: string | null
      }[]
    | null
}

function initials(raw: string): string {
  const parts = raw.trim().split(/\s+/).slice(0, 2)
  return parts.map((p) => p[0]?.toUpperCase() ?? '').join('') || '?'
}

function unwrap<T>(v: T | T[] | null | undefined): T | null {
  if (v == null) return null
  return Array.isArray(v) ? v[0] ?? null : v
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
  return formatDate(iso)
}

export default async function AdminNotificationsPage() {
  const { supabase } = await requireAdmin()

  const { data } = await supabase
    .from('notifications')
    .select(
      `id, type, title, body, link, read_at, created_at, user_id,
       profiles!notifications_user_id_fkey (full_name, first_name, last_name,
         avatar_url, role)`
    )
    .order('created_at', { ascending: false })
    .limit(20)

  const rows = (data ?? []) as unknown as NotificationRow[]
  const unreadCount = rows.filter((r) => !r.read_at).length

  return (
    <div
      className="mx-auto"
      style={{ maxWidth: 720, padding: '20px 18px 28px' }}
    >
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
        Push an in-app message to talent or clients.
      </p>

      <section className="mt-4">
        <SendNotificationForm />
      </section>

      <section className="mt-6">
        <div className="flex items-center justify-between mb-3">
          <p
            style={{
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              color: '#7A90AA',
            }}
          >
            Recent (last 20)
          </p>
          <span style={{ fontSize: 11, color: '#7A90AA' }}>
            {unreadCount} unread
          </span>
        </div>

        {rows.length === 0 ? (
          <div
            className="rounded-xl bg-[#1A2E4A] border border-white/5 text-center"
            style={{ padding: '28px 20px' }}
          >
            <p style={{ fontSize: 13, color: '#7A90AA' }}>
              No notifications yet. Send your first one above.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {rows.map((n) => {
              const p = unwrap(n.profiles)
              const name =
                [p?.first_name, p?.last_name].filter(Boolean).join(' ') ||
                p?.full_name ||
                'Unknown'
              const isRead = Boolean(n.read_at)
              return (
                <div
                  key={n.id}
                  className="rounded-xl bg-[#1A2E4A] border border-white/5"
                  style={{ padding: 14 }}
                >
                  <div className="flex items-start gap-3">
                    <div
                      className="rounded-full overflow-hidden"
                      style={{
                        width: 36,
                        height: 36,
                        background: '#1E3A6B',
                        color: '#fff',
                        fontSize: 12,
                        fontWeight: 700,
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                      }}
                    >
                      {p?.avatar_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={p.avatar_url}
                          alt=""
                          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        />
                      ) : (
                        initials(name)
                      )}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span
                          style={{ fontSize: 13, color: '#AABDE0' }}
                        >
                          {name}
                        </span>
                        {p?.role && (
                          <span
                            className="rounded-full"
                            style={{
                              padding: '1px 7px',
                              fontSize: 9,
                              fontWeight: 700,
                              letterSpacing: '0.08em',
                              textTransform: 'uppercase',
                              background: 'rgba(170,189,224,0.12)',
                              color: '#AABDE0',
                            }}
                          >
                            {p.role}
                          </span>
                        )}
                      </div>
                      <p
                        className="text-white"
                        style={{
                          fontSize: 14,
                          fontWeight: 500,
                          marginTop: 2,
                        }}
                      >
                        {n.title}
                      </p>
                      <p
                        style={{
                          fontSize: 12,
                          color: '#7A90AA',
                          marginTop: 2,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {n.body}
                      </p>
                    </div>
                    <div
                      className="flex flex-col items-end gap-1.5"
                      style={{ flexShrink: 0 }}
                    >
                      <span style={{ fontSize: 11, color: '#7A90AA' }}>
                        {relativeTime(n.created_at)}
                      </span>
                      <span
                        aria-label={isRead ? 'Read' : 'Unread'}
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: 999,
                          background: isRead
                            ? '#4ADE80'
                            : 'rgba(170,189,224,0.35)',
                        }}
                      />
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}

'use client'

import Link from 'next/link'
import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { clearNotification } from '@/app/admin/notifications/actions'

export type ActivityNotification = {
  id: string
  type: string
  title: string
  body: string | null
  action_url: string | null
  link: string | null
  created_at: string
  priority: string
  user_id: string
  clearable: boolean | null
}

export function ActivityFeedClient({
  notifications,
}: {
  notifications: ActivityNotification[]
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  function handleClear(e: React.MouseEvent, id: string) {
    e.preventDefault()
    e.stopPropagation()
    const fd = new FormData()
    fd.set('id', id)
    startTransition(async () => {
      await clearNotification(fd)
      router.refresh()
    })
  }

  if (notifications.length === 0) {
    return (
      <div
        className="rounded-xl bg-[#1A2E4A] border border-white/5"
        style={{ padding: '18px 16px' }}
      >
        <p className="text-center" style={{ fontSize: 13, color: '#7A90AA' }}>
          No activity in the last 48 hours
        </p>
      </div>
    )
  }

  return (
    <div className="rounded-xl bg-[#1A2E4A] border border-white/5 overflow-hidden">
      {notifications.map((n, i) => {
        const href = n.action_url || n.link || '#'
        const icon = notificationIcon(n.type)
        const dotColor = priorityColor(n.priority)
        return (
          <Link
            key={n.id}
            href={href}
            className="flex items-center gap-3 hover:bg-white/5 transition-colors"
            style={{
              padding: '12px 14px',
              textDecoration: 'none',
              color: '#fff',
              borderTop: i === 0 ? 'none' : '1px solid rgba(255,255,255,0.05)',
            }}
          >
            <div
              className="flex items-center justify-center rounded-full relative"
              style={{
                width: 32,
                height: 32,
                background: '#253D5E',
                flexShrink: 0,
              }}
            >
              <span style={{ fontSize: 14 }} aria-hidden>
                {icon}
              </span>
              {n.priority === 'high' || n.priority === 'urgent' ? (
                <span
                  aria-hidden
                  style={{
                    position: 'absolute',
                    top: -1,
                    right: -1,
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    background: dotColor,
                    border: '1.5px solid #1A2E4A',
                  }}
                />
              ) : null}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p
                className="text-white"
                style={{
                  fontSize: 13,
                  fontWeight: 500,
                  lineHeight: 1.35,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {n.title}
              </p>
              {n.body && (
                <p
                  style={{
                    fontSize: 12,
                    color: '#AABDE0',
                    marginTop: 1,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {n.body}
                </p>
              )}
            </div>
            <div
              className="flex items-center gap-2"
              style={{ flexShrink: 0 }}
            >
              <span style={{ fontSize: 11, color: '#7A90AA' }}>
                {relativeTime(n.created_at)}
              </span>
              <span aria-hidden style={{ color: '#7A90AA', fontSize: 14 }}>
                →
              </span>
              {n.clearable && (
                <button
                  type="button"
                  onClick={(e) => handleClear(e, n.id)}
                  disabled={pending}
                  aria-label="Clear notification"
                  title="Clear"
                  className="text-white/30 hover:text-white/70 transition-colors disabled:opacity-50"
                  style={{
                    background: 'transparent',
                    border: 'none',
                    cursor: pending ? 'wait' : 'pointer',
                    padding: 4,
                    fontSize: 14,
                    lineHeight: 1,
                  }}
                >
                  ✕
                </button>
              )}
            </div>
          </Link>
        )
      })}
    </div>
  )
}

function notificationIcon(type: string): string {
  const t = type.toLowerCase()
  if (t.includes('invoice') || t.includes('payment') || t.includes('paid')) return '$'
  if (t.includes('booking') || t.includes('offer')) return '●'
  if (t.includes('application') || t.includes('signup')) return '+'
  if (t.includes('job') || t.includes('wrap') || t.includes('call_sheet')) return '▸'
  if (t.includes('restricted') || t.includes('alert') || t.includes('warning')) return '!'
  return '•'
}

function priorityColor(priority: string): string {
  if (priority === 'urgent') return '#EF4444'
  if (priority === 'high') return '#F59E0B'
  return '#7A90AA'
}

function relativeTime(iso: string | null): string {
  if (!iso) return ''
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return ''
  const diffSec = Math.max(0, Math.floor((Date.now() - then) / 1000))
  if (diffSec < 60) return 'just now'
  const diffMin = Math.floor(diffSec / 60)
  if (diffMin < 60) return `${diffMin}m ago`
  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24) return `${diffHr}h ago`
  const diffDay = Math.floor(diffHr / 24)
  return `${diffDay}d ago`
}

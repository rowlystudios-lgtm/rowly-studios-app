'use client'

import Link from 'next/link'
import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { dismissApplication } from '@/app/admin/applications/actions'
import { DEPARTMENT_LABELS } from '@/lib/types'

export type PendingApp = {
  id: string
  first_name: string | null
  last_name: string | null
  email: string
  department: string | null
  type: string | null
  created_at: string
}

export function ApplicationsWidgetClient({
  applications,
}: {
  applications: PendingApp[]
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  if (applications.length === 0) return null

  function handleDismiss(id: string) {
    const fd = new FormData()
    fd.set('id', id)
    startTransition(async () => {
      await dismissApplication(fd)
      router.refresh()
    })
  }

  return (
    <section className="mt-6">
      <div
        className="rounded-xl bg-[#1A2E4A] border border-white/5"
        style={{ padding: '16px 18px' }}
      >
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <h2
              className="text-white"
              style={{ fontSize: 16, fontWeight: 600 }}
            >
              Applications
            </h2>
            <span
              className="bg-amber-500 text-white"
              style={{
                fontSize: 11,
                fontWeight: 700,
                padding: '2px 8px',
                borderRadius: 999,
                lineHeight: 1.4,
              }}
            >
              {applications.length}
            </span>
          </div>
          <Link
            href="/admin/applications"
            className="text-amber-400 hover:text-amber-300"
            style={{
              fontSize: 12,
              fontWeight: 600,
              letterSpacing: '0.04em',
              textDecoration: 'none',
            }}
          >
            View all →
          </Link>
        </div>

        {applications.map((app) => {
          const fullName =
            [app.first_name, app.last_name].filter(Boolean).join(' ') ||
            app.email
          const deptLabel = app.department
            ? DEPARTMENT_LABELS[app.department] ?? app.department
            : null
          const meta = [deptLabel, app.email].filter(Boolean).join(' · ')
          return (
            <div
              key={app.id}
              className="flex items-center justify-between gap-3"
              style={{
                padding: '10px 0',
                borderTop: '1px solid rgba(255,255,255,0.05)',
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <p
                  className="text-white"
                  style={{
                    fontSize: 13,
                    fontWeight: 500,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {fullName}
                </p>
                <p
                  style={{
                    fontSize: 11,
                    color: '#AABDE0',
                    marginTop: 1,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {meta || app.email}
                </p>
                <p
                  style={{
                    fontSize: 10,
                    color: '#7A90AA',
                    marginTop: 1,
                  }}
                >
                  {relativeTime(app.created_at)}
                </p>
              </div>
              <div
                className="flex items-center gap-3"
                style={{ flexShrink: 0 }}
              >
                <Link
                  href="/admin/applications"
                  className="text-[#2a72e8] hover:underline"
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    textDecoration: 'none',
                  }}
                >
                  Review
                </Link>
                <button
                  type="button"
                  onClick={() => handleDismiss(app.id)}
                  disabled={pending}
                  aria-label="Dismiss application"
                  title="Dismiss"
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
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
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

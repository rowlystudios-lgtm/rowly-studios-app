'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { createClient } from '@/lib/supabase-browser'
import {
  sendNotification,
  clearNotification,
  clearAllNotifications,
} from './actions'

export type NotificationRow = {
  id: string
  type: string | null
  title: string | null
  body: string | null
  link: string | null
  action_url: string | null
  priority: string | null
  clearable: boolean | null
  cleared_at: string | null
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

function unwrap<T>(v: T | T[] | null | undefined): T | null {
  if (v == null) return null
  return Array.isArray(v) ? (v[0] ?? null) : v
}

function initials(raw: string): string {
  const parts = raw.trim().split(/\s+/).slice(0, 2)
  return parts.map((p) => p[0]?.toUpperCase() ?? '').join('') || '?'
}

function personName(p: NotificationRow['profiles']): string {
  const row = unwrap(p)
  return (
    [row?.first_name, row?.last_name].filter(Boolean).join(' ') ||
    row?.full_name ||
    'Unknown'
  )
}

function relativeTime(iso: string | null): string {
  if (!iso) return ''
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return ''
  const mins = Math.round((Date.now() - then) / 60_000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.round(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.round(hrs / 24)
  return `${days}d ago`
}

function dayKey(iso: string | null): string {
  if (!iso) return 'Earlier'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return 'Earlier'
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const that = new Date(d)
  that.setHours(0, 0, 0, 0)
  const diffDays = Math.round((today.getTime() - that.getTime()) / 86_400_000)
  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return 'Yesterday'
  return d.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  })
}

export function NotificationsClient({ initial }: { initial: NotificationRow[] }) {
  const [rows, setRows] = useState<NotificationRow[]>(initial)

  // Split: queue = clearable + not yet cleared. Log = everything in window.
  const queue = useMemo(
    () => rows.filter((n) => n.clearable && !n.cleared_at),
    [rows]
  )
  const log = rows

  // Group log by day.
  const grouped = useMemo(() => {
    const buckets = new Map<string, NotificationRow[]>()
    for (const n of log) {
      const k = dayKey(n.created_at)
      const arr = buckets.get(k) ?? []
      arr.push(n)
      buckets.set(k, arr)
    }
    // Preserve the ordering: insertion order = created_at desc already.
    return Array.from(buckets.entries())
  }, [log])

  return (
    <>
      <TodoQueue
        items={queue}
        onCleared={(id) =>
          setRows((rs) =>
            rs.map((r) =>
              r.id === id ? { ...r, cleared_at: new Date().toISOString() } : r
            )
          )
        }
        onClearAll={() =>
          setRows((rs) =>
            rs.map((r) =>
              r.clearable && !r.cleared_at
                ? { ...r, cleared_at: new Date().toISOString() }
                : r
            )
          )
        }
      />

      <section className="mt-6">
        <SendForm />
      </section>

      <section className="mt-6">
        <p
          style={{
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            color: '#7A90AA',
            marginBottom: 8,
          }}
        >
          Activity log · last 7 days
        </p>
        {log.length === 0 ? (
          <div
            className="rounded-xl bg-[#1A2E4A] border border-white/5 text-center"
            style={{ padding: '22px 20px' }}
          >
            <p style={{ fontSize: 13, color: '#7A90AA' }}>
              Nothing in the last 7 days.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {grouped.map(([day, items]) => (
              <div key={day}>
                <p
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: '#AABDE0',
                    letterSpacing: '0.04em',
                    marginBottom: 6,
                  }}
                >
                  {day}
                </p>
                <div className="flex flex-col gap-2">
                  {items.map((n) => (
                    <LogRow key={n.id} n={n} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </>
  )
}

/* ─── To-Do Queue ─── */

function TodoQueue({
  items,
  onCleared,
  onClearAll,
}: {
  items: NotificationRow[]
  onCleared: (id: string) => void
  onClearAll: () => void
}) {
  const [pending, startTransition] = useTransition()

  if (items.length === 0) {
    return (
      <section
        className="mt-4 rounded-xl bg-[#1A2E4A] border border-white/5"
        style={{ padding: '18px 16px' }}
      >
        <div className="flex items-center gap-2">
          <span aria-hidden style={{ fontSize: 14 }}>
            ✓
          </span>
          <p style={{ fontSize: 13, color: '#AABDE0', fontWeight: 600 }}>
            Queue empty — nothing needs your attention.
          </p>
        </div>
      </section>
    )
  }

  return (
    <section className="mt-4">
      <div className="flex items-center justify-between mb-2">
        <p
          style={{
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            color: '#F0A500',
          }}
        >
          To-do queue ({items.length})
        </p>
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            startTransition(async () => {
              await clearAllNotifications()
              onClearAll()
            })
          }}
          className="rounded-full border border-white/10 text-white/80 hover:bg-white/5 transition-colors"
          style={{
            padding: '6px 12px',
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
            minHeight: 32,
          }}
        >
          {pending ? '…' : 'Mark all done'}
        </button>
      </div>
      <div className="flex flex-col gap-2">
        {items.map((n) => (
          <QueueRow key={n.id} n={n} onCleared={onCleared} />
        ))}
      </div>
    </section>
  )
}

function QueueRow({
  n,
  onCleared,
}: {
  n: NotificationRow
  onCleared: (id: string) => void
}) {
  const [pending, startTransition] = useTransition()
  const priorityColor =
    n.priority === 'urgent'
      ? '#EF4444'
      : n.priority === 'high'
        ? '#F0A500'
        : '#7A90AA'

  return (
    <div
      className="rounded-xl bg-[#1A2E4A] border border-white/5"
      style={{ padding: 14 }}
    >
      <div className="flex items-start gap-3">
        <span
          aria-hidden
          style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: priorityColor,
            marginTop: 8,
            flexShrink: 0,
          }}
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <p
            className="text-white"
            style={{ fontSize: 14, fontWeight: 500 }}
          >
            {n.title}
          </p>
          {n.body && (
            <p
              style={{
                fontSize: 12,
                color: '#AABDE0',
                marginTop: 2,
                lineHeight: 1.4,
              }}
            >
              {n.body}
            </p>
          )}
          <p
            style={{
              fontSize: 11,
              color: '#7A90AA',
              marginTop: 4,
            }}
          >
            For {personName(n.profiles)} · {relativeTime(n.created_at)}
          </p>
        </div>
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            startTransition(async () => {
              const fd = new FormData()
              fd.set('id', n.id)
              await clearNotification(fd)
              onCleared(n.id)
            })
          }}
          className="rounded-lg bg-green-900/30 hover:bg-green-900/50 text-green-300 transition-colors border border-green-500/30"
          style={{
            padding: '8px 12px',
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
            whiteSpace: 'nowrap',
            flexShrink: 0,
            minHeight: 36,
          }}
        >
          {pending ? '…' : '✓ Done'}
        </button>
      </div>
    </div>
  )
}

/* ─── Activity Log row ─── */

function LogRow({ n }: { n: NotificationRow }) {
  const p = unwrap(n.profiles)
  const name = personName(n.profiles)
  const cleared = Boolean(n.cleared_at)
  const titleStyle: React.CSSProperties = {
    fontSize: 13,
    fontWeight: 500,
    color: cleared ? '#7A90AA' : '#fff',
    textDecoration: cleared ? 'line-through' : 'none',
  }
  const bodyStyle: React.CSSProperties = {
    fontSize: 12,
    color: cleared ? '#5E6E82' : '#AABDE0',
    marginTop: 2,
    textDecoration: cleared ? 'line-through' : 'none',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  }

  return (
    <div
      className="rounded-xl bg-[#132542] border border-white/5"
      style={{ padding: 12, opacity: cleared ? 0.65 : 1 }}
    >
      <div className="flex items-start gap-3">
        <div
          className="rounded-full overflow-hidden"
          style={{
            width: 28,
            height: 28,
            background: '#1E3A6B',
            color: '#fff',
            fontSize: 11,
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
            <span style={{ fontSize: 11.5, color: '#AABDE0' }}>{name}</span>
            {p?.role && (
              <span
                className="rounded-full"
                style={{
                  padding: '1px 7px',
                  fontSize: 9,
                  fontWeight: 700,
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  background: 'rgba(170,189,224,0.1)',
                  color: '#AABDE0',
                }}
              >
                {p.role}
              </span>
            )}
          </div>
          <p style={titleStyle}>{n.title}</p>
          {n.body && <p style={bodyStyle}>{n.body}</p>}
        </div>
        <span style={{ fontSize: 10, color: '#7A90AA', flexShrink: 0 }}>
          {relativeTime(n.created_at)}
        </span>
      </div>
    </div>
  )
}

/* ─── Targeted Send Form (with debounced Specific-person search) ─── */

type SearchHit = {
  id: string
  full_name: string | null
  first_name: string | null
  last_name: string | null
  email: string | null
  avatar_url: string | null
  role: string
}

function SendForm() {
  const supabase = createClient()
  const [target, setTarget] = useState('all_talent')
  const [type, setType] = useState<'booking' | 'job' | 'payment' | 'general'>(
    'general'
  )
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [link, setLink] = useState('')

  // Specific-person search.
  const [query, setQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const [hits, setHits] = useState<SearchHit[]>([])
  const [picked, setPicked] = useState<SearchHit | null>(null)

  const [busy, setBusy] = useState(false)
  const [success, setSuccess] = useState('')
  const [error, setError] = useState('')

  // Debounce search 300ms.
  useEffect(() => {
    if (target !== 'specific') return
    if (picked) return
    const q = query.trim()
    if (q.length < 2) {
      setHits([])
      return
    }
    let cancelled = false
    setSearching(true)
    const timer = setTimeout(async () => {
      const { data } = await supabase
        .from('profiles')
        .select('id, full_name, first_name, last_name, email, avatar_url, role')
        .or(
          `full_name.ilike.%${q}%,first_name.ilike.%${q}%,last_name.ilike.%${q}%,email.ilike.%${q}%`
        )
        .in('role', ['talent', 'client'])
        .limit(8)
      if (cancelled) return
      setHits((data ?? []) as SearchHit[])
      setSearching(false)
    }, 300)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [target, query, picked, supabase])

  const recipientSummary = useMemo(() => {
    switch (target) {
      case 'all_talent':
        return 'every verified talent'
      case 'all_clients':
        return 'every client'
      case 'everyone':
        return 'all talent and clients'
      case 'specific':
        return picked ? pickLabel(picked) : 'one specific person'
    }
    return ''
  }, [target, picked])

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (busy) return
    setBusy(true)
    setSuccess('')
    setError('')

    if (!title.trim() || !body.trim()) {
      setError('Title and message are required.')
      setBusy(false)
      return
    }
    if (target === 'specific' && !picked) {
      setError('Pick a specific recipient first.')
      setBusy(false)
      return
    }

    const fd = new FormData()
    fd.set('target', target)
    fd.set('specific_id', picked?.id ?? '')
    fd.set('type', type)
    fd.set('title', title.trim())
    fd.set('body', body.trim())
    fd.set('link', link.trim())

    try {
      await sendNotification(fd)
      setSuccess('Notification sent ✓')
      setTitle('')
      setBody('')
      setLink('')
      setPicked(null)
      setQuery('')
      setHits([])
      setTimeout(() => setSuccess(''), 3000)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Send failed.'
      setError(msg)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className="bg-white rounded-xl"
      style={{ padding: 20, color: '#1E3A6B' }}
    >
      <p
        style={{
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: '0.14em',
          textTransform: 'uppercase',
          color: '#496275',
          marginBottom: 10,
        }}
      >
        Send a notification
      </p>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Recipient">
          <select
            value={target}
            onChange={(e) => {
              setTarget(e.target.value)
              setPicked(null)
              setQuery('')
              setHits([])
            }}
            className={INPUT_CLS}
          >
            <option value="all_talent">All talent</option>
            <option value="all_clients">All clients</option>
            <option value="everyone">Everyone</option>
            <option value="specific">Specific person…</option>
          </select>
        </Field>
        <Field label="Type">
          <select
            value={type}
            onChange={(e) =>
              setType(
                e.target.value as 'booking' | 'job' | 'payment' | 'general'
              )
            }
            className={INPUT_CLS}
          >
            <option value="general">General</option>
            <option value="booking">Booking</option>
            <option value="job">Job</option>
            <option value="payment">Payment</option>
          </select>
        </Field>
      </div>

      {target === 'specific' && (
        <Field label="Search name or email">
          {picked ? (
            <div
              className="flex items-center gap-3"
              style={{
                padding: 10,
                background: '#F9FAFB',
                border: '1px solid #E5E7EB',
                borderRadius: 8,
              }}
            >
              <span
                className="rounded-full overflow-hidden"
                style={{
                  width: 32,
                  height: 32,
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
                {picked.avatar_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={picked.avatar_url}
                    alt=""
                    style={{
                      width: '100%',
                      height: '100%',
                      objectFit: 'cover',
                    }}
                  />
                ) : (
                  initials(pickLabel(picked))
                )}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 14, fontWeight: 600 }}>
                  {pickLabel(picked)}
                </p>
                <p style={{ fontSize: 12, color: '#6B7280' }}>
                  {picked.email ?? ''}
                </p>
              </div>
              <RoleBadge role={picked.role} />
              <button
                type="button"
                onClick={() => {
                  setPicked(null)
                  setQuery('')
                }}
                style={{
                  fontSize: 11,
                  color: '#6B7280',
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                }}
              >
                Clear
              </button>
            </div>
          ) : (
            <div style={{ position: 'relative' }}>
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Start typing a name or email…"
                className={INPUT_CLS}
                autoComplete="off"
              />
              {query.trim().length >= 2 && (
                <div
                  className="rounded-lg"
                  style={{
                    position: 'absolute',
                    top: '100%',
                    left: 0,
                    right: 0,
                    marginTop: 4,
                    background: '#fff',
                    border: '1px solid #E5E7EB',
                    maxHeight: 260,
                    overflowY: 'auto',
                    zIndex: 20,
                    boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                  }}
                >
                  {searching && (
                    <p
                      style={{
                        padding: 12,
                        fontSize: 12,
                        color: '#6B7280',
                      }}
                    >
                      Searching…
                    </p>
                  )}
                  {!searching && hits.length === 0 && (
                    <p
                      style={{
                        padding: 12,
                        fontSize: 12,
                        color: '#6B7280',
                      }}
                    >
                      No matches.
                    </p>
                  )}
                  {hits.map((h) => (
                    <button
                      key={h.id}
                      type="button"
                      onClick={() => setPicked(h)}
                      className="w-full flex items-center gap-3 text-left hover:bg-gray-50"
                      style={{
                        padding: '10px 12px',
                        border: 'none',
                        background: 'transparent',
                        cursor: 'pointer',
                        borderBottom: '1px solid #F3F4F6',
                      }}
                    >
                      <span
                        className="rounded-full overflow-hidden"
                        style={{
                          width: 32,
                          height: 32,
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
                        {h.avatar_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={h.avatar_url}
                            alt=""
                            style={{
                              width: '100%',
                              height: '100%',
                              objectFit: 'cover',
                            }}
                          />
                        ) : (
                          initials(pickLabel(h))
                        )}
                      </span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: 14, fontWeight: 600 }}>
                          {pickLabel(h)}
                        </p>
                        {h.email && (
                          <p
                            style={{
                              fontSize: 11,
                              color: '#6B7280',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {h.email}
                          </p>
                        )}
                      </div>
                      <RoleBadge role={h.role} />
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </Field>
      )}

      <Field label="Title">
        <input
          type="text"
          required
          maxLength={80}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className={INPUT_CLS}
          placeholder="Job confirmed for May 1"
        />
      </Field>

      <Field label="Message">
        <textarea
          required
          rows={3}
          maxLength={300}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          className={`${INPUT_CLS} resize-y`}
          placeholder="Quick note here…"
        />
      </Field>

      <Field label="Link (optional)">
        <input
          type="text"
          value={link}
          onChange={(e) => setLink(e.target.value)}
          className={INPUT_CLS}
          placeholder="/app/jobs"
        />
      </Field>

      <p
        style={{
          fontSize: 12,
          color: '#496275',
          background: '#F9FAFB',
          padding: '10px 12px',
          borderRadius: 8,
          border: '1px solid #F3F4F6',
          marginBottom: 14,
        }}
      >
        This will notify <strong>{recipientSummary}</strong>.
      </p>

      {error && (
        <p
          className="mt-2 rounded-lg"
          style={{
            fontSize: 13,
            color: '#B91C1C',
            background: 'rgba(239,68,68,0.08)',
            border: '1px solid rgba(239,68,68,0.25)',
            padding: '10px 12px',
          }}
        >
          {error}
        </p>
      )}
      {success && (
        <p
          className="mt-2 rounded-lg"
          style={{
            fontSize: 13,
            color: '#065F46',
            background: 'rgba(16,185,129,0.1)',
            border: '1px solid rgba(16,185,129,0.3)',
            padding: '10px 12px',
          }}
        >
          {success}
        </p>
      )}

      <button
        type="submit"
        disabled={busy}
        className="w-full rounded-xl bg-[#1E3A6B] hover:bg-[#253D8A] text-white transition-colors"
        style={{
          padding: '14px 0',
          fontSize: 15,
          fontWeight: 500,
          cursor: busy ? 'wait' : 'pointer',
          opacity: busy ? 0.7 : 1,
          marginTop: 4,
          minHeight: 44,
        }}
      >
        {busy ? 'Sending…' : 'Send notification'}
      </button>
    </form>
  )
}

function pickLabel(h: SearchHit): string {
  return (
    [h.first_name, h.last_name].filter(Boolean).join(' ') ||
    h.full_name ||
    h.email ||
    'Unnamed'
  )
}

function RoleBadge({ role }: { role: string }) {
  return (
    <span
      className="rounded-full"
      style={{
        padding: '2px 8px',
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        background: '#EEF2FF',
        color: '#1E3A6B',
        flexShrink: 0,
      }}
    >
      {role}
    </span>
  )
}

function Field({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <label className="block" style={{ marginBottom: 14 }}>
      <span
        style={{
          display: 'block',
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
          color: '#496275',
          marginBottom: 6,
        }}
      >
        {label}
      </span>
      {children}
    </label>
  )
}

const INPUT_CLS =
  'block w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-[#1E3A6B] bg-white focus:outline-none focus:ring-2 focus:ring-[#1E3A6B]/30 focus:border-[#1E3A6B]/40 transition'

'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { sendNotification } from './actions'

type UserOption = {
  id: string
  full_name: string | null
  first_name: string | null
  last_name: string | null
  role: string
  client_profiles:
    | { company_name: string | null }
    | { company_name: string | null }[]
    | null
}

function userLabel(u: UserOption): string {
  const cp = Array.isArray(u.client_profiles)
    ? u.client_profiles[0] ?? null
    : u.client_profiles
  const name =
    [u.first_name, u.last_name].filter(Boolean).join(' ') ||
    u.full_name ||
    'Unnamed'
  return cp?.company_name ? `${cp.company_name} · ${name}` : `${name} · ${u.role}`
}

export function SendNotificationForm() {
  const supabase = createClient()
  const [target, setTarget] = useState('all_talent')
  const [specificId, setSpecificId] = useState('')
  const [type, setType] = useState<'booking' | 'job' | 'payment' | 'general'>('general')
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [link, setLink] = useState('')

  const [users, setUsers] = useState<UserOption[]>([])
  const [loadingUsers, setLoadingUsers] = useState(false)

  const [busy, setBusy] = useState(false)
  const [success, setSuccess] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    if (target !== 'specific') return
    if (users.length > 0) return
    let cancelled = false
    async function load() {
      setLoadingUsers(true)
      const { data } = await supabase
        .from('profiles')
        .select(
          `id, full_name, first_name, last_name, role,
           client_profiles (company_name)`
        )
        .in('role', ['talent', 'client'])
        .order('full_name')
      if (cancelled) return
      setUsers((data ?? []) as UserOption[])
      setLoadingUsers(false)
    }
    load()
    return () => {
      cancelled = true
    }
  }, [target, supabase, users.length])

  const recipientSummary = useMemo(() => {
    switch (target) {
      case 'all_talent':
        return 'every verified talent in the roster'
      case 'all_clients':
        return 'every client on the platform'
      case 'everyone':
        return 'all talent and clients'
      case 'specific':
        return 'one specific user'
    }
    return ''
  }, [target])

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
    if (target === 'specific' && !specificId) {
      setError('Pick a recipient.')
      setBusy(false)
      return
    }

    const fd = new FormData()
    fd.set('target', target)
    fd.set('specific_id', specificId)
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
      setSpecificId('')
      setTimeout(() => setSuccess(''), 3000)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Send failed.'
      setError(msg)
    } finally {
      setBusy(false)
    }
  }

  const titleRemaining = 80 - title.length
  const bodyRemaining = 300 - body.length

  return (
    <form
      onSubmit={onSubmit}
      className="bg-white rounded-xl"
      style={{ padding: 20, color: '#1E3A6B' }}
    >
      <div className="grid grid-cols-2 gap-3">
        <Field label="Recipient">
          <select
            value={target}
            onChange={(e) => setTarget(e.target.value)}
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
              setType(e.target.value as 'booking' | 'job' | 'payment' | 'general')
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
        <Field label="Who">
          <select
            value={specificId}
            onChange={(e) => setSpecificId(e.target.value)}
            disabled={loadingUsers}
            className={INPUT_CLS}
            style={loadingUsers ? { background: '#F3F4F6' } : undefined}
          >
            <option value="">
              {loadingUsers ? 'Loading…' : 'Select person'}
            </option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {userLabel(u)}
              </option>
            ))}
          </select>
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
        <p
          style={{
            fontSize: 11,
            color: '#7A90AA',
            marginTop: 4,
            textAlign: 'right',
          }}
        >
          {titleRemaining} chars left
        </p>
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
        <p
          style={{
            fontSize: 11,
            color: '#7A90AA',
            marginTop: 4,
            textAlign: 'right',
          }}
        >
          {bodyRemaining} chars left
        </p>
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
        }}
      >
        {busy ? 'Sending…' : 'Send notification'}
      </button>
    </form>
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

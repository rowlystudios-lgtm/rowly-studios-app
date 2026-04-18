'use client'

import { Suspense, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useAuth } from '@/lib/auth-context'
import {
  PAGE_BG,
  TEXT_PRIMARY,
  TEXT_MUTED,
  LINK_COLOR,
  BUTTON_PRIMARY,
} from '@/components/PageShell'

const CARD_BG = '#2E5099'
const CARD_BORDER = 'rgba(170,189,224,0.15)'

type FormState = {
  title: string
  description: string
  location: string
  start_date: string
  end_date: string
  call_time: string
  day_rate: string
  num_talent: string
  client_notes: string
}

const INITIAL: FormState = {
  title: '',
  description: '',
  location: '',
  start_date: '',
  end_date: '',
  call_time: '08:00',
  day_rate: '',
  num_talent: '1',
  client_notes: '',
}

export default function PostJobPage() {
  return (
    <Suspense fallback={<Shell>Loading…</Shell>}>
      <PostJobInner />
    </Suspense>
  )
}

function PostJobInner() {
  const router = useRouter()
  const params = useSearchParams()
  const { user, supabase } = useAuth()

  const [form, setForm] = useState<FormState>(INITIAL)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [submitted, setSubmitted] = useState(false)

  // Pre-fill note if user came from a specific talent's profile.
  useEffect(() => {
    const talentId = params.get('talent')
    if (!talentId) return
    let cancelled = false
    supabase
      .from('profiles')
      .select('first_name, last_name, full_name')
      .eq('id', talentId)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled || !data) return
        const name =
          [data.first_name, data.last_name].filter(Boolean).join(' ') ||
          data.full_name ||
          'this talent'
        setForm((f) => ({
          ...f,
          client_notes:
            f.client_notes ||
            `Please book ${name} for this job if available.`,
        }))
      })
    return () => {
      cancelled = true
    }
  }, [params, supabase])

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError('')

    if (!user?.id) {
      setError('Not signed in')
      setSaving(false)
      return
    }

    const numTalent = Math.max(1, parseInt(form.num_talent, 10) || 1)
    const dayRateCents = form.day_rate
      ? Math.round(parseFloat(form.day_rate) * 100)
      : null

    const { error } = await supabase.from('jobs').insert({
      client_id: user.id,
      title: form.title.trim(),
      description: form.description.trim() || null,
      location: form.location.trim() || null,
      start_date: form.start_date,
      end_date: form.end_date || form.start_date,
      call_time: form.call_time || null,
      day_rate_cents: dayRateCents,
      num_talent: numTalent,
      client_notes: form.client_notes.trim() || null,
      status: 'submitted',
    })

    setSaving(false)
    if (error) {
      setError(error.message)
      return
    }

    setSubmitted(true)
  }

  if (submitted) {
    return (
      <Shell>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            textAlign: 'center',
            paddingTop: 40,
          }}
        >
          <div
            style={{
              width: 72,
              height: 72,
              borderRadius: 999,
              background: 'rgba(74,222,128,0.18)',
              border: '1px solid rgba(74,222,128,0.35)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: 20,
            }}
          >
            <svg
              width="36"
              height="36"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#4ade80"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="4 12 10 18 20 6" />
            </svg>
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 600 }}>Job submitted</h1>
          <p
            style={{
              fontSize: 13,
              color: TEXT_MUTED,
              marginTop: 10,
              lineHeight: 1.5,
            }}
          >
            We&apos;ll review your request and get back to you within 24 hours.
          </p>
          <button
            type="button"
            onClick={() => router.push('/app')}
            style={{
              marginTop: 28,
              padding: '12px 22px',
              borderRadius: 12,
              background: '#fff',
              color: BUTTON_PRIMARY,
              border: 'none',
              fontSize: 13,
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              cursor: 'pointer',
            }}
          >
            View my jobs →
          </button>
        </div>
      </Shell>
    )
  }

  return (
    <Shell>
      <Link
        href="/app"
        style={{
          fontSize: 11,
          color: TEXT_MUTED,
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          fontWeight: 600,
        }}
      >
        ← Back
      </Link>
      <h1
        style={{
          fontSize: 22,
          fontWeight: 600,
          marginTop: 12,
          marginBottom: 4,
        }}
      >
        Post a job
      </h1>
      <p style={{ fontSize: 12, color: TEXT_MUTED, marginBottom: 20 }}>
        Give us the shape of the job and admin will crew it.
      </p>

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <Section title="About the job">
          <Field label="Job title" required>
            <input
              type="text"
              required
              value={form.title}
              onChange={(e) => update('title', e.target.value)}
              placeholder="Nike SS26 Campaign — Day 1"
              className="rs-input"
            />
          </Field>
          <Field label="Description" required>
            <textarea
              required
              value={form.description}
              onChange={(e) => update('description', e.target.value)}
              placeholder="What does this job involve?"
              rows={4}
              className="rs-input resize-none"
            />
          </Field>
          <Field label="Location" required>
            <input
              type="text"
              required
              value={form.location}
              onChange={(e) => update('location', e.target.value)}
              placeholder="Los Angeles, CA"
              className="rs-input"
            />
          </Field>
        </Section>

        <Section title="When">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <Field label="Start date" required>
              <input
                type="date"
                required
                value={form.start_date}
                onChange={(e) => update('start_date', e.target.value)}
                className="rs-input"
              />
            </Field>
            <Field label="End date">
              <input
                type="date"
                value={form.end_date}
                onChange={(e) => update('end_date', e.target.value)}
                className="rs-input"
              />
            </Field>
          </div>
          <Field label="Call time">
            <input
              type="time"
              value={form.call_time}
              onChange={(e) => update('call_time', e.target.value)}
              className="rs-input"
            />
          </Field>
        </Section>

        <Section title="Crew &amp; rate">
          <Field label="Offered day rate">
            <div style={{ position: 'relative' }}>
              <span
                style={{
                  position: 'absolute',
                  left: 12,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: '#888',
                  pointerEvents: 'none',
                  fontSize: 14,
                }}
              >
                $
              </span>
              <input
                type="number"
                min="0"
                step="25"
                value={form.day_rate}
                onChange={(e) => update('day_rate', e.target.value)}
                placeholder="0"
                className="rs-input"
                style={{ paddingLeft: 24 }}
              />
            </div>
          </Field>
          <Field label="Number of talent needed">
            <input
              type="number"
              min={1}
              value={form.num_talent}
              onChange={(e) => update('num_talent', e.target.value)}
              className="rs-input"
            />
          </Field>
        </Section>

        <Section title="Notes for talent">
          <textarea
            value={form.client_notes}
            onChange={(e) => update('client_notes', e.target.value)}
            placeholder="Anything talent should know — NDA, dress code, parking, key contact."
            rows={4}
            className="rs-input resize-none"
          />
        </Section>

        {error && (
          <p
            style={{
              fontSize: 12,
              color: '#fca5a5',
              background: 'rgba(248,113,113,0.12)',
              border: '1px solid rgba(248,113,113,0.25)',
              borderRadius: 10,
              padding: '10px 12px',
            }}
          >
            {error}
          </p>
        )}

        <div style={{ display: 'flex', gap: 10, paddingTop: 4 }}>
          <Link
            href="/app"
            style={{
              flex: 1,
              padding: '14px 0',
              borderRadius: 12,
              background: 'rgba(255,255,255,0.08)',
              color: TEXT_MUTED,
              textAlign: 'center',
              border: '1px solid rgba(170,189,224,0.2)',
              fontSize: 13,
              fontWeight: 500,
              textDecoration: 'none',
            }}
          >
            Cancel
          </Link>
          <button
            type="submit"
            disabled={saving}
            style={{
              flex: 1,
              padding: '14px 0',
              borderRadius: 12,
              background: '#fff',
              color: BUTTON_PRIMARY,
              border: 'none',
              fontSize: 13,
              fontWeight: 600,
              cursor: saving ? 'wait' : 'pointer',
              opacity: saving ? 0.6 : 1,
            }}
          >
            {saving ? 'Submitting…' : 'Submit job'}
          </button>
        </div>
      </form>
    </Shell>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main
      className="rounded-t-rs-lg"
      style={{
        background: PAGE_BG,
        color: TEXT_PRIMARY,
        minHeight: 'calc(100dvh - 64px)',
      }}
    >
      <div className="max-w-md mx-auto px-5 pt-6 pb-10">{children}</div>
    </main>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p
        style={{
          fontSize: 10,
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          color: TEXT_MUTED,
          marginBottom: 8,
        }}
      >
        {title}
      </p>
      <div
        style={{
          background: CARD_BG,
          border: `1px solid ${CARD_BORDER}`,
          borderRadius: 12,
          padding: 14,
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
        }}
      >
        {children}
      </div>
    </div>
  )
}

function Field({
  label,
  children,
  required,
}: {
  label: string
  children: React.ReactNode
  required?: boolean
}) {
  return (
    <label style={{ display: 'block' }}>
      <span
        style={{
          display: 'block',
          fontSize: 11,
          fontWeight: 600,
          color: TEXT_MUTED,
          marginBottom: 6,
        }}
      >
        {label}
        {required && <span style={{ color: LINK_COLOR }}> *</span>}
      </span>
      {children}
    </label>
  )
}

'use client'

import { useEffect, useState } from 'react'
import { useAuth } from '@/lib/auth-context'
import { PageShell, TEXT_MUTED, TEXT_PRIMARY } from '@/components/PageShell'
import { PasswordInput } from '@/components/PasswordInput'
import { CITY_OPTIONS } from '@/lib/types'

const CARD_BG = '#2E5099'
const CARD_BORDER = 'rgba(170,189,224,0.15)'
const BUTTON_PRIMARY = '#1A3C6B'
const LINK_COLOR = '#AABDE0'

type FormState = {
  first_name: string
  last_name: string
  phone: string
  city: string
  company_name: string
  industry: string
  website: string
  billing_email: string
}

const INITIAL: FormState = {
  first_name: '',
  last_name: '',
  phone: '',
  city: 'Los Angeles',
  company_name: '',
  industry: '',
  website: '',
  billing_email: '',
}

export default function AccountPage() {
  const { user, profile: ctxProfile, supabase, updateProfile } = useAuth()
  const userId = user?.id ?? null

  const [form, setForm] = useState<FormState>(INITIAL)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!userId) return
    let cancelled = false
    async function load() {
      const [profileRes, clientRes] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', userId).maybeSingle(),
        supabase.from('client_profiles').select('*').eq('id', userId).maybeSingle(),
      ])
      if (cancelled) return
      const profile = profileRes.data
      const client = clientRes.data
      setForm({
        first_name:
          profile?.first_name ??
          (profile?.full_name ? profile.full_name.split(' ')[0] : '') ??
          '',
        last_name:
          profile?.last_name ??
          (profile?.full_name ? profile.full_name.split(' ').slice(1).join(' ') : '') ??
          '',
        phone: profile?.phone ?? '',
        city:
          profile?.city && (CITY_OPTIONS as readonly string[]).includes(profile.city)
            ? profile.city
            : 'Los Angeles',
        company_name: client?.company_name ?? '',
        industry: client?.industry ?? '',
        website: client?.website ?? '',
        billing_email: client?.billing_email ?? '',
      })
      setLoading(false)
    }
    load()
    return () => {
      cancelled = true
    }
  }, [supabase, userId])

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setSaved(false)
    setError('')

    if (!userId) {
      setError('Not signed in')
      setSaving(false)
      return
    }

    const first = form.first_name.trim()
    const last = form.last_name.trim()
    const fullName = [first, last].filter(Boolean).join(' ') || null

    const profileUpdate = await supabase
      .from('profiles')
      .update({
        first_name: first || null,
        last_name: last || null,
        full_name: fullName,
        phone: form.phone || null,
        city: form.city || null,
      })
      .eq('id', userId)

    if (profileUpdate.error) {
      setError(profileUpdate.error.message)
      setSaving(false)
      return
    }

    const clientUpsert = await supabase.from('client_profiles').upsert(
      {
        id: userId,
        company_name: form.company_name.trim() || null,
        industry: form.industry.trim() || null,
        website: form.website.trim() || null,
        billing_email: form.billing_email.trim() || null,
      },
      { onConflict: 'id' }
    )

    if (clientUpsert.error) {
      setError(clientUpsert.error.message)
      setSaving(false)
      return
    }

    updateProfile({
      first_name: first || null,
      last_name: last || null,
      full_name: fullName,
      phone: form.phone || null,
      city: form.city || null,
    })

    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 1500)
  }

  if (loading) {
    return (
      <PageShell>
        <p style={{ fontSize: 13, color: TEXT_MUTED }}>Loading…</p>
      </PageShell>
    )
  }

  return (
    <PageShell>
      <h1 style={{ fontSize: 22, fontWeight: 600, marginBottom: 4 }}>Account</h1>
      <p style={{ fontSize: 12, color: TEXT_MUTED, marginBottom: 20 }}>
        Your details and how Rowly Studios bills you.
      </p>

      <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <Section title="You">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <Field label="First name">
              <input
                type="text"
                required
                value={form.first_name}
                onChange={(e) => update('first_name', e.target.value)}
                className="rs-input"
                autoComplete="given-name"
              />
            </Field>
            <Field label="Last name">
              <input
                type="text"
                required
                value={form.last_name}
                onChange={(e) => update('last_name', e.target.value)}
                className="rs-input"
                autoComplete="family-name"
              />
            </Field>
          </div>
          <Field label="Phone">
            <input
              type="tel"
              value={form.phone}
              onChange={(e) => update('phone', e.target.value)}
              placeholder="(310) 555-0100"
              className="rs-input"
              autoComplete="tel"
            />
          </Field>
          <Field label="City">
            <select
              value={form.city}
              onChange={(e) => update('city', e.target.value)}
              className="rs-input"
            >
              {CITY_OPTIONS.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </Field>
        </Section>

        <Section title="Company">
          <Field label="Company name">
            <input
              type="text"
              value={form.company_name}
              onChange={(e) => update('company_name', e.target.value)}
              placeholder="Rowly Studios"
              className="rs-input"
            />
          </Field>
          <Field label="Industry">
            <input
              type="text"
              value={form.industry}
              onChange={(e) => update('industry', e.target.value)}
              placeholder="Fashion, Beauty, Music…"
              className="rs-input"
            />
          </Field>
          <Field label="Website">
            <input
              type="url"
              value={form.website}
              onChange={(e) => update('website', e.target.value)}
              placeholder="https://"
              className="rs-input"
            />
          </Field>
          <Field label="Billing email">
            <input
              type="email"
              value={form.billing_email}
              onChange={(e) => update('billing_email', e.target.value)}
              placeholder="billing@yourcompany.com"
              className="rs-input"
            />
          </Field>
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
          <button
            type="submit"
            disabled={saving}
            style={{
              flex: 1,
              padding: '14px 0',
              borderRadius: 12,
              background: saved ? '#4ade80' : '#fff',
              color: BUTTON_PRIMARY,
              border: 'none',
              fontSize: 13,
              fontWeight: 600,
              cursor: saving ? 'wait' : 'pointer',
              opacity: saving ? 0.6 : 1,
            }}
          >
            {saving ? 'Saving…' : saved ? '✓ Saved' : 'Save changes'}
          </button>
        </div>
      </form>

      <div
        style={{
          borderTop: `1px solid ${CARD_BORDER}`,
          marginTop: 28,
          paddingTop: 20,
        }}
      >
        <p
          style={{
            fontSize: 10,
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.1em',
            color: TEXT_MUTED,
            marginBottom: 10,
          }}
        >
          Account &amp; Security
        </p>
        <ChangePasswordSection
          email={ctxProfile?.email ?? user?.email ?? null}
          supabase={supabase}
        />
      </div>
    </PageShell>
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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
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
      </span>
      {children}
    </label>
  )
}

type ChangeStatus = 'idle' | 'open' | 'verifying' | 'updating' | 'done' | 'error'

function ChangePasswordSection({
  email,
  supabase,
}: {
  email: string | null
  supabase: ReturnType<typeof useAuth>['supabase']
}) {
  const [status, setStatus] = useState<ChangeStatus>('idle')
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [errorMsg, setErrorMsg] = useState('')

  function open() {
    setStatus('open')
    setErrorMsg('')
  }
  function cancel() {
    setStatus('idle')
    setCurrentPassword('')
    setNewPassword('')
    setConfirm('')
    setErrorMsg('')
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErrorMsg('')
    if (!email) {
      setStatus('error')
      setErrorMsg('Could not read your email.')
      return
    }
    if (newPassword.length < 8) {
      setStatus('error')
      setErrorMsg('New password must be at least 8 characters.')
      return
    }
    if (newPassword !== confirm) {
      setStatus('error')
      setErrorMsg('New password and confirmation do not match.')
      return
    }
    if (newPassword === currentPassword) {
      setStatus('error')
      setErrorMsg('New password must be different from the current one.')
      return
    }

    setStatus('verifying')
    const verify = await supabase.auth.signInWithPassword({ email, password: currentPassword })
    if (verify.error) {
      setStatus('error')
      setErrorMsg('Current password is incorrect.')
      return
    }

    setStatus('updating')
    const update = await supabase.auth.updateUser({ password: newPassword })
    if (update.error) {
      setStatus('error')
      setErrorMsg(update.error.message)
      return
    }

    setStatus('done')
    setCurrentPassword('')
    setNewPassword('')
    setConfirm('')
    setTimeout(() => setStatus('idle'), 2500)
  }

  if (status === 'idle' || status === 'done') {
    return (
      <div
        style={{
          background: CARD_BG,
          border: `1px solid ${CARD_BORDER}`,
          borderRadius: 12,
          padding: 14,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div>
            <p style={{ fontSize: 13, fontWeight: 600, color: TEXT_PRIMARY }}>Password</p>
            <p style={{ fontSize: 11, color: TEXT_MUTED, marginTop: 2 }}>
              Keep your account secure.
            </p>
          </div>
          <button
            type="button"
            onClick={open}
            style={{
              padding: '8px 12px',
              borderRadius: 10,
              background: BUTTON_PRIMARY,
              color: '#fff',
              border: 'none',
              fontSize: 11,
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              cursor: 'pointer',
            }}
          >
            Change password
          </button>
        </div>
        {status === 'done' && (
          <p style={{ fontSize: 12, marginTop: 10, color: '#4ade80' }}>
            Password updated successfully.
          </p>
        )}
      </div>
    )
  }

  const busy = status === 'verifying' || status === 'updating'

  return (
    <form
      onSubmit={handleSubmit}
      style={{
        background: CARD_BG,
        border: `1px solid ${CARD_BORDER}`,
        borderRadius: 12,
        padding: 14,
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      }}
    >
      <p style={{ fontSize: 13, fontWeight: 600, color: TEXT_PRIMARY }}>Change password</p>
      <Field label="Current password">
        <PasswordInput
          required
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          autoComplete="current-password"
          disabled={busy}
        />
      </Field>
      <Field label="New password">
        <PasswordInput
          required
          minLength={8}
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          placeholder="Min 8 characters"
          autoComplete="new-password"
          disabled={busy}
        />
      </Field>
      <Field label="Confirm new password">
        <PasswordInput
          required
          minLength={8}
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          autoComplete="new-password"
          disabled={busy}
        />
      </Field>
      {errorMsg && <p style={{ fontSize: 12, color: '#fca5a5' }}>{errorMsg}</p>}
      <div style={{ display: 'flex', gap: 10, paddingTop: 2 }}>
        <button
          type="submit"
          disabled={busy || !currentPassword || !newPassword || !confirm}
          style={{
            padding: '10px 14px',
            borderRadius: 10,
            background: BUTTON_PRIMARY,
            color: '#fff',
            border: 'none',
            fontSize: 11,
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            cursor: busy ? 'wait' : 'pointer',
            opacity: busy ? 0.6 : 1,
          }}
        >
          {status === 'verifying' ? 'Verifying…' : status === 'updating' ? 'Updating…' : 'Update password'}
        </button>
        <button
          type="button"
          onClick={cancel}
          disabled={busy}
          style={{
            background: 'transparent',
            border: 'none',
            color: LINK_COLOR,
            fontSize: 11,
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            textDecoration: 'underline',
            cursor: 'pointer',
          }}
        >
          Cancel
        </button>
      </div>
    </form>
  )
}

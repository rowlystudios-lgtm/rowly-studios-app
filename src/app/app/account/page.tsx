'use client'

import { useEffect, useRef, useState } from 'react'
import { useAuth } from '@/lib/auth-context'
import { Avatar } from '@/components/Avatar'
import { PageShell, TEXT_MUTED, TEXT_PRIMARY } from '@/components/PageShell'
import { PasswordInput } from '@/components/PasswordInput'
import { ShareCodeCard } from '@/components/ShareCodeCard'
import { CITY_OPTIONS } from '@/lib/types'

const CARD_BG = '#2E5099'
const CARD_BORDER = 'rgba(170,189,224,0.2)'
const BUTTON_PRIMARY = '#1A3C6B'
const LINK_COLOR = '#AABDE0'
const AVAILABLE_GREEN = '#4ade80'

const MAX_AVATAR_BYTES = 5 * 1024 * 1024
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp']

type ClientRow = {
  company_name: string | null
  industry: string | null
  website: string | null
  billing_email: string | null
  bio: string | null
  entity_type: string | null
}

const ENTITY_LABELS: Record<string, string> = {
  llc: 'LLC',
  s_corp: 'S-Corp',
  c_corp: 'C-Corp',
  sole_proprietor: 'Sole Proprietor',
  partnership: 'Partnership',
  llp: 'LLP',
  non_profit: 'Non-Profit',
  other: 'Other',
}

function normaliseUrl(raw: string): string {
  const trimmed = raw.trim()
  if (!trimmed) return ''
  if (/^https?:\/\//i.test(trimmed)) return trimmed
  return `https://${trimmed}`
}

function displayHost(url: string): string {
  return url.replace(/^https?:\/\//i, '').replace(/\/$/, '')
}

type ProfileRow = {
  first_name: string | null
  last_name: string | null
  full_name: string | null
  email: string | null
  phone: string | null
  city: string | null
  avatar_url: string | null
  share_code: string | null
}

type AccountData = {
  profile: ProfileRow
  client: ClientRow
}

function emptyClient(): ClientRow {
  return {
    company_name: null,
    industry: null,
    website: null,
    billing_email: null,
    bio: null,
    entity_type: null,
  }
}

export default function AccountPage() {
  const { user, supabase } = useAuth()
  const userId = user?.id ?? null

  const [mode, setMode] = useState<'view' | 'edit'>('view')
  const [data, setData] = useState<AccountData | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')

  const loadData = async () => {
    if (!userId) return
    setLoading(true)
    setLoadError('')
    const [profileRes, clientRes] = await Promise.all([
      supabase
        .from('profiles')
        .select('first_name, last_name, full_name, email, phone, city, avatar_url')
        .eq('id', userId)
        .maybeSingle(),
      supabase
        .from('client_profiles')
        .select('company_name, industry, website, billing_email, bio, entity_type')
        .eq('id', userId)
        .maybeSingle(),
    ])
    if (profileRes.error) {
      setLoadError(profileRes.error.message)
      setLoading(false)
      return
    }
    setData({
      profile: (profileRes.data as ProfileRow | null) ?? {
        first_name: null,
        last_name: null,
        full_name: null,
        email: null,
        phone: null,
        city: null,
        avatar_url: null,
        share_code: null,
      },
      client: (clientRes.data as ClientRow | null) ?? emptyClient(),
    })
    setLoading(false)
  }

  useEffect(() => {
    if (!userId) return
    let cancelled = false
    ;(async () => {
      await loadData()
      if (cancelled) return
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, supabase])

  if (loading) {
    return (
      <PageShell>
        <p style={{ fontSize: 13, color: TEXT_MUTED }}>Loading…</p>
      </PageShell>
    )
  }
  if (loadError) {
    return (
      <PageShell>
        <p style={{ fontSize: 13, color: '#fca5a5' }}>{loadError}</p>
      </PageShell>
    )
  }
  if (!data) {
    return (
      <PageShell>
        <p style={{ fontSize: 13, color: TEXT_MUTED }}>Profile not found.</p>
      </PageShell>
    )
  }

  if (mode === 'edit') {
    return (
      <EditAccount
        initial={data}
        onCancel={() => setMode('view')}
        onSaved={async () => {
          await loadData()
          setMode('view')
        }}
      />
    )
  }

  return <ViewAccount data={data} onEdit={() => setMode('edit')} />
}

/* ──────────── VIEW ──────────── */

function ViewAccount({
  data,
  onEdit,
}: {
  data: AccountData
  onEdit: () => void
}) {
  const { user, supabase } = useAuth()
  const { profile, client } = data

  const name =
    [profile.first_name, profile.last_name].filter(Boolean).join(' ') ||
    profile.full_name ||
    'Your name'

  const entityLabel = client.entity_type ? ENTITY_LABELS[client.entity_type] ?? null : null
  const subline = [entityLabel, profile.city, client.industry].filter(Boolean).join(' · ')

  const billingMatchesAccount =
    client.billing_email && profile.email
      ? client.billing_email.trim().toLowerCase() ===
        profile.email.trim().toLowerCase()
      : false

  return (
    <PageShell>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 4 }}>
        <button
          type="button"
          onClick={onEdit}
          style={{
            background: 'transparent',
            border: 'none',
            color: LINK_COLOR,
            fontSize: 11,
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            fontWeight: 600,
            cursor: 'pointer',
            textDecoration: 'underline',
          }}
        >
          Edit profile
        </button>
      </div>

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          textAlign: 'center',
          marginBottom: 20,
        }}
      >
        <Avatar
          url={profile.avatar_url}
          name={client.company_name ?? name}
          size={96}
        />
        <h1
          style={{
            fontSize: 24,
            fontWeight: 700,
            marginTop: 14,
            color: TEXT_PRIMARY,
            lineHeight: 1.2,
          }}
        >
          {client.company_name || 'Your company'}
        </h1>
        <p style={{ fontSize: 14, color: LINK_COLOR, marginTop: 4 }}>{name}</p>
        {subline && (
          <p style={{ fontSize: 12, color: TEXT_MUTED, marginTop: 4 }}>{subline}</p>
        )}
      </div>

      <Card>
        <Label>About</Label>
        {client.bio ? (
          <p
            style={{
              fontSize: 14,
              lineHeight: 1.5,
              whiteSpace: 'pre-wrap',
              marginTop: 6,
            }}
          >
            {client.bio}
          </p>
        ) : (
          <p style={{ fontSize: 13, color: TEXT_MUTED, marginTop: 6 }}>
            No bio added yet
          </p>
        )}
      </Card>

      <Card>
        <Label>Contact</Label>
        <div
          style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 8 }}
        >
          <ContactRow icon={<MailIcon />}>
            {profile.email ?? '—'}
          </ContactRow>
          {profile.phone && (
            <ContactRow icon={<PhoneIcon />}>{profile.phone}</ContactRow>
          )}
          {client.website && (
            <ContactRow icon={<GlobeIcon />}>
              <a
                href={normaliseUrl(client.website)}
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: TEXT_PRIMARY, textDecoration: 'underline' }}
              >
                {displayHost(client.website)}
              </a>
            </ContactRow>
          )}
        </div>
      </Card>

      <Card>
        <Label>Billing email</Label>
        {client.billing_email ? (
          <p style={{ fontSize: 14, marginTop: 6 }}>
            {billingMatchesAccount ? (
              <span style={{ color: TEXT_MUTED }}>Same as account email</span>
            ) : (
              client.billing_email
            )}
          </p>
        ) : (
          <p style={{ fontSize: 13, color: TEXT_MUTED, marginTop: 6 }}>
            Not set
          </p>
        )}
      </Card>

      <div style={{ marginTop: 20 }}>
        <ShareCodeCard code={profile.share_code ?? null} variant="dark" />
      </div>

      <div style={{ borderTop: `1px solid ${CARD_BORDER}`, marginTop: 28, paddingTop: 20 }}>
        <Label>Account &amp; Security</Label>
        <div style={{ marginTop: 10 }}>
          <ChangePasswordSection
            email={profile.email ?? user?.email ?? null}
            supabase={supabase}
          />
        </div>
      </div>
    </PageShell>
  )
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        background: CARD_BG,
        border: `1px solid ${CARD_BORDER}`,
        borderRadius: 12,
        padding: 14,
        marginBottom: 10,
      }}
    >
      {children}
    </div>
  )
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <span
      style={{
        fontSize: 10,
        fontWeight: 600,
        textTransform: 'uppercase',
        letterSpacing: '0.08em',
        color: TEXT_MUTED,
      }}
    >
      {children}
    </span>
  )
}

function ContactRow({
  icon,
  children,
}: {
  icon: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <span
        style={{
          width: 22,
          height: 22,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: TEXT_MUTED,
          flexShrink: 0,
        }}
      >
        {icon}
      </span>
      <span style={{ fontSize: 14, color: TEXT_PRIMARY, wordBreak: 'break-all' }}>
        {children}
      </span>
    </div>
  )
}

function MailIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M3 7l9 6 9-6" />
    </svg>
  )
}
function PhoneIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.8 19.8 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.94.36 1.86.69 2.73a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.35-1.27a2 2 0 0 1 2.11-.45 12.3 12.3 0 0 0 2.73.69A2 2 0 0 1 22 16.92z" />
    </svg>
  )
}
function GlobeIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" />
    </svg>
  )
}

/* ──────────── EDIT ──────────── */

type FormState = {
  first_name: string
  last_name: string
  phone: string
  city: string
  company_name: string
  entity_type: string
  industry: string
  website: string
  billing_email: string
  bio: string
}

function EditAccount({
  initial,
  onCancel,
  onSaved,
}: {
  initial: AccountData
  onCancel: () => void
  onSaved: () => void | Promise<void>
}) {
  const { user, profile: ctxProfile, supabase, updateProfile, refresh } = useAuth()
  const userId = user?.id ?? null

  const [form, setForm] = useState<FormState>(() => ({
    first_name: initial.profile.first_name ?? '',
    last_name: initial.profile.last_name ?? '',
    phone: initial.profile.phone ?? '',
    city:
      initial.profile.city &&
      (CITY_OPTIONS as readonly string[]).includes(initial.profile.city)
        ? initial.profile.city
        : 'Los Angeles',
    company_name: initial.client.company_name ?? '',
    entity_type: initial.client.entity_type ?? '',
    industry: initial.client.industry ?? '',
    website: initial.client.website ?? '',
    billing_email: initial.client.billing_email ?? '',
    bio: initial.client.bio ?? '',
  }))
  const [avatarUrl, setAvatarUrl] = useState<string | null>(
    initial.profile.avatar_url
  )
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  // avatar upload state
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [avatarUploading, setAvatarUploading] = useState(false)
  const [avatarToast, setAvatarToast] = useState('')
  const [avatarError, setAvatarError] = useState('')

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  function openFilePicker() {
    if (avatarUploading) return
    fileInputRef.current?.click()
  }

  async function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || !userId) return

    setAvatarError('')
    setAvatarToast('')

    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
      setAvatarError('Please use a JPEG, PNG or WebP photo.')
      return
    }
    if (file.size > MAX_AVATAR_BYTES) {
      setAvatarError('Photo must be under 5MB.')
      return
    }

    setAvatarUploading(true)
    const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg'
    const path = `${userId}/avatar.${ext}`

    const upload = await supabase.storage
      .from('avatars')
      .upload(path, file, { upsert: true, contentType: file.type })

    if (upload.error) {
      setAvatarUploading(false)
      setAvatarError(upload.error.message)
      return
    }

    const { data } = supabase.storage.from('avatars').getPublicUrl(path)
    const bustedUrl = `${data.publicUrl}?t=${Date.now()}`

    const save = await supabase
      .from('profiles')
      .update({ avatar_url: bustedUrl })
      .eq('id', userId)

    if (save.error) {
      setAvatarUploading(false)
      setAvatarError(save.error.message)
      return
    }

    setAvatarUrl(bustedUrl)
    updateProfile({ avatar_url: bustedUrl })
    setAvatarUploading(false)
    setAvatarToast('Photo updated')
    setTimeout(() => setAvatarToast(''), 2500)
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
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
        phone: form.phone.trim() || null,
        city: form.city || null,
      })
      .eq('id', userId)

    if (profileUpdate.error) {
      setError(profileUpdate.error.message)
      setSaving(false)
      return
    }

    const normalisedWebsite = normaliseUrl(form.website)
    const clientUpsert = await supabase.from('client_profiles').upsert(
      {
        id: userId,
        company_name: form.company_name.trim() || null,
        entity_type: form.entity_type || null,
        industry: form.industry.trim() || null,
        website: normalisedWebsite || null,
        billing_email: form.billing_email.trim() || null,
        bio: form.bio.trim() || null,
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
      phone: form.phone.trim() || null,
      city: form.city || null,
    })
    await refresh()

    setSaving(false)
    setSaved(true)
    setTimeout(async () => {
      setSaved(false)
      await onSaved()
    }, 1500)
  }

  const displayName =
    [form.first_name, form.last_name].filter(Boolean).join(' ') ||
    ctxProfile?.full_name ||
    ctxProfile?.email ||
    null

  return (
    <PageShell>
      <button
        type="button"
        onClick={onCancel}
        style={{
          fontSize: 11,
          color: TEXT_MUTED,
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          fontWeight: 600,
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
        }}
      >
        ← Back
      </button>
      <h1 style={{ fontSize: 22, fontWeight: 600, marginTop: 12, marginBottom: 4 }}>
        Edit account
      </h1>
      <p style={{ fontSize: 12, color: TEXT_MUTED, marginBottom: 16 }}>
        Your details and how Rowly Studios reaches you.
      </p>

      <div className="flex flex-col items-center" style={{ marginBottom: 20 }}>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
          onChange={handleAvatarChange}
        />
        <button
          type="button"
          onClick={openFilePicker}
          disabled={avatarUploading}
          className="relative rounded-full disabled:opacity-80"
          aria-label="Change photo"
          style={{ width: 80, height: 80 }}
        >
          <Avatar url={avatarUrl} name={displayName} size={80} ring />
          {avatarUploading && (
            <span
              style={{
                position: 'absolute',
                inset: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'rgba(10,10,10,0.55)',
                borderRadius: '9999px',
              }}
            >
              <UploadSpinner />
            </span>
          )}
        </button>
        <button
          type="button"
          onClick={openFilePicker}
          disabled={avatarUploading}
          className="text-[11px] uppercase tracking-wider font-semibold underline mt-3 disabled:opacity-50"
          style={{ color: LINK_COLOR }}
        >
          {avatarUploading ? 'Uploading…' : 'Change photo'}
        </button>
        {avatarToast && (
          <p className="text-[11px] mt-2" style={{ color: AVAILABLE_GREEN }}>
            {avatarToast}
          </p>
        )}
        {avatarError && (
          <p className="text-[11px] mt-2 text-center max-w-xs" style={{ color: '#fca5a5' }}>
            {avatarError}
          </p>
        )}
      </div>

      <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <Section title="About you">
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

        <Section title="Your company">
          <Field label="Company name">
            <input
              type="text"
              required
              value={form.company_name}
              onChange={(e) => update('company_name', e.target.value)}
              placeholder="Rowly Studios"
              className="rs-input"
              autoComplete="organization"
            />
          </Field>
          <Field label="Entity type">
            <select
              value={form.entity_type}
              onChange={(e) => update('entity_type', e.target.value)}
              className="rs-input"
            >
              <option value="">Select entity type…</option>
              <option value="llc">LLC</option>
              <option value="s_corp">S-Corp</option>
              <option value="c_corp">C-Corp</option>
              <option value="sole_proprietor">Sole Proprietor</option>
              <option value="partnership">Partnership</option>
              <option value="llp">LLP</option>
              <option value="non_profit">Non-Profit</option>
              <option value="other">Other</option>
            </select>
          </Field>
          <Field label="Industry">
            <input
              type="text"
              value={form.industry}
              onChange={(e) => update('industry', e.target.value)}
              placeholder="Fashion · Music · Tech…"
              className="rs-input"
            />
          </Field>
          <Field label="Website">
            <input
              type="text"
              value={form.website}
              onChange={(e) => update('website', e.target.value)}
              placeholder="yourcompany.com"
              className="rs-input"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
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
          <Field label="About">
            <textarea
              value={form.bio}
              onChange={(e) => update('bio', e.target.value)}
              placeholder="Tell talent about your company and what you work on."
              rows={4}
              className="rs-input resize-none"
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
            type="button"
            onClick={onCancel}
            disabled={saving || saved}
            style={{
              flex: 1,
              padding: '14px 0',
              borderRadius: 12,
              background: 'rgba(255,255,255,0.08)',
              color: TEXT_MUTED,
              border: '1px solid rgba(170,189,224,0.2)',
              fontSize: 13,
              fontWeight: 500,
              cursor: saving ? 'wait' : 'pointer',
            }}
          >
            Cancel
          </button>
          {saved ? (
            <div
              style={{
                flex: 1,
                padding: '14px 0',
                borderRadius: 12,
                background: AVAILABLE_GREEN,
                color: '#0b3d1a',
                fontSize: 13,
                fontWeight: 600,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
              }}
              aria-live="polite"
            >
              <CheckIcon />
              Saved
            </div>
          ) : (
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
              {saving ? 'Saving…' : 'Save changes'}
            </button>
          )}
        </div>
      </form>
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

function UploadSpinner() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" className="animate-spin" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="#FBF5E4" strokeOpacity="0.35" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="#FBF5E4" strokeWidth="3" strokeLinecap="round" />
    </svg>
  )
}

function CheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <polyline points="4 12 10 18 20 6" />
    </svg>
  )
}

/* ──────────── CHANGE PASSWORD ──────────── */

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
          <p style={{ fontSize: 12, marginTop: 10, color: AVAILABLE_GREEN }}>
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

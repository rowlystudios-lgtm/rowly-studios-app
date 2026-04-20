'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/lib/auth-context'
import { Avatar } from '@/components/Avatar'
import { CITY_OPTIONS, type Department } from '@/lib/types'
import { DEPARTMENTS, deptRoles, type DepartmentKey } from '@/lib/crew-taxonomy'

const MAX_AVATAR_BYTES = 5 * 1024 * 1024 // 5MB
const ALLOWED_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp']

const BG = '#1A3C6B'
const CARD_BG = '#2E5099'
const CARD_BORDER = 'rgba(170, 189, 224, 0.2)'
const TEXT_PRIMARY = '#FFFFFF'
const TEXT_MUTED = '#AABDE0'
const BUTTON_PRIMARY = '#1A3C6B'

type FormState = {
  first_name: string
  last_name: string
  phone: string
  city: string
  department: Department | ''
  primary_role: string
  bio: string
  day_rate: string
  rate_floor_cents: number
  showreel_url: string
  equipment: string
}

const DEFAULT_FLOOR = 450

const INITIAL: FormState = {
  first_name: '',
  last_name: '',
  phone: '',
  city: 'Los Angeles',
  department: '',
  primary_role: '',
  bio: '',
  day_rate: '',
  rate_floor_cents: DEFAULT_FLOOR * 100,
  showreel_url: '',
  equipment: '',
}

export default function EditProfilePage() {
  const router = useRouter()
  const { user, profile: ctxProfile, supabase, updateProfile } = useAuth()
  const userId = user?.id ?? null

  const [form, setForm] = useState<FormState>(INITIAL)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const [editingReel, setEditingReel] = useState(false)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const [avatarUploading, setAvatarUploading] = useState(false)
  const [avatarToast, setAvatarToast] = useState('')
  const [avatarError, setAvatarError] = useState('')

  useEffect(() => {
    if (!userId) return
    let cancelled = false
    async function load() {
      const [{ data: profile }, { data: talent }] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', userId).maybeSingle(),
        supabase.from('talent_profiles').select('*').eq('id', userId).maybeSingle(),
      ])
      if (cancelled) return

      const firstName =
        profile?.first_name ??
        (profile?.full_name ? profile.full_name.split(' ')[0] : '') ??
        ''
      const lastName =
        profile?.last_name ??
        (profile?.full_name ? profile.full_name.split(' ').slice(1).join(' ') : '') ??
        ''

      setForm({
        first_name: firstName,
        last_name: lastName,
        phone: profile?.phone ?? '',
        city:
          profile?.city && (CITY_OPTIONS as readonly string[]).includes(profile.city)
            ? profile.city
            : 'Los Angeles',
        department: (talent?.department as Department) ?? '',
        primary_role: talent?.primary_role ?? '',
        bio: talent?.bio ?? '',
        day_rate: talent?.day_rate_cents ? String(talent.day_rate_cents / 100) : '',
        rate_floor_cents: talent?.rate_floor_cents ?? DEFAULT_FLOOR * 100,
        showreel_url: talent?.showreel_url ?? '',
        equipment: talent?.equipment ?? '',
      })
      setEditingReel(!talent?.showreel_url)
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

  function openFilePicker() {
    if (avatarUploading) return
    fileInputRef.current?.click()
  }

  async function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    // reset the input so choosing the same file again re-fires change
    e.target.value = ''
    if (!file || !userId) return

    setAvatarError('')
    setAvatarToast('')

    if (!ALLOWED_TYPES.includes(file.type)) {
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

    updateProfile({ avatar_url: bustedUrl })
    setAvatarUploading(false)
    setAvatarToast('Photo updated')
    setTimeout(() => setAvatarToast(''), 2500)
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

    // Enforce the platform-wide floor on save. The UI already prevents
    // anything below $300 via input min, but double-check server-bound
    // values in case a talent bypasses the slider min or sends manual JSON.
    const FLOOR_CENTS = 30000
    const dayRateCents = form.day_rate
      ? Math.max(FLOOR_CENTS, Math.round(parseFloat(form.day_rate) * 100))
      : null
    const rateFloorCents = Math.max(FLOOR_CENTS, form.rate_floor_cents)

    const talentUpsert = await supabase.from('talent_profiles').upsert(
      {
        id: userId,
        department: form.department || null,
        primary_role: form.primary_role || null,
        bio: form.bio || null,
        day_rate_cents: dayRateCents,
        rate_floor_cents: rateFloorCents,
        showreel_url: form.showreel_url || null,
        equipment: form.equipment || null,
      },
      { onConflict: 'id' }
    )

    if (talentUpsert.error) {
      setError(talentUpsert.error.message)
      setSaving(false)
      return
    }

    updateProfile({
      first_name: first || null,
      last_name: last || null,
      full_name: fullName,
      city: form.city || null,
      phone: form.phone || null,
    })
    setSaving(false)
    setSaved(true)
    // Navigate immediately — profile page fetches its own fresh data on mount
    router.push('/app/profile')
  }

  if (loading) {
    return (
      <main
        className="rounded-t-rs-lg"
        style={{ background: BG, color: TEXT_PRIMARY, minHeight: 'calc(100dvh - 64px)' }}
      >
        <div className="px-5 py-6 max-w-md mx-auto">
          <p className="text-[12px]" style={{ color: TEXT_MUTED }}>Loading…</p>
        </div>
      </main>
    )
  }

  const rateFloorDollars = Math.round(form.rate_floor_cents / 100)
  // $300 is the platform-wide floor: any talent rate below this is invalid.
  const sliderMin = 300
  const sliderMax = 1000
  const sliderPct = ((rateFloorDollars - sliderMin) / (sliderMax - sliderMin)) * 100

  return (
    <main
      className="rounded-t-rs-lg"
      style={{ background: BG, color: TEXT_PRIMARY, minHeight: 'calc(100dvh - 64px)' }}
    >
      <div className="px-5 py-6 max-w-md mx-auto">
      <Link
        href="/app/profile"
        className="text-[11px] uppercase tracking-wider font-semibold"
        style={{ color: TEXT_MUTED }}
      >
        ← Back to profile
      </Link>
      <h1 className="text-[22px] font-semibold mt-3 mb-1" style={{ color: TEXT_PRIMARY }}>
        Edit profile
      </h1>
      <p
        className="text-[11px] uppercase tracking-widest font-semibold mb-6"
        style={{ color: TEXT_MUTED }}
      >
        The info clients will see
      </p>

      <div className="flex flex-col items-center mb-6">
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
          <Avatar
            url={ctxProfile?.avatar_url ?? null}
            name={[form.first_name, form.last_name].filter(Boolean).join(' ') || ctxProfile?.email || null}
            size={80}
            ring
          />
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
          style={{ color: TEXT_MUTED }}
        >
          {avatarUploading ? 'Uploading…' : 'Change photo'}
        </button>
        {avatarToast && (
          <p className="text-[11px] mt-2" style={{ color: '#4ade80' }}>
            {avatarToast}
          </p>
        )}
        {avatarError && (
          <p className="text-[11px] mt-2 text-center max-w-xs" style={{ color: '#fca5a5' }}>
            {avatarError}
          </p>
        )}
      </div>

      <form onSubmit={handleSave} className="space-y-5">
        <Section title="About you">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="First name">
              <input
                type="text"
                value={form.first_name}
                onChange={(e) => update('first_name', e.target.value)}
                placeholder="Amelia"
                className="rs-input"
                required
                autoComplete="given-name"
              />
            </Field>
            <Field label="Last name">
              <input
                type="text"
                value={form.last_name}
                onChange={(e) => update('last_name', e.target.value)}
                placeholder="Cross"
                className="rs-input"
                required
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
              required
            >
              {CITY_OPTIONS.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </Field>
        </Section>

        <Section title="Your craft">
          <Field label="Department">
            <select
              value={form.department}
              onChange={(e) => {
                const dept = e.target.value as DepartmentKey | ''
                setForm((f) => ({
                  ...f,
                  department: dept as Department | '',
                  // Reset primary_role when department changes so it
                  // matches an option in the new role list.
                  primary_role: dept ? deptRoles(dept)[0] ?? '' : '',
                }))
              }}
              className="rs-input"
              required
            >
              <option value="">Select department…</option>
              {DEPARTMENTS.map((d) => (
                <option key={d.key} value={d.key}>
                  {d.fullLabel}
                </option>
              ))}
            </select>
          </Field>

          {form.department && (() => {
            const roles = deptRoles(form.department)
            const isLegacy =
              form.primary_role !== '' && !roles.includes(form.primary_role)
            return (
              <Field label="Primary role">
                <select
                  value={form.primary_role}
                  onChange={(e) => update('primary_role', e.target.value)}
                  className="rs-input"
                  required
                >
                  <option value="">Select your role…</option>
                  {isLegacy && (
                    <option value={form.primary_role}>
                      {form.primary_role} (current)
                    </option>
                  )}
                  {roles.map((role) => (
                    <option key={role} value={role}>
                      {role}
                    </option>
                  ))}
                </select>
              </Field>
            )
          })()}

          <Field label="Bio">
            <textarea
              value={form.bio}
              onChange={(e) => update('bio', e.target.value)}
              placeholder="A few sentences about your background, style, what you bring to a set."
              rows={4}
              className="rs-input resize-none"
            />
          </Field>
        </Section>

        <Section title="Rates (USD)">
          <Field label="Day rate">
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
                min={300}
                step={25}
                value={form.day_rate}
                onChange={(e) => update('day_rate', e.target.value)}
                placeholder="300"
                className="rs-input"
                style={{ paddingLeft: 24 }}
              />
            </div>
            <p className="text-[10px] mt-1" style={{ color: TEXT_MUTED }}>
              Minimum day rate: $300 (platform-wide floor).
            </p>
          </Field>

          <div>
            <div className="flex items-baseline justify-between">
              <label className="block text-[11px] font-semibold" style={{ color: TEXT_MUTED }}>
                Rate floor
              </label>
              <span
                className="text-[13px] font-bold"
                style={{ color: TEXT_PRIMARY }}
                aria-live="polite"
              >
                ${rateFloorDollars} / day
              </span>
            </div>
            <p
              className="text-[11px] mt-1 mb-3 leading-relaxed"
              style={{ color: TEXT_MUTED }}
            >
              Jobs posted below this rate won&apos;t show your profile to the client.
              Minimum rate floor: $300/day.
            </p>
            <input
              type="range"
              min={sliderMin}
              max={sliderMax}
              step={50}
              value={rateFloorDollars}
              onChange={(e) =>
                update('rate_floor_cents', Math.round(parseInt(e.target.value, 10) * 100))
              }
              aria-label="Rate floor"
              className="w-full rs-range"
              style={
                {
                  ['--rs-range-pct' as string]: `${sliderPct}%`,
                } as React.CSSProperties
              }
            />
            <div
              className="flex justify-between text-[10px] font-semibold mt-1 uppercase tracking-wider"
              style={{ color: TEXT_MUTED }}
            >
              <span>${sliderMin}</span>
              <span>${sliderMax}</span>
            </div>
          </div>
        </Section>

        <Section title="Showreel">
          <p
            className="text-[12px] leading-relaxed -mt-1"
            style={{ color: TEXT_MUTED }}
          >
            Paste your Vimeo or YouTube link — update this whenever your reel changes.
          </p>

          {form.showreel_url && !editingReel ? (
            <div className="flex items-center gap-3 bg-white rounded-[10px] border border-rs-blue-fusion/15 px-3 py-2.5">
              <LinkIcon className="w-4 h-4 text-rs-blue-fusion/60 flex-shrink-0" />
              <span className="flex-1 text-[13px] text-rs-blue-fusion truncate">
                {displayHost(form.showreel_url)}
              </span>
              <button
                type="button"
                onClick={() => setEditingReel(true)}
                className="text-[11px] uppercase tracking-wider font-semibold underline flex-shrink-0"
                style={{ color: '#2E5099' }}
              >
                Change
              </button>
            </div>
          ) : (
            <div style={{ position: 'relative' }}>
              <LinkIcon
                className="w-4 h-4 text-rs-blue-fusion/50"
                style={{
                  position: 'absolute',
                  left: 12,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  pointerEvents: 'none',
                }}
              />
              <input
                type="url"
                value={form.showreel_url}
                onChange={(e) => update('showreel_url', e.target.value)}
                placeholder="https://vimeo.com/your-reel"
                className="rs-input"
                style={{ paddingLeft: 34 }}
                autoComplete="url"
              />
            </div>
          )}
        </Section>

        <Section title="Equipment">
          <Field label="What you bring">
            <textarea
              value={form.equipment}
              onChange={(e) => update('equipment', e.target.value)}
              placeholder="Sony FX6 kit, 18-110 zoom, matte box, own lighting package"
              rows={3}
              className="rs-input resize-none"
            />
          </Field>
        </Section>

        {error && (
          <p
            className="text-[12px] rounded-rs p-3"
            style={{
              color: '#fca5a5',
              background: 'rgba(248, 113, 113, 0.12)',
              border: '1px solid rgba(248, 113, 113, 0.25)',
            }}
          >
            {error}
          </p>
        )}

        <div className="flex gap-2 pt-2">
          <Link href="/app/profile" className="flex-1 text-center rs-btn-ghost rs-btn">
            Cancel
          </Link>
          {saved ? (
            <div
              className="flex-1 rs-btn flex items-center justify-center gap-2"
              style={{ backgroundColor: '#1a7a3e' }}
              aria-live="polite"
            >
              <CheckIcon className="w-4 h-4" />
              Saved
            </div>
          ) : (
            <button type="submit" disabled={saving} className="flex-1 rs-btn disabled:opacity-50">
              {saving ? 'Saving…' : 'Save profile'}
            </button>
          )}
        </div>
      </form>
      </div>
    </main>
  )
}

function displayHost(url: string): string {
  try {
    const u = new URL(url)
    return (u.host + u.pathname).replace(/\/$/, '')
  } catch {
    return url
  }
}

function LinkIcon({ className = '', style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={style}
      aria-hidden
    >
      <path d="M10 14a5 5 0 0 0 7.07 0l3-3a5 5 0 0 0-7.07-7.07l-1.5 1.5" />
      <path d="M14 10a5 5 0 0 0-7.07 0l-3 3a5 5 0 0 0 7.07 7.07l1.5-1.5" />
    </svg>
  )
}

function UploadSpinner() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      className="animate-spin"
      aria-hidden
    >
      <circle cx="12" cy="12" r="9" stroke="#FBF5E4" strokeOpacity="0.35" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="#FBF5E4" strokeWidth="3" strokeLinecap="round" />
    </svg>
  )
}

function CheckIcon({ className = '' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.25"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <polyline points="4 12 10 18 20 6" />
    </svg>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p
        className="text-[10px] uppercase tracking-wider font-semibold mb-2"
        style={{ color: TEXT_MUTED }}
      >
        {title}
      </p>
      <div
        className="rounded-rs p-4 space-y-3"
        style={{ background: CARD_BG, border: `1px solid ${CARD_BORDER}` }}
      >
        {children}
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span
        className="block text-[11px] font-semibold mb-1.5"
        style={{ color: TEXT_MUTED }}
      >
        {label}
      </span>
      {children}
    </label>
  )
}

'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { RSLogo } from '@/components/RSLogo'
import { useAuth } from '@/lib/auth-context'
import {
  PAGE_BG,
  CARD_BG,
  CARD_BORDER,
  TEXT_PRIMARY,
  TEXT_MUTED,
  LINK_COLOR,
} from '@/components/PageShell'

type DeptValue =
  | ''
  | 'photography'
  | 'video'
  | 'styling'
  | 'glam'
  | 'art_direction'
  | 'production'
  | 'lighting'
  | 'post_production'
  | 'sound'
  | 'other'

const DEPARTMENT_OPTIONS: { value: Exclude<DeptValue, ''>; label: string }[] = [
  { value: 'photography', label: 'Photography' },
  { value: 'video', label: 'Video' },
  { value: 'styling', label: 'Styling' },
  { value: 'glam', label: 'Glam (Hair & Makeup)' },
  { value: 'art_direction', label: 'Art Direction' },
  { value: 'production', label: 'Production' },
  { value: 'lighting', label: 'Lighting' },
  { value: 'post_production', label: 'Post Production' },
  { value: 'sound', label: 'Sound' },
  { value: 'other', label: 'Other' },
]

// Bio char limit — matches the spec.
const BIO_MAX = 300
const TOTAL_STEPS = 3

export default function OnboardingPage() {
  const router = useRouter()
  const { user, profile, loading, supabase, updateProfile } = useAuth()

  const [step, setStep] = useState<1 | 2 | 3>(1)

  const [fullName, setFullName] = useState('')
  const [phone, setPhone] = useState('')
  const [city, setCity] = useState('Los Angeles')
  const [department, setDepartment] = useState<DeptValue>('')
  const [primaryRole, setPrimaryRole] = useState('')
  const [bio, setBio] = useState('')
  const [dayRate, setDayRate] = useState('')
  const [rateFloor, setRateFloor] = useState('')
  const [showreelUrl, setShowreelUrl] = useState('')
  const [equipment, setEquipment] = useState('')

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // Auth gate: boot out if unsigned; skip wizard if already onboarded.
  useEffect(() => {
    if (loading) return
    if (!user) {
      router.replace('/login')
      return
    }
    if (profile?.onboarded === true) {
      router.replace('/app/jobs')
    }
  }, [loading, user, profile, router])

  const firstName = fullName.trim().split(/\s+/)[0] ?? ''
  const canNextStep1 = fullName.trim().length > 0
  const canNextStep2 = department !== ''

  async function save(markOnboarded: boolean) {
    if (!user?.id || saving) return
    setSaving(true)
    setError('')

    const trimmedFullName = fullName.trim()
    const nameParts = trimmedFullName.split(/\s+/).filter(Boolean)
    const firstNamePart = nameParts[0] ?? null
    const lastNamePart = nameParts.slice(1).join(' ') || null

    // Department: the spec's `post_production` maps to the canonical
    // `post` value used throughout the rest of the app and DB.
    const dbDepartment =
      department === 'post_production' ? 'post' : department || null

    const dayRateCents = dayRate.trim()
      ? Math.max(30000, Math.round(parseFloat(dayRate) * 100))
      : null
    const rateFloorCents = rateFloor.trim()
      ? Math.max(30000, Math.round(parseFloat(rateFloor) * 100))
      : null

    const profilePatch: Record<string, unknown> = {
      full_name: trimmedFullName || null,
      first_name: firstNamePart,
      last_name: lastNamePart,
      phone: phone.trim() || null,
      city: city.trim() || null,
    }

    const profileUpdate = await supabase
      .from('profiles')
      .update(profilePatch)
      .eq('id', user.id)

    if (profileUpdate.error) {
      setSaving(false)
      setError(profileUpdate.error.message)
      return
    }

    const talentUpsert = await supabase.from('talent_profiles').upsert(
      {
        id: user.id,
        department: dbDepartment,
        primary_role: primaryRole.trim() || null,
        bio: bio.trim() || null,
        day_rate_cents: dayRateCents,
        rate_floor_cents: rateFloorCents,
        showreel_url: showreelUrl.trim() || null,
        equipment: equipment.trim() || null,
      },
      { onConflict: 'id' }
    )

    if (talentUpsert.error) {
      setSaving(false)
      setError(talentUpsert.error.message)
      return
    }

    // Best-effort onboarded flag. If the column doesn't exist yet, don't
    // block the user on it — the main profile + talent data is saved.
    if (markOnboarded) {
      const flag = await supabase
        .from('profiles')
        .update({ onboarded: true })
        .eq('id', user.id)
      if (!flag.error) {
        updateProfile({ onboarded: true })
      }
    }

    updateProfile({
      full_name: trimmedFullName || null,
      first_name: firstNamePart,
      last_name: lastNamePart,
      phone: phone.trim() || null,
      city: city.trim() || null,
    })

    router.replace('/app/jobs')
  }

  function goNext() {
    if (step === 1 && !canNextStep1) return
    if (step === 2 && !canNextStep2) return
    if (step < TOTAL_STEPS) setStep((s) => (s + 1) as 1 | 2 | 3)
  }

  function goBack() {
    if (step > 1) setStep((s) => (s - 1) as 1 | 2 | 3)
  }

  if (loading || !user) {
    return (
      <main
        style={{
          minHeight: '100dvh',
          background: PAGE_BG,
          color: TEXT_MUTED,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 13,
        }}
      >
        Loading…
      </main>
    )
  }

  return (
    <main
      style={{
        minHeight: '100dvh',
        background: PAGE_BG,
        color: TEXT_PRIMARY,
      }}
    >
      <div className="max-w-md mx-auto px-5 pt-8 pb-12 relative">
        {/* Skip button — top-right on steps 2 and 3 only */}
        {step > 1 && (
          <button
            type="button"
            onClick={() => save(true)}
            disabled={saving}
            className="absolute top-8 right-5 text-[11px] uppercase tracking-wider underline disabled:opacity-50"
            style={{ color: LINK_COLOR }}
          >
            {saving ? 'Saving…' : 'Skip'}
          </button>
        )}

        {/* RS mark */}
        <div className="flex justify-center mb-5">
          <RSLogo size={40} />
        </div>

        {/* Step indicator */}
        <p
          className="text-center text-[10px] uppercase tracking-[0.2em] font-semibold"
          style={{ color: TEXT_MUTED }}
        >
          Step {step} of {TOTAL_STEPS}
        </p>
        <div className="flex justify-center gap-2 mt-2 mb-8" aria-hidden>
          {[1, 2, 3].map((n) => {
            const active = n === step
            return (
              <span
                key={n}
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 999,
                  background: active ? '#FFFFFF' : 'rgba(170,189,224,0.3)',
                }}
              />
            )
          })}
        </div>

        {step === 1 && (
          <section>
            <h1
              className="text-[22px] font-semibold text-center mb-1"
              style={{ color: TEXT_PRIMARY }}
            >
              Who are you?
            </h1>
            <p
              className="text-[12px] text-center leading-relaxed mb-6"
              style={{ color: TEXT_MUTED }}
            >
              The basics we&apos;ll show on your profile.
            </p>

            <div
              className="rounded-rs p-4 space-y-3"
              style={{ background: CARD_BG, border: `1px solid ${CARD_BORDER}` }}
            >
              <Field label="Full name" required>
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Amelia Cross"
                  className="rs-input"
                  autoComplete="name"
                  required
                />
              </Field>
              <Field label="Phone">
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="(310) 555-0100"
                  className="rs-input"
                  autoComplete="tel"
                />
              </Field>
              <Field label="City">
                <input
                  type="text"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  placeholder="Los Angeles"
                  className="rs-input"
                  autoComplete="address-level2"
                />
              </Field>
            </div>
          </section>
        )}

        {step === 2 && (
          <section>
            <h1
              className="text-[22px] font-semibold text-center mb-1"
              style={{ color: TEXT_PRIMARY }}
            >
              {firstName
                ? `Let's get you set up, ${firstName}`
                : 'What do you do?'}
            </h1>
            <p
              className="text-[12px] text-center leading-relaxed mb-6"
              style={{ color: TEXT_MUTED }}
            >
              Tell us about your craft so we can match you to jobs.
            </p>

            <div
              className="rounded-rs p-4 space-y-3"
              style={{ background: CARD_BG, border: `1px solid ${CARD_BORDER}` }}
            >
              <Field label="Department" required>
                <select
                  value={department}
                  onChange={(e) => setDepartment(e.target.value as DeptValue)}
                  className="rs-input"
                  required
                >
                  <option value="">Select department…</option>
                  {DEPARTMENT_OPTIONS.map((d) => (
                    <option key={d.value} value={d.value}>
                      {d.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Primary role">
                <input
                  type="text"
                  value={primaryRole}
                  onChange={(e) => setPrimaryRole(e.target.value)}
                  placeholder="Director of Photography"
                  className="rs-input"
                />
              </Field>
              <Field label="Bio">
                <textarea
                  value={bio}
                  onChange={(e) => {
                    const next = e.target.value.slice(0, BIO_MAX)
                    setBio(next)
                  }}
                  rows={4}
                  placeholder="A few sentences about your background and style."
                  className="rs-input resize-none"
                  maxLength={BIO_MAX}
                />
                <p
                  className="text-[10px] mt-1"
                  style={{ color: TEXT_MUTED }}
                >
                  {bio.length}/{BIO_MAX}
                </p>
              </Field>
            </div>
          </section>
        )}

        {step === 3 && (
          <section>
            <h1
              className="text-[22px] font-semibold text-center mb-1"
              style={{ color: TEXT_PRIMARY }}
            >
              Your rates
            </h1>
            <p
              className="text-[12px] text-center leading-relaxed mb-6"
              style={{ color: TEXT_MUTED }}
            >
              You can adjust these any time from your profile.
            </p>

            <div
              className="rounded-rs p-4 space-y-3"
              style={{ background: CARD_BG, border: `1px solid ${CARD_BORDER}` }}
            >
              <Field label="Day rate">
                <div style={{ position: 'relative' }}>
                  <span
                    aria-hidden
                    style={{
                      position: 'absolute',
                      left: 12,
                      top: '50%',
                      transform: 'translateY(-50%)',
                      color: 'rgba(73,98,117,0.6)',
                      fontSize: 14,
                      pointerEvents: 'none',
                    }}
                  >
                    $
                  </span>
                  <input
                    type="number"
                    min={300}
                    step={25}
                    value={dayRate}
                    onChange={(e) => setDayRate(e.target.value)}
                    placeholder="300"
                    className="rs-input"
                    style={{ paddingLeft: 24 }}
                  />
                </div>
              </Field>
              <Field label="Rate floor">
                <div style={{ position: 'relative' }}>
                  <span
                    aria-hidden
                    style={{
                      position: 'absolute',
                      left: 12,
                      top: '50%',
                      transform: 'translateY(-50%)',
                      color: 'rgba(73,98,117,0.6)',
                      fontSize: 14,
                      pointerEvents: 'none',
                    }}
                  >
                    $
                  </span>
                  <input
                    type="number"
                    min={300}
                    step={25}
                    value={rateFloor}
                    onChange={(e) => setRateFloor(e.target.value)}
                    placeholder="300"
                    className="rs-input"
                    style={{ paddingLeft: 24 }}
                  />
                </div>
                <p className="text-[11px] mt-1" style={{ color: 'rgba(73,98,117,0.7)' }}>
                  The minimum rate you&apos;ll accept for a day&apos;s work. We
                  won&apos;t offer you jobs below this. You can change it
                  anytime.
                </p>
              </Field>
              <p className="text-[10px]" style={{ color: TEXT_MUTED }}>
                Minimum day rate $300 · Minimum rate floor $300
              </p>
              <Field label="Showreel URL">
                <input
                  type="url"
                  value={showreelUrl}
                  onChange={(e) => setShowreelUrl(e.target.value)}
                  placeholder="https://vimeo.com/your-reel"
                  className="rs-input"
                  autoComplete="url"
                />
              </Field>
              <Field label="Equipment">
                <textarea
                  value={equipment}
                  onChange={(e) => setEquipment(e.target.value)}
                  rows={3}
                  placeholder="Sony FX6 kit, 18-110 zoom, own lighting package"
                  className="rs-input resize-none"
                />
              </Field>
            </div>
          </section>
        )}

        {error && (
          <p
            className="text-[12px] rounded-rs p-3 mt-4"
            style={{
              color: '#fca5a5',
              background: 'rgba(248, 113, 113, 0.12)',
              border: '1px solid rgba(248, 113, 113, 0.25)',
            }}
          >
            {error}
          </p>
        )}

        {/* Navigation */}
        <div className="flex gap-2 mt-6">
          {step > 1 ? (
            <button
              type="button"
              onClick={goBack}
              disabled={saving}
              className="flex-1 rs-btn rs-btn-ghost disabled:opacity-50"
              style={{ color: TEXT_MUTED, borderColor: 'rgba(170,189,224,0.3)' }}
            >
              Back
            </button>
          ) : (
            <div className="flex-1" />
          )}

          {step < TOTAL_STEPS ? (
            <button
              type="button"
              onClick={goNext}
              disabled={(step === 1 && !canNextStep1) || (step === 2 && !canNextStep2)}
              className="flex-1 rs-btn disabled:opacity-50"
            >
              Next
            </button>
          ) : (
            <button
              type="button"
              onClick={() => save(true)}
              disabled={saving}
              className="flex-1 rs-btn disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Finish setup'}
            </button>
          )}
        </div>
      </div>
    </main>
  )
}

function Field({
  label,
  required,
  children,
}: {
  label: string
  required?: boolean
  children: React.ReactNode
}) {
  return (
    <label className="block">
      <span
        className="block text-[11px] font-semibold mb-1.5"
        style={{ color: TEXT_MUTED }}
      >
        {label}
        {required && <span style={{ color: '#fca5a5', marginLeft: 4 }}>*</span>}
      </span>
      {children}
    </label>
  )
}

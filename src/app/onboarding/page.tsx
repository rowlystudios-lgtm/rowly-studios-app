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
import RateFloorSlider from '@/components/ui/RateFloorSlider'

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

const ALLOWED_DEPARTMENTS = [
  'photography', 'video', 'styling', 'glam', 'art_direction',
  'production', 'lighting', 'post_production', 'sound', 'other',
] as const

const CITIES = [
  'Los Angeles',
  'New York',
  'San Francisco',
  'Austin',
  'Atlanta',
] as const

// Bio char limit — matches the spec.
const BIO_MAX = 300
const TOTAL_STEPS = 4

export default function OnboardingPage() {
  const router = useRouter()
  const { user, profile, loading, supabase, updateProfile } = useAuth()

  const [step, setStep] = useState<1 | 2 | 3 | 4>(1)

  const [fullName, setFullName] = useState('')
  const [countryCode, setCountryCode] = useState<string>('+1')
  const [phoneNumber, setPhoneNumber] = useState('')
  const [city, setCity] = useState<string>('')
  const [department, setDepartment] = useState<DeptValue>('')
  const [primaryRole, setPrimaryRole] = useState('')
  const [bio, setBio] = useState('')
  const [dayRate, setDayRate] = useState('')
  const [rateFloorCents, setRateFloorCents] = useState<number>(45000)
  const [showreelUrl, setShowreelUrl] = useState('')
  const [equipment, setEquipment] = useState('')

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [rateError, setRateError] = useState<string>('')

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

  // Auto-clamp the rate floor down when the user enters a day rate
  // lower than the current floor — prevents the cross-field error and
  // keeps the slider's effective ceiling tied to day rate.
  useEffect(() => {
    if (!dayRate.trim()) return
    const dayNum = parseFloat(dayRate)
    if (!Number.isFinite(dayNum)) return
    const dayCents = Math.round(dayNum * 100)
    if (dayCents >= 30000 && rateFloorCents > dayCents) {
      setRateFloorCents(dayCents)
    }
  }, [dayRate, rateFloorCents])

  const firstName = fullName.trim().split(/\s+/)[0] ?? ''
  const phoneDigits = phoneNumber.replace(/\D/g, '')
  const phoneValid =
    !phoneNumber ||
    (countryCode === '+1'
      ? phoneDigits.length === 10
      : phoneDigits.length >= 7 && phoneDigits.length <= 12)
  const canNextStep1 =
    fullName.trim().length > 0 && city !== '' && phoneValid
  const canNextStep2 = department !== ''

  async function save(
    markOnboarded: boolean,
    redirectTo: 'app' | 'stripe' = 'app'
  ) {
    if (!user?.id || saving) return
    setSaving(true)
    setError('')

    const trimmedFullName = fullName.trim()
    const nameParts = trimmedFullName.split(/\s+/).filter(Boolean)
    const firstNamePart = nameParts[0] ?? null
    const lastNamePart = nameParts.slice(1).join(' ') || null

    const dbDepartment = department || null

    if (dbDepartment && !ALLOWED_DEPARTMENTS.includes(dbDepartment as any)) {
      setError('Please go back and select a valid department.')
      setSaving(false)
      return
    }

    if (!city || !CITIES.includes(city as any)) {
      setError('Please select your city.')
      setSaving(false)
      return
    }

    const fullPhone = phoneNumber ? `${countryCode}${phoneDigits}` : null

    const dayRateNum = dayRate.trim() ? parseFloat(dayRate) : null

    if (dayRateNum !== null && (Number.isNaN(dayRateNum) || dayRateNum < 300)) {
      setRateError('Day rate must be at least $300.')
      setSaving(false)
      return
    }

    const dayRateCents = dayRateNum !== null ? Math.round(dayRateNum * 100) : null

    if (rateFloorCents < 30000 || rateFloorCents > 150000) {
      setRateError('Rate floor must be between $300 and $1,500.')
      setSaving(false)
      return
    }
    if (dayRateCents !== null && rateFloorCents > dayRateCents) {
      setRateError('Rate floor cannot be higher than your day rate.')
      setSaving(false)
      return
    }
    setRateError('')

    const trimmedShowreel = showreelUrl.trim()
    const fullShowreelUrl = trimmedShowreel
      ? `https://${trimmedShowreel.replace(/^https?:\/\//i, '')}`
      : null

    const profilePatch: Record<string, unknown> = {
      full_name: trimmedFullName || null,
      first_name: firstNamePart,
      last_name: lastNamePart,
      phone: fullPhone,
      city: city,
    }

    const profileUpdate = await supabase
      .from('profiles')
      .update(profilePatch)
      .eq('id', user.id)

    if (profileUpdate.error) {
      setSaving(false)
      const msg0 = profileUpdate.error.message
      console.error('Onboarding profile error:', msg0)
      if (msg0.includes('department_check')) {
        setError('Please go back and select your department.')
      } else if (msg0.includes('day_rate') || msg0.includes('rate_floor')) {
        setError('Please check your rates — minimum day rate is $300.')
      } else {
        setError('Something went wrong. Please try again or contact support.')
      }
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
        showreel_url: fullShowreelUrl,
        equipment: equipment.trim() || null,
      },
      { onConflict: 'id' }
    )

    if (talentUpsert.error) {
      setSaving(false)
      const msg1 = talentUpsert.error.message
      console.error('Onboarding talent error:', msg1)
      if (msg1.includes('department_check')) {
        setError('Please go back and select your department.')
      } else if (msg1.includes('day_rate') || msg1.includes('rate_floor')) {
        setError('Please check your rates — minimum day rate is $300.')
      } else {
        setError('Something went wrong. Please try again or contact support.')
      }
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
      phone: fullPhone,
      city: city,
    })

    if (redirectTo === 'stripe') {
      window.location.href = '/api/stripe/connect/onboarding'
    } else {
      router.replace('/app/jobs')
    }
  }

  function goNext() {
    if (step === 1 && !canNextStep1) return
    if (step === 2 && !canNextStep2) return
    if (step < TOTAL_STEPS) setStep((s) => (s + 1) as 1 | 2 | 3 | 4)
  }

  function goBack() {
    if (step > 1) setStep((s) => (s - 1) as 1 | 2 | 3 | 4)
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
        {/* Skip button — top-right on steps 2-4. On steps 2-3 it
            advances to step 4 (Stripe setup); on step 4 it completes
            onboarding without connecting Stripe. */}
        {step > 1 && (
          <button
            type="button"
            onClick={() => {
              if (step === 4) {
                save(true)
              } else {
                setStep(4)
              }
            }}
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
          {[1, 2, 3, 4].map((n) => {
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
              <div className="space-y-1">
                <label
                  className="block text-[11px] font-semibold mb-1.5"
                  style={{ color: TEXT_MUTED }}
                >
                  Phone
                </label>
                <div className="flex gap-2 w-full">
                  <select
                    value={countryCode}
                    onChange={(e) => setCountryCode(e.target.value)}
                    className="rs-input flex-shrink-0"
                    style={{ width: '100px' }}
                  >
                    <option value="+1">🇺🇸 +1</option>
                    <option value="+44">🇬🇧 +44</option>
                    <option value="+61">🇦🇺 +61</option>
                    <option value="+33">🇫🇷 +33</option>
                    <option value="+49">🇩🇪 +49</option>
                    <option value="+52">🇲🇽 +52</option>
                  </select>
                  <input
                    type="tel"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    placeholder="3105550100"
                    value={phoneNumber}
                    onChange={(e) =>
                      setPhoneNumber(e.target.value.replace(/\D/g, ''))
                    }
                    autoComplete="tel-national"
                    className="rs-input flex-1 min-w-0"
                  />
                </div>
              </div>
              <Field label="City" required>
                <select
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  className="rs-input w-full"
                  required
                >
                  <option value="">Select your city</option>
                  {CITIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
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
                    inputMode="numeric"
                    value={dayRate}
                    onChange={(e) => {
                      setDayRate(e.target.value)
                      if (rateError) setRateError('')
                    }}
                    onBlur={(e) => {
                      const v = e.target.value.trim()
                      if (!v) return
                      const n = parseFloat(v)
                      if (Number.isFinite(n) && n < 300) setDayRate('300')
                    }}
                    placeholder="500"
                    className="rs-input"
                    style={{ paddingLeft: 24 }}
                  />
                </div>
              </Field>
              <RateFloorSlider
                value={rateFloorCents}
                onChange={(cents) => {
                  setRateFloorCents(cents)
                  if (rateError) setRateError('')
                }}
              />
              {rateError && (
                <p
                  role="alert"
                  style={{
                    margin: '8px 0 0 0',
                    fontSize: 13,
                    color: '#C23B22',
                    fontFamily: "'DM Sans',Helvetica,Arial,sans-serif",
                  }}
                >
                  {rateError}
                </p>
              )}
              <Field label="Showreel URL">
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40 text-sm select-none pointer-events-none">
                    https://
                  </span>
                  <input
                    type="text"
                    placeholder="vimeo.com/123456789"
                    value={showreelUrl}
                    onChange={(e) =>
                      setShowreelUrl(e.target.value.replace(/^https?:\/\//i, ''))
                    }
                    className="rs-input w-full pl-[72px]"
                  />
                </div>
                <p className="text-xs text-white/50 leading-relaxed mt-2">
                  For best results, upload a{' '}
                  <strong className="text-white/70">4×5 vertical edit</strong> of
                  your reel — this format displays optimally across the platform.
                </p>
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

        {step === 4 && (
          <section>
            <div className="flex justify-center items-center gap-2 mb-6">
              <span
                style={{
                  fontSize: 32,
                  fontWeight: 800,
                  color: '#635BFF',
                  letterSpacing: '-0.5px',
                  fontFamily: 'system-ui, sans-serif',
                }}
              >
                ⚡ stripe
              </span>
            </div>

            <h1
              className="text-[22px] font-semibold text-center mb-2"
              style={{ color: TEXT_PRIMARY }}
            >
              Get paid, effortlessly.
            </h1>
            <p
              className="text-[13px] text-center leading-relaxed mb-6"
              style={{ color: TEXT_MUTED }}
            >
              We use Stripe — the secure, industry-standard payment platform —
              to make sure you get paid on time, every time. Setting up takes
              just a few minutes and keeps your earnings protected.
            </p>

            <div className="space-y-3">
              <button
                type="button"
                onClick={() => save(true, 'stripe')}
                disabled={saving}
                className="w-full rs-btn disabled:opacity-50"
              >
                {saving ? 'Saving…' : 'Connect Stripe now →'}
              </button>
              <button
                type="button"
                onClick={() => save(true)}
                disabled={saving}
                className="w-full rs-btn rs-btn-ghost disabled:opacity-50"
                style={{
                  color: TEXT_MUTED,
                  borderColor: 'rgba(170,189,224,0.3)',
                }}
              >
                {saving ? 'Saving…' : "I'll do this later"}
              </button>
            </div>

            <p
              className="text-[11px] text-center leading-relaxed mt-5"
              style={{ color: TEXT_MUTED }}
            >
              You can connect Stripe any time from your profile settings. Note:
              you&apos;ll need an active Stripe account to accept your first
              booking.
            </p>
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

          {step === 4 ? (
            // Step 4 has its own action buttons inside the card —
            // no right-side Next/Finish here. Back (left) still works.
            <div className="flex-1" />
          ) : (
            <button
              type="button"
              onClick={goNext}
              disabled={(step === 1 && !canNextStep1) || (step === 2 && !canNextStep2)}
              className="flex-1 rs-btn disabled:opacity-50"
            >
              Next
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

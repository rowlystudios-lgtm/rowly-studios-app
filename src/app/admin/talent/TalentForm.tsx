'use client'

import { useState } from 'react'
import Link from 'next/link'
import { removeFromRoster } from './actions'

export type TalentFormInitial = {
  id?: string
  email?: string
  first_name?: string
  last_name?: string
  phone?: string | null
  city?: string | null
  department?: string | null
  primary_role?: string | null
  secondary_roles?: string[] | null
  day_rate_cents?: number | null
  half_day_rate_cents?: number | null
  rate_floor_cents?: number | null
  bio?: string | null
  showreel_url?: string | null
  equipment?: string | null
  travel_radius_miles?: number | null
  union_eligible?: boolean | null
  verified?: boolean
}

const DEPARTMENT_OPTIONS = [
  { key: 'Photography', label: 'Photography' },
  { key: 'Video', label: 'Video' },
  { key: 'Production', label: 'Production' },
  { key: 'Styling', label: 'Styling' },
  { key: 'MUA', label: 'MUA' },
  { key: 'Other', label: 'Other' },
]

const SECONDARY_ROLE_OPTIONS = [
  'Photography',
  'Video',
  'Production',
  'Styling',
  'MUA',
  'Editing',
  'Sound',
  'Lighting',
  'Art Direction',
]

export function TalentForm({
  mode,
  initial,
  action,
}: {
  mode: 'new' | 'edit'
  initial: TalentFormInitial
  action: (formData: FormData) => Promise<void>
}) {
  const [email, setEmail] = useState(initial.email ?? '')
  const [firstName, setFirstName] = useState(initial.first_name ?? '')
  const [lastName, setLastName] = useState(initial.last_name ?? '')
  const [phone, setPhone] = useState(initial.phone ?? '')
  const [city, setCity] = useState(initial.city ?? '')

  const [department, setDepartment] = useState(initial.department ?? '')
  const [primaryRole, setPrimaryRole] = useState(initial.primary_role ?? '')
  const [secondaryRoles, setSecondaryRoles] = useState<string[]>(
    initial.secondary_roles ?? []
  )

  const [dayRate, setDayRate] = useState(
    initial.day_rate_cents != null ? String(initial.day_rate_cents / 100) : ''
  )
  const [halfDayRate, setHalfDayRate] = useState(
    initial.half_day_rate_cents != null
      ? String(initial.half_day_rate_cents / 100)
      : ''
  )
  const [rateFloor, setRateFloor] = useState(
    initial.rate_floor_cents != null
      ? String(initial.rate_floor_cents / 100)
      : ''
  )

  const [bio, setBio] = useState(initial.bio ?? '')
  const [showreelUrl, setShowreelUrl] = useState(initial.showreel_url ?? '')
  const [equipment, setEquipment] = useState(initial.equipment ?? '')
  const [travelMiles, setTravelMiles] = useState(
    initial.travel_radius_miles != null ? String(initial.travel_radius_miles) : ''
  )
  const [unionEligible, setUnionEligible] = useState(Boolean(initial.union_eligible))
  const [verified, setVerified] = useState(
    initial.verified === undefined ? true : initial.verified
  )

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  function toggleSecondary(key: string) {
    setSecondaryRoles((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    )
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (saving) return
    setSaving(true)
    setError('')

    if (!firstName.trim() || !lastName.trim()) {
      setError('First and last name are required.')
      setSaving(false)
      return
    }
    if (mode === 'new' && !email.trim()) {
      setError('Email is required.')
      setSaving(false)
      return
    }

    const fd = new FormData()
    if (mode === 'edit' && initial.id) fd.set('id', initial.id)
    fd.set('email', email)
    fd.set('first_name', firstName)
    fd.set('last_name', lastName)
    fd.set('phone', phone)
    fd.set('city', city)
    fd.set('department', department)
    fd.set('primary_role', primaryRole)
    fd.set('secondary_roles', JSON.stringify(secondaryRoles))
    fd.set('day_rate', dayRate)
    fd.set('half_day_rate', halfDayRate)
    fd.set('rate_floor', rateFloor)
    fd.set('bio', bio)
    fd.set('showreel_url', showreelUrl)
    fd.set('equipment', equipment)
    fd.set('travel_radius_miles', travelMiles)
    fd.set('union_eligible', unionEligible ? 'true' : 'false')
    fd.set('verified', verified ? 'true' : 'false')

    try {
      await action(fd)
    } catch (err: unknown) {
      if (
        err &&
        typeof err === 'object' &&
        'digest' in err &&
        String((err as { digest?: string }).digest).startsWith('NEXT_REDIRECT')
      ) {
        throw err
      }
      const msg = err instanceof Error ? err.message : 'Something went wrong.'
      setError(msg)
      setSaving(false)
    }
  }

  const heading = mode === 'new' ? 'Add talent' : 'Edit talent'
  const saveLabel = mode === 'new' ? 'Create profile' : 'Save changes'
  const backHref =
    mode === 'edit' && initial.id ? `/admin/talent/${initial.id}` : '/admin/talent'

  return (
    <div className="mx-auto" style={{ maxWidth: 720, padding: '20px 18px 28px' }}>
      <Link href={backHref} style={{ fontSize: 13, color: '#7A90AA', textDecoration: 'none' }}>
        ← Back
      </Link>
      <h1 className="text-white" style={{ fontSize: 20, fontWeight: 600, marginTop: 8 }}>
        {heading}
      </h1>

      <form
        onSubmit={onSubmit}
        className="mt-4 bg-white rounded-xl"
        style={{ padding: 20, color: '#1E3A6B' }}
      >
        <SectionHeading>Account</SectionHeading>
        <div className="grid grid-cols-2 gap-3">
          <Field label="First name" required>
            <input
              type="text"
              required
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              className={INPUT_CLS}
            />
          </Field>
          <Field label="Last name" required>
            <input
              type="text"
              required
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              className={INPUT_CLS}
            />
          </Field>
        </div>
        <Field label="Email (login)" required={mode === 'new'}>
          <input
            type="email"
            required={mode === 'new'}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={INPUT_CLS}
            disabled={mode === 'edit'}
            style={mode === 'edit' ? { background: '#F3F4F6' } : undefined}
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Phone">
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className={INPUT_CLS}
            />
          </Field>
          <Field label="City">
            <input
              type="text"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              className={INPUT_CLS}
            />
          </Field>
        </div>

        <Divider />

        <SectionHeading>Role</SectionHeading>
        <Field label="Department" required>
          <select
            required
            value={department}
            onChange={(e) => setDepartment(e.target.value)}
            className={INPUT_CLS}
          >
            <option value="">Select department</option>
            {DEPARTMENT_OPTIONS.map((d) => (
              <option key={d.key} value={d.key}>
                {d.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Primary role" required>
          <input
            type="text"
            required
            value={primaryRole}
            onChange={(e) => setPrimaryRole(e.target.value)}
            placeholder="Photographer · 1st AC · Editor"
            className={INPUT_CLS}
          />
        </Field>
        <Field label="Secondary roles">
          <div className="flex flex-wrap gap-2">
            {SECONDARY_ROLE_OPTIONS.map((key) => {
              const active = secondaryRoles.includes(key)
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => toggleSecondary(key)}
                  className="rounded-full transition-colors"
                  style={{
                    padding: '6px 12px',
                    fontSize: 12,
                    fontWeight: 600,
                    background: active ? '#1E3A6B' : '#F2F4F7',
                    color: active ? '#fff' : '#496275',
                    border: active ? '1px solid #1E3A6B' : '1px solid #E5E7EB',
                    cursor: 'pointer',
                  }}
                >
                  {active ? '✓ ' : '+ '}
                  {key}
                </button>
              )
            })}
          </div>
        </Field>

        <Divider />

        <SectionHeading>Rates</SectionHeading>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Day rate" required>
            <CurrencyInput value={dayRate} onChange={setDayRate} required min={300} />
          </Field>
          <Field label="Half day">
            <CurrencyInput value={halfDayRate} onChange={setHalfDayRate} min={150} />
          </Field>
          <Field label="Rate floor">
            <CurrencyInput value={rateFloor} onChange={setRateFloor} min={300} />
          </Field>
        </div>
        <p
          style={{
            fontSize: 11,
            color: '#7A90AA',
            marginTop: 6,
            letterSpacing: '0.02em',
          }}
        >
          Platform floor: $300/day.
        </p>

        <Divider />

        <SectionHeading>Profile</SectionHeading>
        <Field label="Bio">
          <textarea
            rows={3}
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            className={`${INPUT_CLS} resize-y`}
          />
        </Field>
        <Field label="Showreel URL">
          <input
            type="url"
            value={showreelUrl}
            onChange={(e) => setShowreelUrl(e.target.value)}
            placeholder="https://vimeo.com/…"
            className={INPUT_CLS}
          />
        </Field>
        <Field label="Equipment">
          <textarea
            rows={2}
            value={equipment}
            onChange={(e) => setEquipment(e.target.value)}
            className={`${INPUT_CLS} resize-y`}
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Travel radius (miles)">
            <input
              type="number"
              min={0}
              step={10}
              value={travelMiles}
              onChange={(e) => setTravelMiles(e.target.value)}
              className={INPUT_CLS}
            />
          </Field>
          <Field label="Union eligible">
            <div
              className="flex items-center"
              style={{ minHeight: 42, paddingTop: 2 }}
            >
              <Toggle
                checked={unionEligible}
                onChange={setUnionEligible}
                label="Eligible"
              />
            </div>
          </Field>
        </div>

        <Divider />

        <SectionHeading>Verification</SectionHeading>
        <Field label="Mark as verified">
          <Toggle
            checked={verified}
            onChange={setVerified}
            label={
              verified
                ? 'Visible in roster, assignable to jobs'
                : 'Hidden from roster until verified'
            }
          />
        </Field>

        {error && (
          <p
            className="mt-4 rounded-lg"
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

        {mode === 'new' && (
          <p
            className="mt-4 rounded-lg"
            style={{
              fontSize: 12,
              color: '#0F5132',
              background: 'rgba(16,185,129,0.08)',
              border: '1px solid rgba(16,185,129,0.25)',
              padding: '10px 12px',
            }}
          >
            This creates the profile + talent record + invite row. It does not
            send a password-setup email — do that separately.
          </p>
        )}

        <button
          type="submit"
          disabled={saving}
          className="mt-5 w-full rounded-xl bg-[#1E3A6B] hover:bg-[#253D8A] text-white transition-colors"
          style={{
            padding: '14px 0',
            fontSize: 15,
            fontWeight: 500,
            letterSpacing: '0.01em',
            cursor: saving ? 'wait' : 'pointer',
            opacity: saving ? 0.7 : 1,
          }}
        >
          {saving ? 'Saving…' : saveLabel}
        </button>

        <Link
          href={backHref}
          className="block text-center mt-3"
          style={{ fontSize: 13, color: '#7A90AA', textDecoration: 'none' }}
        >
          Cancel
        </Link>
      </form>

      {mode === 'edit' && initial.id && (
        <div className="mt-6 text-center">
          <RemoveButton talentId={initial.id} />
        </div>
      )}
    </div>
  )
}

function CurrencyInput({
  value,
  onChange,
  required,
  min = 300,
}: {
  value: string
  onChange: (v: string) => void
  required?: boolean
  min?: number
}) {
  return (
    <div style={{ position: 'relative' }}>
      <span
        style={{
          position: 'absolute',
          left: 12,
          top: '50%',
          transform: 'translateY(-50%)',
          color: '#888',
          fontSize: 14,
          pointerEvents: 'none',
        }}
      >
        $
      </span>
      <input
        type="number"
        min={min}
        step={25}
        required={required}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={INPUT_CLS}
        style={{ paddingLeft: 26 }}
        placeholder={String(min)}
      />
    </div>
  )
}

function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label?: string
}) {
  return (
    <label className="inline-flex items-center gap-2 cursor-pointer">
      <span
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className="inline-flex items-center"
        style={{
          width: 36,
          height: 20,
          borderRadius: 999,
          background: checked ? '#1E3A6B' : '#D1D5DB',
          padding: 2,
          transition: 'background 120ms ease',
        }}
      >
        <span
          style={{
            width: 16,
            height: 16,
            borderRadius: 999,
            background: '#fff',
            transform: checked ? 'translateX(16px)' : 'translateX(0)',
            transition: 'transform 120ms ease',
            boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
          }}
        />
      </span>
      {label && (
        <span style={{ fontSize: 12, color: '#496275' }}>{label}</span>
      )}
    </label>
  )
}

function RemoveButton({ talentId }: { talentId: string }) {
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)

  return (
    <form
      action={async (fd: FormData) => {
        if (!confirming) {
          setConfirming(true)
          setTimeout(() => setConfirming(false), 3000)
          return
        }
        setBusy(true)
        fd.set('id', talentId)
        await removeFromRoster(fd)
      }}
    >
      <button
        type="submit"
        disabled={busy}
        style={{
          background: 'transparent',
          border: 'none',
          color: confirming ? '#DC2626' : '#F87171',
          fontSize: 12,
          fontWeight: 600,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          cursor: busy ? 'wait' : 'pointer',
          padding: '8px 12px',
        }}
      >
        {busy
          ? 'Removing…'
          : confirming
          ? 'Tap again to remove from roster'
          : 'Remove from roster'}
      </button>
    </form>
  )
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <p
      style={{
        fontSize: 12,
        fontWeight: 700,
        letterSpacing: '0.12em',
        textTransform: 'uppercase',
        color: '#1E3A6B',
        borderBottom: '1px solid #F3F4F6',
        paddingBottom: 8,
        marginBottom: 14,
      }}
    >
      {children}
    </p>
  )
}

function Divider() {
  return <div style={{ height: 18 }} />
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
    <label className="block" style={{ marginBottom: 12 }}>
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
        {required && <span style={{ color: '#DC2626' }}> *</span>}
      </span>
      {children}
    </label>
  )
}

const INPUT_CLS =
  'block w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-[#1E3A6B] bg-white focus:outline-none focus:ring-2 focus:ring-[#1E3A6B]/30 focus:border-[#1E3A6B]/40 transition'

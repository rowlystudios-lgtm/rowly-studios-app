'use client'

import { Suspense, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useAuth } from '@/lib/auth-context'
import { CREW_OPTIONS } from '@/lib/crew-taxonomy'
import { AddressAutocomplete } from '@/components/AddressAutocomplete'
import {
  PAGE_BG,
  TEXT_PRIMARY,
  TEXT_MUTED,
  LINK_COLOR,
  BUTTON_PRIMARY,
} from '@/components/PageShell'

const CARD_BG = '#2E5099'
const CARD_BORDER = 'rgba(170,189,224,0.15)'
const CHIP_INACTIVE_BG = 'rgba(255,255,255,0.06)'
const CHIP_INACTIVE_BORDER = 'rgba(170,189,224,0.2)'

type DurationType = 'full_day' | 'custom'

type ShootDayInput = {
  date: string
  call_time: string
  end_time: string
  duration_type: DurationType
  // Only populated when duration_type === 'custom' and the user has set
  // or auto-derived a value. Stored as a decimal string for the input.
  duration_hours: string
  // Per-shoot-day working budget (dollar string to keep input controlled).
  budget: string
}

type FormState = {
  title: string
  description: string
  address_line: string
  address_city: string
  address_state: string
  address_zip: string
  shoot_days: ShootDayInput[]
  crew_needed: string[]
  client_notes: string
}

// Platform-wide minimum working budget per person. Kept as a single
// constant so any future change touches one line.
const MIN_BUDGET_DOLLARS = 350

// Pre-computed 00:00 → 23:30 half-hour slots for both call/end selects.
// Call/End now sit on their own full-width row (2×1fr grid) so there's
// room for an AM/PM suffix, which makes the value easier to scan.
const TIME_OPTIONS: { value: string; label: string }[] = (() => {
  const opts: { value: string; label: string }[] = []
  for (let h = 0; h < 24; h++) {
    for (const m of [0, 30]) {
      const v = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
      const suffix = h < 12 ? 'AM' : 'PM'
      opts.push({
        value: v,
        label: `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')} ${suffix}`,
      })
    }
  }
  return opts
})()

const INITIAL: FormState = {
  title: '',
  description: '',
  address_line: '',
  address_city: '',
  address_state: 'CA',
  address_zip: '',
  shoot_days: [
    {
      date: '',
      call_time: '08:00',
      end_time: '',
      duration_type: 'full_day',
      duration_hours: '',
      budget: '',
    },
  ],
  crew_needed: [],
  client_notes: '',
}

/**
 * Minutes-since-midnight for an HH:MM string. Returns null for empty /
 * malformed input so the caller can decide how to handle it.
 */
function minutesOfDay(hhmm: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim())
  if (!m) return null
  const h = Number(m[1])
  const mm = Number(m[2])
  if (!Number.isFinite(h) || !Number.isFinite(mm)) return null
  if (h < 0 || h > 23 || mm < 0 || mm > 59) return null
  return h * 60 + mm
}

/** HH:MM formatter from minutes-since-midnight. */
function formatHHMM(totalMinutes: number): string {
  const wrapped = ((totalMinutes % 1440) + 1440) % 1440
  const h = Math.floor(wrapped / 60)
  const m = wrapped % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

/**
 * Hours between call_time and end_time, handling overnight shoots by
 * wrapping past midnight. Returns null if either time is missing.
 */
function hoursBetween(callTime: string, endTime: string): number | null {
  const a = minutesOfDay(callTime)
  const b = minutesOfDay(endTime)
  if (a == null || b == null) return null
  let diff = b - a
  if (diff <= 0) diff += 24 * 60
  return Math.round((diff / 60) * 100) / 100
}

/**
 * Resolve a day's effective duration in hours (or null if full day).
 * Priority: explicit custom_hours > computed from end_time − call_time.
 */
function shootDayHours(day: ShootDayInput): number | null {
  if (day.duration_type === 'full_day') return null
  const typed = parseFloat(day.duration_hours)
  if (Number.isFinite(typed) && typed > 0) return typed
  const computed = hoursBetween(day.call_time, day.end_time)
  return computed ?? null
}

/**
 * Parse a per-day budget dollar string into cents. Returns null for an
 * empty / zero input so the submit guard can catch it.
 */
function budgetCents(day: ShootDayInput): number | null {
  const n = parseFloat(day.budget)
  if (!Number.isFinite(n) || n <= 0) return null
  return Math.round(n * 100)
}

function formatAddress(form: FormState): string {
  const line = form.address_line.trim()
  const city = form.address_city.trim()
  const state = form.address_state.trim().toUpperCase()
  const zip = form.address_zip.trim()
  const cityStateZip = [city, state && zip ? `${state} ${zip}` : state || zip]
    .filter(Boolean)
    .join(', ')
  return [line, cityStateZip].filter(Boolean).join(', ')
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
            f.client_notes || `Please book ${name} for this job if available.`,
        }))
      })
    return () => {
      cancelled = true
    }
  }, [params, supabase])

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  function updateShootDay(index: number, patch: Partial<ShootDayInput>) {
    setForm((f) => ({
      ...f,
      shoot_days: f.shoot_days.map((d, i) => (i === index ? { ...d, ...patch } : d)),
    }))
  }

  function addShootDay() {
    setForm((f) => {
      const prev = f.shoot_days[f.shoot_days.length - 1]
      return {
        ...f,
        shoot_days: [
          ...f.shoot_days,
          {
            date: '',
            call_time: prev?.call_time ?? '08:00',
            end_time: prev?.end_time ?? '',
            duration_type: prev?.duration_type ?? 'full_day',
            duration_hours: '',
            // Prefill with the previous day's budget so adding a day is cheap.
            budget: prev?.budget ?? '',
          },
        ],
      }
    })
  }

  function removeShootDay(index: number) {
    setForm((f) => ({
      ...f,
      shoot_days: f.shoot_days.filter((_, i) => i !== index),
    }))
  }

  function toggleCrew(key: string) {
    setForm((f) => ({
      ...f,
      crew_needed: f.crew_needed.includes(key)
        ? f.crew_needed.filter((k) => k !== key)
        : [...f.crew_needed, key],
    }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    if (!user?.id) {
      setError('Not signed in')
      return
    }

    if (!form.title.trim()) {
      setError('Please enter a job title.')
      return
    }

    const validDays = form.shoot_days.filter((d) => d.date)
    if (validDays.length === 0) {
      setError('Please add at least one shoot date.')
      return
    }

    if (!form.address_line.trim() || !form.address_city.trim() || !form.address_state.trim() || !form.address_zip.trim()) {
      setError('Please fill in the full street address.')
      return
    }

    if (form.crew_needed.length === 0) {
      setError('Please select at least one crew type needed.')
      return
    }

    // Every shoot day must have a budget above the platform minimum.
    const perDayBudgets: number[] = []
    for (const d of validDays) {
      const cents = budgetCents(d)
      if (cents == null) {
        setError('Enter a working budget for every shoot day.')
        return
      }
      if (cents < MIN_BUDGET_DOLLARS * 100) {
        setError(`Minimum budget is $${MIN_BUDGET_DOLLARS} per person.`)
        return
      }
      perDayBudgets.push(cents)
    }

    setSaving(true)

    const sortedDays = [...validDays].sort((a, b) => a.date.localeCompare(b.date))
    const addressString = formatAddress(form)

    // Compute the job-level summary budget. If every day shares one amount
    // it's that exact amount; otherwise the average (rounded to cents).
    const allSame = perDayBudgets.every((c) => c === perDayBudgets[0])
    const avgBudget = allSame
      ? perDayBudgets[0]
      : Math.round(
          perDayBudgets.reduce((s, c) => s + c, 0) / perDayBudgets.length
        )

    // Any day under 4 hours flips the whole job into short-shoot mode.
    const dayHoursList = validDays.map((d) => shootDayHours(d))
    const shortestHours = dayHoursList.reduce<number | null>((min, h) => {
      if (h == null) return min
      if (min == null) return h
      return h < min ? h : min
    }, null)
    const isShortShoot = shortestHours != null && shortestHours < 4

    const { error: insertError } = await supabase.from('jobs').insert({
      client_id: user.id,
      title: form.title.trim(),
      description: form.description.trim() || null,
      address_line: form.address_line.trim() || null,
      address_city: form.address_city.trim() || null,
      address_state: form.address_state.trim().toUpperCase() || null,
      address_zip: form.address_zip.trim() || null,
      location: addressString || null,
      shoot_days: sortedDays.map((d) => {
        const hours = shootDayHours(d)
        return {
          date: d.date,
          call_time: d.call_time || null,
          end_time: d.end_time || null,
          duration_type: d.duration_type,
          duration_hours: hours,
          budget_cents: budgetCents(d) ?? 0,
        }
      }),
      start_date: sortedDays[0].date,
      end_date: sortedDays[sortedDays.length - 1].date,
      call_time: sortedDays[0].call_time || null,
      crew_needed: form.crew_needed,
      client_notes: form.client_notes.trim() || null,
      // The working budget IS what talent will be offered — no fee rollup.
      client_budget_cents: avgBudget,
      // Canonical per-shoot-day total used by the client job-detail view +
      // the roster rate-offer flow. Mirrors client_budget_cents today but
      // the two are kept separate so we can diverge them later if needed.
      total_budget_cents: avgBudget,
      day_rate_cents: isShortShoot ? null : avgBudget,
      shoot_duration_hours: shortestHours,
      is_half_day: false,
      status: 'submitted',
    })

    setSaving(false)
    if (insertError) {
      setError(insertError.message)
      return
    }

    setSubmitted(true)
  }

  useEffect(() => {
    if (!submitted) return
    const id = setTimeout(() => {
      router.push('/app')
    }, 1200)
    return () => clearTimeout(id)
  }, [submitted, router])

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
            Taking you to My Jobs…
          </p>
        </div>
      </Shell>
    )
  }

  // Gate submission: title + at least one fully-specified day (date +
  // budget at or above the platform minimum).
  const canSubmit =
    form.title.trim().length > 0 &&
    form.shoot_days.some((d) => {
      const c = budgetCents(d)
      return Boolean(d.date) && c != null && c >= MIN_BUDGET_DOLLARS * 100
    })

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
      <h1 style={{ fontSize: 22, fontWeight: 600, marginTop: 12, marginBottom: 4 }}>
        Post a job
      </h1>
      <p style={{ fontSize: 12, color: TEXT_MUTED, marginBottom: 20 }}>
        Give us the shape of the job and we&apos;ll crew it.
      </p>

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <Section title="About the job">
          <Field label="Job title" required>
            <input
              type="text"
              required
              value={form.title}
              onChange={(e) => update('title', e.target.value)}
              placeholder="Nike SS26 Campaign"
              className="rs-input"
              style={{ fontSize: 16 }}
            />
          </Field>
          <Field label="Description">
            <textarea
              value={form.description}
              onChange={(e) => update('description', e.target.value)}
              placeholder="Tell us about the project"
              rows={4}
              className="rs-input resize-none"
              style={{ fontSize: 16 }}
            />
          </Field>
        </Section>

        <Section title="Location">
          <Field label="Street address" required>
            <AddressAutocomplete
              value={form.address_line}
              onChange={(val) => update('address_line', val)}
              onSelect={(result) => {
                setForm((f) => ({
                  ...f,
                  address_line: result.address_line,
                  address_city: result.address_city || f.address_city,
                  address_state: result.address_state || f.address_state,
                  address_zip: result.address_zip || f.address_zip,
                }))
              }}
              placeholder="123 Main Street, Suite 200"
            />
          </Field>
          <Field label="City" required>
            <input
              type="text"
              required
              value={form.address_city}
              onChange={(e) => update('address_city', e.target.value)}
              placeholder="Los Angeles"
              className="rs-input"
              autoComplete="address-level2"
              style={{ fontSize: 16 }}
            />
          </Field>
          <div style={{ display: 'grid', gridTemplateColumns: '90px 1fr', gap: 10 }}>
            <Field label="State" required>
              <input
                type="text"
                required
                maxLength={2}
                value={form.address_state}
                onChange={(e) =>
                  update('address_state', e.target.value.replace(/[^A-Za-z]/g, '').toUpperCase())
                }
                placeholder="CA"
                className="rs-input"
                autoCapitalize="characters"
                autoComplete="address-level1"
                style={{ textTransform: 'uppercase', fontSize: 16 }}
              />
            </Field>
            <Field label="Zip" required>
              <input
                type="text"
                required
                inputMode="numeric"
                maxLength={10}
                value={form.address_zip}
                onChange={(e) =>
                  update('address_zip', e.target.value.replace(/[^0-9-]/g, ''))
                }
                placeholder="90028"
                className="rs-input"
                autoComplete="postal-code"
                style={{ fontSize: 16 }}
              />
            </Field>
          </div>
        </Section>

        <Section title="Shoot day(s)">
          <p style={{ fontSize: 12, color: TEXT_MUTED, marginTop: -2, lineHeight: 1.5 }}>
            Add a row for each day of the shoot — set the budget you&rsquo;re offering per person.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {form.shoot_days.map((day, i) => (
              <div
                key={i}
                style={{
                  background: 'rgba(255,255,255,0.06)',
                  border: '1px solid rgba(170,189,224,0.2)',
                  borderRadius: 10,
                  padding: '12px 14px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 10,
                  overflow: 'hidden',
                  minWidth: 0,
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      color: TEXT_MUTED,
                      textTransform: 'uppercase',
                      letterSpacing: '0.06em',
                    }}
                  >
                    Day {i + 1}
                  </span>
                  {form.shoot_days.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeShootDay(i)}
                      aria-label={`Remove day ${i + 1}`}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: TEXT_MUTED,
                        fontSize: 18,
                        cursor: 'pointer',
                        padding: '0 4px',
                        lineHeight: 1,
                      }}
                    >
                      ×
                    </button>
                  )}
                </div>

                <ShootDayFields
                  day={day}
                  index={i}
                  onChange={(patch) => updateShootDay(i, patch)}
                />
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={addShootDay}
            style={{
              width: '100%',
              padding: '10px 12px',
              borderRadius: 10,
              background: 'transparent',
              color: LINK_COLOR,
              border: `1px dashed rgba(170,189,224,0.4)`,
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            + Add another day
          </button>
        </Section>

        <Section title="Crew needed">
          <p style={{ fontSize: 12, color: TEXT_MUTED, marginTop: -2, lineHeight: 1.5 }}>
            Select the departments you need — we&apos;ll match you with the right talent.
          </p>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 8,
            }}
          >
            {CREW_OPTIONS.map((opt) => {
              const active = form.crew_needed.includes(opt.key)
              return (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => toggleCrew(opt.key)}
                  aria-pressed={active}
                  style={{
                    padding: '10px 14px',
                    borderRadius: 10,
                    border: `1px solid ${active ? '#ffffff' : CHIP_INACTIVE_BORDER}`,
                    background: active ? '#ffffff' : CHIP_INACTIVE_BG,
                    color: active ? '#1A3C6B' : TEXT_MUTED,
                    fontSize: 13,
                    fontWeight: active ? 600 : 500,
                    textAlign: 'left',
                    cursor: 'pointer',
                    transition: 'all 120ms ease',
                    lineHeight: 1.25,
                  }}
                >
                  {opt.label}
                </button>
              )
            })}
          </div>
        </Section>

        <Section title="Notes">
          <textarea
            value={form.client_notes}
            onChange={(e) => update('client_notes', e.target.value)}
            placeholder="Anything else the crew should know: NDA, parking, dress code, key contact."
            rows={4}
            className="rs-input resize-none"
            style={{ fontSize: 16 }}
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

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, paddingTop: 4 }}>
          <div style={{ display: 'flex', gap: 10 }}>
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
              disabled={saving || !canSubmit}
              style={{
                flex: 1,
                padding: '14px 0',
                borderRadius: 12,
                background: '#fff',
                color: BUTTON_PRIMARY,
                border: 'none',
                fontSize: 13,
                fontWeight: 600,
                cursor: saving || !canSubmit ? 'not-allowed' : 'pointer',
                opacity: saving || !canSubmit ? 0.5 : 1,
              }}
            >
              {saving ? 'Submitting…' : 'Submit job request'}
            </button>
          </div>
          <p
            style={{
              fontSize: 11,
              color: TEXT_MUTED,
              textAlign: 'center',
              lineHeight: 1.5,
            }}
          >
            Our team will review your request and be in touch within 24 hours.
          </p>
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
          overflow: 'hidden',
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

/**
 * Per-shoot-day fields: date + call + end time, duration toggle, budget.
 * Broken out so the per-day rendering logic stays self-contained.
 */
function ShootDayFields({
  day,
  index,
  onChange,
}: {
  day: ShootDayInput
  index: number
  onChange: (patch: Partial<ShootDayInput>) => void
}) {
  const computedHours =
    day.duration_type === 'custom'
      ? shootDayHours(day)
      : hoursBetween(day.call_time, day.end_time)
  const isShort = computedHours != null && computedHours < 4

  const budgetNum = parseFloat(day.budget)
  const budgetBelowMin =
    Number.isFinite(budgetNum) && budgetNum > 0 && budgetNum < MIN_BUDGET_DOLLARS

  // Past-date exclusion now lives inside the custom DatePicker
  // component, so no local todayStr is needed here.

  // Keep end_time sensible when call_time changes. If end was blank we
  // shift to call + 8h (a reasonable default); otherwise preserve the
  // existing span in minutes.
  function setCallTime(nextCall: string) {
    const prevCall = minutesOfDay(day.call_time)
    const prevEnd = minutesOfDay(day.end_time)
    const newCall = minutesOfDay(nextCall)
    let nextEnd: string = day.end_time
    if (newCall != null) {
      if (!day.end_time || prevCall == null || prevEnd == null) {
        nextEnd = formatHHMM(newCall + 8 * 60)
      } else {
        let span = prevEnd - prevCall
        if (span <= 0) span += 24 * 60
        nextEnd = formatHHMM(newCall + span)
      }
    }
    onChange({ call_time: nextCall, end_time: nextEnd })
  }

  // When a custom hours value is typed in, derive end_time so both fields
  // stay coherent. Leave end_time alone if hours is cleared.
  function setCustomHours(raw: string) {
    onChange({ duration_hours: raw })
    const n = parseFloat(raw)
    if (!Number.isFinite(n) || n <= 0) return
    const call = minutesOfDay(day.call_time)
    if (call == null) return
    onChange({
      duration_hours: raw,
      end_time: formatHHMM(call + Math.round(n * 60)),
    })
  }

  // Setting an end_time backfills duration_hours (only matters for custom).
  function setEndTime(nextEnd: string) {
    const h = hoursBetween(day.call_time, nextEnd)
    onChange({
      end_time: nextEnd,
      duration_hours:
        day.duration_type === 'custom' && h != null ? String(h) : day.duration_hours,
    })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Row 1 — Date on its own row. Uses a custom three-select picker
          so the control is identical on every platform (no iOS date
          chrome quirks, no UTC vs. local-time regressions, no past
          dates). DatePicker emits 'YYYY-MM-DD' or '' — same shape the
          rest of the form already expects. */}
      <div>
        <span
          style={{
            display: 'block',
            fontSize: 10,
            fontWeight: 600,
            color: TEXT_MUTED,
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
            marginBottom: 5,
          }}
        >
          Date *
        </span>
        <DatePicker
          value={day.date}
          onChange={(val) => onChange({ date: val })}
        />
      </div>

      {/* Row 2 — Call and End in a clean 1:1 grid underneath. */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)',
          gap: 8,
        }}
      >
        <label
          style={{ display: 'flex', flexDirection: 'column', gap: 3 }}
        >
          <span
            style={{
              fontSize: 10,
              fontWeight: 600,
              color: TEXT_MUTED,
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
            }}
          >
            Call
          </span>
          <select
            value={day.call_time}
            onChange={(e) => setCallTime(e.target.value)}
            style={{
              fontSize: 16,
              padding: '10px 8px',
              background: 'rgba(255,255,255,0.92)',
              border: '1px solid rgba(255,255,255,0.2)',
              borderRadius: 8,
              color: '#1A3C6B',
              fontWeight: 500,
              outline: 'none',
              cursor: 'pointer',
              width: '100%',
              boxSizing: 'border-box',
            }}
          >
            {TIME_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>

        <label
          style={{ display: 'flex', flexDirection: 'column', gap: 3 }}
        >
          <span
            style={{
              fontSize: 10,
              fontWeight: 600,
              color: TEXT_MUTED,
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
            }}
          >
            End
          </span>
          <select
            value={day.end_time || ''}
            onChange={(e) => setEndTime(e.target.value)}
            style={{
              fontSize: 16,
              padding: '10px 8px',
              background: 'rgba(255,255,255,0.92)',
              border: '1px solid rgba(255,255,255,0.2)',
              borderRadius: 8,
              color: '#1A3C6B',
              fontWeight: 500,
              outline: 'none',
              cursor: 'pointer',
              width: '100%',
              boxSizing: 'border-box',
            }}
          >
            <option value="">—</option>
            {TIME_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {/* Duration: Full day vs Custom. Custom unlocks an hours input. */}
      <div>
        <div
          style={{
            fontSize: 10,
            fontWeight: 600,
            color: TEXT_MUTED,
            marginBottom: 6,
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
          }}
        >
          Duration
        </div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 6,
          }}
        >
          {([
            { key: 'full_day' as DurationType, label: 'Full day' },
            { key: 'custom' as DurationType, label: 'Custom' },
          ]).map((opt) => {
            const active = day.duration_type === opt.key
            return (
              <button
                key={opt.key}
                type="button"
                onClick={() => {
                  if (opt.key === 'custom') {
                    // Seed the hours input from the current call→end gap so
                    // the user doesn't have to retype what they already
                    // picked. Falls back to an empty input if we can't
                    // compute one (e.g. end_time missing).
                    const computed = hoursBetween(day.call_time, day.end_time)
                    const hours =
                      day.duration_hours ||
                      (computed != null ? String(computed) : '')
                    onChange({ duration_type: 'custom', duration_hours: hours })
                  } else {
                    onChange({ duration_type: 'full_day', duration_hours: '' })
                  }
                }}
                style={{
                  padding: '8px 6px',
                  borderRadius: 8,
                  border: `1px solid ${
                    active ? '#ffffff' : CHIP_INACTIVE_BORDER
                  }`,
                  background: active ? '#ffffff' : CHIP_INACTIVE_BG,
                  color: active ? '#1A3C6B' : TEXT_MUTED,
                  fontSize: 12,
                  fontWeight: active ? 600 : 500,
                  cursor: 'pointer',
                }}
              >
                {opt.label}
              </button>
            )
          })}
        </div>
        {day.duration_type === 'custom' && (
          <div style={{ marginTop: 8 }}>
            <label
              style={{
                fontSize: 10,
                fontWeight: 600,
                color: TEXT_MUTED,
                letterSpacing: '0.04em',
                textTransform: 'uppercase',
                display: 'block',
                marginBottom: 4,
              }}
            >
              How many hours?
            </label>
            <input
              type="number"
              min={0.5}
              max={23.5}
              step={0.5}
              value={day.duration_hours}
              onChange={(e) => setCustomHours(e.target.value)}
              placeholder="Hours, e.g. 3"
              className="rs-input"
              style={{ fontSize: 16 }}
            />
            {computedHours != null && (
              <p
                style={{
                  marginTop: 6,
                  fontSize: 11,
                  color: TEXT_MUTED,
                }}
              >
                Call {day.call_time}
                {day.end_time ? ` → End ${day.end_time}` : ''} ={' '}
                <strong
                  style={{
                    color: isShort ? '#F0A500' : '#fff',
                  }}
                >
                  {computedHours.toFixed(1)} hrs
                </strong>
              </p>
            )}
          </div>
        )}
        {isShort && (
          <p
            style={{
              marginTop: 6,
              fontSize: 11,
              color: '#F0A500',
              fontWeight: 600,
              letterSpacing: '0.02em',
            }}
          >
            ⚡ Short shoot · Under 4 hrs
          </p>
        )}
      </div>

      {/* Per-day total budget. Minimum is $300; no fee language. */}
      <label style={{ display: 'block' }}>
        <span
          style={{
            display: 'block',
            fontSize: 10,
            fontWeight: 600,
            color: TEXT_MUTED,
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
            marginBottom: 4,
          }}
        >
          Total budget
        </span>
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
            inputMode="decimal"
            min={MIN_BUDGET_DOLLARS}
            step={5}
            value={day.budget}
            onChange={(e) => onChange({ budget: e.target.value })}
            placeholder="e.g. 5000"
            className="rs-input"
            style={{
              paddingLeft: 24,
              // 16px prevents iOS Safari zoom on focus.
              fontSize: 16,
              borderColor: budgetBelowMin ? '#EF4444' : undefined,
            }}
          />
        </div>
        <p
          style={{
            marginTop: 4,
            fontSize: 11,
            color: budgetBelowMin ? '#F87171' : TEXT_MUTED,
            lineHeight: 1.4,
          }}
        >
          {budgetBelowMin
            ? `Minimum total budget is $${MIN_BUDGET_DOLLARS}.`
            : 'Total budget for this shoot day. Can be adjusted later.'}
        </p>
      </label>
    </div>
  )
}

/* ─────────── Custom date picker ─────────── */

/**
 * Calendar-grid date picker. Renders the month the caller is looking at
 * (initialised from `value` or today) with Sun-first weekday labels, and
 * emits the selected day as a 'YYYY-MM-DD' string. Past dates are visible
 * but muted + non-clickable; today gets a ring, the selected day is
 * filled solid navy. Navigation caps at the current month going back so
 * clients can't accidentally post a shoot in the past.
 */
function DatePicker({
  value,
  onChange,
}: {
  value: string // 'YYYY-MM-DD' or ''
  onChange: (val: string) => void
}) {
  // Use midnight-today as the floor — comparing via Date objects is cleaner
  // than juggling year/month/day integers once we get into "is this day
  // before today?" territory.
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  // Parse the current value (if any) so we can highlight it in the grid
  // and seed the initial month/year. Passing "T00:00:00" keeps us in the
  // user's local timezone rather than UTC.
  const selected = value ? new Date(value + 'T00:00:00') : null

  const [viewYear, setViewYear] = useState(
    selected ? selected.getFullYear() : today.getFullYear()
  )
  const [viewMonth, setViewMonth] = useState(
    selected ? selected.getMonth() : today.getMonth()
  )

  const MONTH_NAMES = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
  ]
  const DAY_LABELS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']

  // How much leading whitespace the first row needs so the 1st of the
  // month lines up under its correct weekday column.
  const firstDay = new Date(viewYear, viewMonth, 1)
  const startOffset = firstDay.getDay() // 0 = Sunday
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate()

  // Grid cells: leading empties + each day + trailing empties to fill
  // out the last row. Simpler than a 6×7 two-dim array and renders in a
  // single flex-free CSS grid.
  const cells: (number | null)[] = [
    ...Array(startOffset).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ]
  while (cells.length % 7 !== 0) cells.push(null)

  function prevMonth() {
    if (viewMonth === 0) {
      setViewMonth(11)
      setViewYear((y) => y - 1)
    } else {
      setViewMonth((m) => m - 1)
    }
  }

  function nextMonth() {
    if (viewMonth === 11) {
      setViewMonth(0)
      setViewYear((y) => y + 1)
    } else {
      setViewMonth((m) => m + 1)
    }
  }

  // Only allow navigating backwards if the viewed month is still in the
  // future relative to today.
  const canGoPrev =
    viewYear > today.getFullYear() ||
    (viewYear === today.getFullYear() && viewMonth > today.getMonth())

  function selectDay(day: number) {
    const d = new Date(viewYear, viewMonth, day)
    d.setHours(0, 0, 0, 0)
    if (d < today) return // past days are inert
    const yyyy = viewYear
    const mm = String(viewMonth + 1).padStart(2, '0')
    const dd = String(day).padStart(2, '0')
    onChange(`${yyyy}-${mm}-${dd}`)
  }

  function isDayPast(day: number): boolean {
    const d = new Date(viewYear, viewMonth, day)
    d.setHours(0, 0, 0, 0)
    return d < today
  }

  function isDayToday(day: number): boolean {
    return (
      viewYear === today.getFullYear() &&
      viewMonth === today.getMonth() &&
      day === today.getDate()
    )
  }

  function isDaySelected(day: number): boolean {
    if (!selected) return false
    return (
      viewYear === selected.getFullYear() &&
      viewMonth === selected.getMonth() &&
      day === selected.getDate()
    )
  }

  return (
    <div
      style={{
        background: 'rgba(255,255,255,0.95)',
        borderRadius: 10,
        border: '1px solid rgba(255,255,255,0.2)',
        overflow: 'hidden',
        padding: '12px 10px 10px',
      }}
    >
      {/* Month navigation */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 10,
          padding: '0 2px',
        }}
      >
        <button
          type="button"
          onClick={prevMonth}
          disabled={!canGoPrev}
          style={{
            width: 28,
            height: 28,
            borderRadius: '50%',
            border: 'none',
            background: 'transparent',
            cursor: canGoPrev ? 'pointer' : 'default',
            color: canGoPrev ? '#1A3C6B' : 'rgba(26,60,107,0.25)',
            fontSize: 16,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 0,
          }}
        >
          ‹
        </button>

        <span
          style={{
            fontSize: 13,
            fontWeight: 700,
            color: '#1A3C6B',
          }}
        >
          {MONTH_NAMES[viewMonth]} {viewYear}
        </span>

        <button
          type="button"
          onClick={nextMonth}
          style={{
            width: 28,
            height: 28,
            borderRadius: '50%',
            border: 'none',
            background: 'transparent',
            cursor: 'pointer',
            color: '#1A3C6B',
            fontSize: 16,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 0,
          }}
        >
          ›
        </button>
      </div>

      {/* Weekday labels */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(7, 1fr)',
          marginBottom: 4,
        }}
      >
        {DAY_LABELS.map((d) => (
          <div
            key={d}
            style={{
              textAlign: 'center',
              fontSize: 10,
              fontWeight: 600,
              color: 'rgba(26,60,107,0.4)',
              padding: '2px 0 4px',
            }}
          >
            {d}
          </div>
        ))}
      </div>

      {/* Day grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(7, 1fr)',
          gap: 2,
        }}
      >
        {cells.map((day, i) => {
          if (!day) return <div key={`e-${i}`} />

          const past = isDayPast(day)
          const isToday = isDayToday(day)
          const isSel = isDaySelected(day)

          return (
            <button
              key={day}
              type="button"
              disabled={past}
              onClick={() => selectDay(day)}
              style={{
                width: '100%',
                aspectRatio: '1',
                borderRadius: '50%',
                border: 'none',
                background: isSel
                  ? '#1A3C6B'
                  : isToday
                  ? 'rgba(26,60,107,0.12)'
                  : 'transparent',
                color: isSel
                  ? '#ffffff'
                  : past
                  ? 'rgba(26,60,107,0.2)'
                  : '#1A3C6B',
                fontSize: 13,
                fontWeight: isSel || isToday ? 700 : 400,
                cursor: past ? 'default' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 0,
                // Ring around today when it's not the currently selected day.
                outline:
                  isToday && !isSel ? '1.5px solid #1A3C6B' : 'none',
                outlineOffset: -1,
              }}
            >
              {day}
            </button>
          )
        })}
      </div>
    </div>
  )
}

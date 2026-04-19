'use client'

import { Suspense, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useAuth } from '@/lib/auth-context'
import { CREW_OPTIONS } from '@/lib/jobs'
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

type ShootDayInput = { date: string; call_time: string }

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

const INITIAL: FormState = {
  title: '',
  description: '',
  address_line: '',
  address_city: '',
  address_state: 'CA',
  address_zip: '',
  shoot_days: [{ date: '', call_time: '08:00' }],
  crew_needed: [],
  client_notes: '',
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
    setForm((f) => ({
      ...f,
      shoot_days: [
        ...f.shoot_days,
        {
          date: '',
          call_time: f.shoot_days[f.shoot_days.length - 1]?.call_time ?? '08:00',
        },
      ],
    }))
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

    setSaving(true)

    const sortedDays = [...validDays].sort((a, b) => a.date.localeCompare(b.date))
    const addressString = formatAddress(form)

    const { error: insertError } = await supabase.from('jobs').insert({
      client_id: user.id,
      title: form.title.trim(),
      description: form.description.trim() || null,
      address_line: form.address_line.trim() || null,
      address_city: form.address_city.trim() || null,
      address_state: form.address_state.trim().toUpperCase() || null,
      address_zip: form.address_zip.trim() || null,
      location: addressString || null,
      shoot_days: sortedDays.map((d) => ({
        date: d.date,
        call_time: d.call_time || null,
      })),
      start_date: sortedDays[0].date,
      end_date: sortedDays[sortedDays.length - 1].date,
      call_time: sortedDays[0].call_time || null,
      crew_needed: form.crew_needed,
      client_notes: form.client_notes.trim() || null,
      day_rate_cents: null,
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

  const canSubmit =
    form.title.trim().length > 0 && form.shoot_days.some((d) => d.date)

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
            />
          </Field>
          <Field label="Description">
            <textarea
              value={form.description}
              onChange={(e) => update('description', e.target.value)}
              placeholder="Tell us about the project"
              rows={4}
              className="rs-input resize-none"
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
                style={{ textTransform: 'uppercase' }}
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
              />
            </Field>
          </div>
        </Section>

        <Section title="Shoot day(s)">
          <p style={{ fontSize: 12, color: TEXT_MUTED, marginTop: -2, lineHeight: 1.5 }}>
            Add a row for each day of the shoot — everything is billed at a day rate.
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

                <div>
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr 1fr',
                      gap: 0,
                      marginBottom: 5,
                    }}
                  >
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 600,
                        color: TEXT_MUTED,
                      }}
                    >
                      Shoot date *
                    </span>
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 600,
                        color: TEXT_MUTED,
                        paddingLeft: 12,
                      }}
                    >
                      Call time
                    </span>
                  </div>

                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)',
                      overflow: 'hidden',
                      borderRadius: 10,
                      border: '1px solid rgba(255,255,255,0.2)',
                    }}
                  >
                    <input
                      type="date"
                      required
                      value={day.date}
                      onChange={(e) => updateShootDay(i, { date: e.target.value })}
                      style={{
                        width: '100%',
                        minWidth: 0,
                        boxSizing: 'border-box',
                        fontSize: 13,
                        padding: '10px 12px',
                        background: 'rgba(255,255,255,0.92)',
                        border: 'none',
                        borderRight: '1px solid rgba(170,189,224,0.3)',
                        borderRadius: 0,
                        color: '#1A3C6B',
                        fontWeight: 500,
                        outline: 'none',
                        appearance: 'none',
                        WebkitAppearance: 'none',
                      }}
                    />
                    <select
                      value={day.call_time}
                      onChange={(e) => updateShootDay(i, { call_time: e.target.value })}
                      style={{
                        width: '100%',
                        minWidth: 0,
                        boxSizing: 'border-box',
                        fontSize: 13,
                        padding: '10px 12px',
                        background: 'rgba(255,255,255,0.92)',
                        border: 'none',
                        borderRadius: 0,
                        color: '#1A3C6B',
                        fontWeight: 500,
                        outline: 'none',
                        appearance: 'none',
                        WebkitAppearance: 'none',
                        cursor: 'pointer',
                      }}
                    >
                      <option value="00:00">00:00</option>
                      <option value="00:30">00:30</option>
                      <option value="01:00">01:00</option>
                      <option value="01:30">01:30</option>
                      <option value="02:00">02:00</option>
                      <option value="02:30">02:30</option>
                      <option value="03:00">03:00</option>
                      <option value="03:30">03:30</option>
                      <option value="04:00">04:00</option>
                      <option value="04:30">04:30</option>
                      <option value="05:00">05:00</option>
                      <option value="05:30">05:30</option>
                      <option value="06:00">06:00</option>
                      <option value="06:30">06:30</option>
                      <option value="07:00">07:00</option>
                      <option value="07:30">07:30</option>
                      <option value="08:00">08:00</option>
                      <option value="08:30">08:30</option>
                      <option value="09:00">09:00</option>
                      <option value="09:30">09:30</option>
                      <option value="10:00">10:00</option>
                      <option value="10:30">10:30</option>
                      <option value="11:00">11:00</option>
                      <option value="11:30">11:30</option>
                      <option value="12:00">12:00</option>
                      <option value="12:30">12:30</option>
                      <option value="13:00">13:00</option>
                      <option value="13:30">13:30</option>
                      <option value="14:00">14:00</option>
                      <option value="14:30">14:30</option>
                      <option value="15:00">15:00</option>
                      <option value="15:30">15:30</option>
                      <option value="16:00">16:00</option>
                      <option value="16:30">16:30</option>
                      <option value="17:00">17:00</option>
                      <option value="17:30">17:30</option>
                      <option value="18:00">18:00</option>
                      <option value="18:30">18:30</option>
                      <option value="19:00">19:00</option>
                      <option value="19:30">19:30</option>
                      <option value="20:00">20:00</option>
                      <option value="20:30">20:30</option>
                      <option value="21:00">21:00</option>
                      <option value="21:30">21:30</option>
                      <option value="22:00">22:00</option>
                      <option value="22:30">22:30</option>
                      <option value="23:00">23:00</option>
                      <option value="23:30">23:30</option>
                    </select>
                  </div>
                </div>
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

'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase-browser'
import { softDeleteJob } from './actions'

type ClientOption = {
  id: string
  full_name: string | null
  client_profiles:
    | { company_name: string | null }
    | { company_name: string | null }[]
    | null
}

function clientLabel(c: ClientOption): string {
  const cp = Array.isArray(c.client_profiles)
    ? c.client_profiles[0] ?? null
    : c.client_profiles
  return cp?.company_name || c.full_name || 'Unnamed client'
}

export type JobFormInitial = {
  id?: string
  title?: string
  client_id?: string | null
  status?: string
  start_date?: string | null
  end_date?: string | null
  call_time?: string | null
  day_rate_cents?: number | null
  location?: string | null
  address_line?: string | null
  address_city?: string | null
  address_state?: string | null
  address_zip?: string | null
  num_talent?: number | null
  crew_needed?: string[] | null
  description?: string | null
  client_notes?: string | null
  admin_notes?: string | null
}

const CREW_OPTIONS = [
  { key: 'Photography', label: 'Photography' },
  { key: 'Video', label: 'Video' },
  { key: 'Production', label: 'Production' },
  { key: 'Styling', label: 'Styling' },
  { key: 'MUA', label: 'MUA' },
]

const STATUS_OPTIONS = [
  { key: 'submitted', label: 'Submitted' },
  { key: 'crewing', label: 'Crewing' },
  { key: 'confirmed', label: 'Confirmed' },
]

export function JobForm({
  mode,
  initial,
  action,
}: {
  mode: 'new' | 'edit'
  initial: JobFormInitial
  /** The server action to invoke on submit. */
  action: (formData: FormData) => Promise<void>
}) {
  const supabase = createClient()

  const [clients, setClients] = useState<ClientOption[]>([])
  const [loadingClients, setLoadingClients] = useState(true)

  const [title, setTitle] = useState(initial.title ?? '')
  const [clientId, setClientId] = useState(initial.client_id ?? '')
  const [status, setStatus] = useState(initial.status ?? 'submitted')
  const [startDate, setStartDate] = useState(initial.start_date ?? '')
  const [endDate, setEndDate] = useState(initial.end_date ?? '')
  const [callTime, setCallTime] = useState(
    (initial.call_time ?? '').slice(0, 5)
  )
  const [dayRate, setDayRate] = useState(
    initial.day_rate_cents != null ? String(initial.day_rate_cents / 100) : ''
  )
  const [location, setLocation] = useState(initial.location ?? '')
  const [addressLine, setAddressLine] = useState(initial.address_line ?? '')
  const [city, setCity] = useState(initial.address_city ?? '')
  const [stateCode, setStateCode] = useState(initial.address_state ?? '')
  const [zip, setZip] = useState(initial.address_zip ?? '')
  const [numTalent, setNumTalent] = useState(
    initial.num_talent != null ? String(initial.num_talent) : '1'
  )
  const [crew, setCrew] = useState<string[]>(initial.crew_needed ?? [])
  const [description, setDescription] = useState(initial.description ?? '')
  const [clientNotes, setClientNotes] = useState(initial.client_notes ?? '')
  const [adminNotes, setAdminNotes] = useState(initial.admin_notes ?? '')

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // Soft-delete confirm (edit mode only)
  const [deleteConfirming, setDeleteConfirming] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function load() {
      const { data, error: err } = await supabase
        .from('profiles')
        .select(`id, full_name, client_profiles (company_name)`)
        .eq('role', 'client')
        .order('full_name')
      if (cancelled) return
      if (!err) setClients((data ?? []) as ClientOption[])
      setLoadingClients(false)
    }
    load()
    return () => {
      cancelled = true
    }
  }, [supabase])

  function toggleCrew(key: string) {
    setCrew((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    )
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (saving) return
    setSaving(true)
    setError('')

    if (!title.trim()) {
      setError('Title is required.')
      setSaving(false)
      return
    }
    if (!startDate) {
      setError('Start date is required.')
      setSaving(false)
      return
    }
    if (!clientId) {
      setError('Please pick a client.')
      setSaving(false)
      return
    }

    const fd = new FormData()
    if (mode === 'edit' && initial.id) fd.set('jobId', initial.id)
    fd.set('title', title)
    fd.set('client_id', clientId)
    fd.set('status', status)
    fd.set('start_date', startDate)
    fd.set('end_date', endDate || startDate)
    fd.set('call_time', callTime)
    fd.set('day_rate', dayRate)
    fd.set('location', location)
    fd.set('address_line', addressLine)
    fd.set('address_city', city)
    fd.set('address_state', stateCode)
    fd.set('address_zip', zip)
    fd.set('num_talent', numTalent)
    fd.set('crew_needed', JSON.stringify(crew))
    fd.set('description', description)
    fd.set('client_notes', clientNotes)
    fd.set('admin_notes', adminNotes)

    try {
      await action(fd)
      // Server action will redirect — the promise above throws a
      // NEXT_REDIRECT on success and we never get here.
    } catch (err: unknown) {
      // NEXT_REDIRECT is a special thrown value Next uses to navigate.
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

  const heading = mode === 'new' ? 'New job' : 'Edit job'
  const saveLabel = mode === 'new' ? 'Create job' : 'Save changes'

  return (
    <div
      className="mx-auto"
      style={{ maxWidth: 720, padding: '20px 18px 28px' }}
    >
      <Link
        href={mode === 'edit' && initial.id ? `/admin/jobs/${initial.id}` : '/admin/jobs'}
        style={{
          fontSize: 13,
          color: '#7A90AA',
          textDecoration: 'none',
        }}
      >
        ← Jobs
      </Link>
      <h1
        className="text-white"
        style={{ fontSize: 20, fontWeight: 600, marginTop: 8 }}
      >
        {heading}
      </h1>

      <form
        onSubmit={handleSubmit}
        className="mt-4 bg-white rounded-xl"
        style={{ padding: 20, color: '#1E3A6B' }}
      >
        {/* Section 1 — Job details */}
        <SectionHeading>Job details</SectionHeading>
        <Field label="Title" required>
          <input
            type="text"
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className={INPUT_CLS}
          />
        </Field>
        <Field label="Client" required>
          <select
            required
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            className={INPUT_CLS}
            disabled={loadingClients}
          >
            <option value="">
              {loadingClients ? 'Loading…' : 'Select client'}
            </option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {clientLabel(c)}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Status">
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className={INPUT_CLS}
          >
            {STATUS_OPTIONS.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>
        </Field>

        <Divider />

        {/* Section 2 — Schedule */}
        <SectionHeading>Schedule</SectionHeading>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Start date" required>
            <input
              type="date"
              required
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className={INPUT_CLS}
            />
          </Field>
          <Field label="End date">
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className={INPUT_CLS}
            />
          </Field>
          <Field label="Call time">
            <input
              type="time"
              value={callTime}
              onChange={(e) => setCallTime(e.target.value)}
              className={INPUT_CLS}
            />
          </Field>
          <Field label="Talent day rate">
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
                min={300}
                step={25}
                value={dayRate}
                onChange={(e) => setDayRate(e.target.value)}
                placeholder="300"
                className={INPUT_CLS}
                style={{ paddingLeft: 26, paddingRight: 56 }}
              />
              <span
                style={{
                  position: 'absolute',
                  right: 12,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: '#888',
                  fontSize: 12,
                  pointerEvents: 'none',
                }}
              >
                /day
              </span>
            </div>
            <p
              style={{
                fontSize: 11,
                color: '#6B7280',
                marginTop: 4,
              }}
            >
              Min: $300. What talent actually get paid. Client sees $
              {dayRate
                ? Math.round(parseFloat(dayRate) * 1.15).toLocaleString()
                : '345'}
              /day (incl. 15% RS fee).
            </p>
          </Field>
        </div>

        <Divider />

        {/* Section 3 — Location */}
        <SectionHeading>Location</SectionHeading>
        <Field label="Venue / Location name">
          <input
            type="text"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="Smashbox Studios"
            className={INPUT_CLS}
          />
        </Field>
        <Field label="Address line">
          <input
            type="text"
            value={addressLine}
            onChange={(e) => setAddressLine(e.target.value)}
            className={INPUT_CLS}
          />
        </Field>
        <div className="flex gap-2">
          <div style={{ flex: 2 }}>
            <Field label="City">
              <input
                type="text"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                className={INPUT_CLS}
              />
            </Field>
          </div>
          <div style={{ flex: 1 }}>
            <Field label="State">
              <input
                type="text"
                value={stateCode}
                onChange={(e) => setStateCode(e.target.value)}
                className={INPUT_CLS}
              />
            </Field>
          </div>
          <div style={{ flex: 1 }}>
            <Field label="Zip">
              <input
                type="text"
                value={zip}
                onChange={(e) => setZip(e.target.value)}
                className={INPUT_CLS}
              />
            </Field>
          </div>
        </div>

        <Divider />

        {/* Section 4 — Crew */}
        <SectionHeading>Crew</SectionHeading>
        <Field label="Num talent needed">
          <input
            type="number"
            min={0}
            step={1}
            value={numTalent}
            onChange={(e) => setNumTalent(e.target.value)}
            className={INPUT_CLS}
          />
        </Field>
        <Field label="Crew needed">
          <div className="flex flex-wrap gap-2">
            {CREW_OPTIONS.map((opt) => {
              const active = crew.includes(opt.key)
              return (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => toggleCrew(opt.key)}
                  className="rounded-full transition-colors"
                  style={{
                    padding: '7px 14px',
                    fontSize: 12,
                    fontWeight: 600,
                    letterSpacing: '0.02em',
                    background: active ? '#1E3A6B' : '#F2F4F7',
                    color: active ? '#fff' : '#496275',
                    border: active
                      ? '1px solid #1E3A6B'
                      : '1px solid #E5E7EB',
                    cursor: 'pointer',
                  }}
                >
                  {active ? '✓ ' : '+ '}
                  {opt.label}
                </button>
              )
            })}
          </div>
        </Field>

        <Divider />

        {/* Section 5 — Notes */}
        <SectionHeading>Notes</SectionHeading>
        <Field label="Description">
          <textarea
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className={`${INPUT_CLS} resize-y`}
          />
        </Field>
        <Field label="Client notes (shown on talent's booking card)">
          <textarea
            rows={3}
            value={clientNotes}
            onChange={(e) => setClientNotes(e.target.value)}
            className={`${INPUT_CLS} resize-y`}
          />
        </Field>
        <Field label="Admin notes (private — not shown to talent)">
          <textarea
            rows={2}
            value={adminNotes}
            onChange={(e) => setAdminNotes(e.target.value)}
            className={`${INPUT_CLS} resize-y`}
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
          href={mode === 'edit' && initial.id ? `/admin/jobs/${initial.id}` : '/admin/jobs'}
          className="block text-center mt-3"
          style={{
            fontSize: 13,
            color: '#7A90AA',
            textDecoration: 'none',
          }}
        >
          Cancel
        </Link>
      </form>

      {mode === 'edit' && initial.id && (
        <div className="mt-6 text-center">
          <SoftDeleteButton jobId={initial.id} />
        </div>
      )}
    </div>
  )
}

function SoftDeleteButton({ jobId }: { jobId: string }) {
  const [confirming, setConfirming] = useState(false)
  const [deleting, setDeleting] = useState(false)

  return (
    <form
      action={async (fd: FormData) => {
        if (!confirming) {
          setConfirming(true)
          setTimeout(() => setConfirming(false), 3000)
          return
        }
        setDeleting(true)
        fd.set('jobId', jobId)
        await softDeleteJob(fd)
      }}
    >
      <button
        type="submit"
        disabled={deleting}
        style={{
          background: 'transparent',
          border: 'none',
          color: confirming ? '#DC2626' : '#F87171',
          fontSize: 12,
          fontWeight: 600,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          cursor: deleting ? 'wait' : 'pointer',
          padding: '8px 12px',
        }}
      >
        {deleting
          ? 'Cancelling…'
          : confirming
          ? 'Tap again to cancel this job'
          : 'Delete job'}
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

'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth-context'

type ClientOption = {
  id: string
  full_name: string | null
  first_name: string | null
  last_name: string | null
  client_profiles: { company_name: string | null } | { company_name: string | null }[] | null
}

function clientLabel(c: ClientOption): string {
  const cp = Array.isArray(c.client_profiles) ? c.client_profiles[0] : c.client_profiles
  return (
    cp?.company_name ||
    [c.first_name, c.last_name].filter(Boolean).join(' ') ||
    c.full_name ||
    'Unnamed client'
  )
}

export default function AdminNewJobPage() {
  const router = useRouter()
  const { user, supabase } = useAuth()

  const [clients, setClients] = useState<ClientOption[]>([])
  const [loadingClients, setLoadingClients] = useState(true)

  const [title, setTitle] = useState('')
  const [clientId, setClientId] = useState('')
  const [status, setStatus] = useState<'draft' | 'submitted' | 'crewing' | 'confirmed'>('draft')
  const [location, setLocation] = useState('')
  const [addressOpen, setAddressOpen] = useState(false)
  const [addressLine, setAddressLine] = useState('')
  const [city, setCity] = useState('')
  const [stateCode, setStateCode] = useState('')
  const [zip, setZip] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [callTime, setCallTime] = useState('')
  const [dayRate, setDayRate] = useState('')
  const [shootDaysRaw, setShootDaysRaw] = useState('')
  const [description, setDescription] = useState('')
  const [clientNotes, setClientNotes] = useState('')
  const [adminNotes, setAdminNotes] = useState('')
  const [numTalent, setNumTalent] = useState('')

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    async function load() {
      const { data, error } = await supabase
        .from('profiles')
        .select(
          `id, full_name, first_name, last_name,
           client_profiles (company_name)`
        )
        .eq('role', 'client')
        .order('first_name')
      if (cancelled) return
      if (!error) setClients((data ?? []) as ClientOption[])
      setLoadingClients(false)
    }
    load()
    return () => {
      cancelled = true
    }
  }, [supabase])

  function parseShootDays(raw: string): unknown {
    const trimmed = raw.trim()
    if (!trimmed) return null
    // Accept JSON array first
    if (trimmed.startsWith('[')) {
      try {
        return JSON.parse(trimmed)
      } catch {
        // fall through to CSV
      }
    }
    // Accept CSV of YYYY-MM-DD values → array of { date, call_time: null }
    const dates = trimmed
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
    if (dates.length === 0) return null
    return dates.map((d) => ({ date: d, call_time: null }))
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (saving) return
    setSaving(true)
    setError('')

    if (!title.trim()) {
      setError('Title is required.')
      setSaving(false)
      return
    }

    const payload: Record<string, unknown> = {
      title: title.trim(),
      client_id: clientId || null,
      status,
      location: location.trim() || null,
      address_line: addressLine.trim() || null,
      address_city: city.trim() || null,
      address_state: stateCode.trim() || null,
      address_zip: zip.trim() || null,
      start_date: startDate || null,
      end_date: endDate || null,
      call_time: callTime || null,
      day_rate_cents: dayRate ? Math.round(parseFloat(dayRate) * 100) : null,
      shoot_days: parseShootDays(shootDaysRaw),
      description: description.trim() || null,
      client_notes: clientNotes.trim() || null,
      admin_notes: adminNotes.trim() || null,
      num_talent: numTalent ? parseInt(numTalent, 10) : null,
      approved_by: user?.id ?? null,
      approved_at: status === 'draft' ? null : new Date().toISOString(),
    }

    const { data, error: insertErr } = await supabase
      .from('jobs')
      .insert(payload)
      .select('id')
      .single()

    if (insertErr || !data) {
      setError(insertErr?.message ?? 'Could not create job.')
      setSaving(false)
      return
    }

    router.push(`/admin/jobs/${data.id}`)
  }

  return (
    <div style={{ padding: '18px 18px', maxWidth: 640, margin: '0 auto' }}>
      <Link
        href="/admin/jobs"
        style={{
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: '#AABDE0',
          textDecoration: 'none',
        }}
      >
        ← Jobs
      </Link>
      <h1 style={{ fontSize: 22, fontWeight: 700, color: '#fff', marginTop: 8 }}>
        New job
      </h1>

      <form
        onSubmit={handleSave}
        style={{
          marginTop: 16,
          background: '#fff',
          borderRadius: 14,
          padding: 16,
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
          color: '#0F1B2E',
        }}
      >
        <Field label="Title" required>
          <input
            type="text"
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            style={inputStyle}
          />
        </Field>

        <Field label="Client">
          <select
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            style={inputStyle}
            disabled={loadingClients}
          >
            <option value="">{loadingClients ? 'Loading…' : 'Select client…'}</option>
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
            onChange={(e) =>
              setStatus(e.target.value as 'draft' | 'submitted' | 'crewing' | 'confirmed')
            }
            style={inputStyle}
          >
            <option value="draft">Draft</option>
            <option value="submitted">Submitted</option>
            <option value="crewing">Crewing</option>
            <option value="confirmed">Confirmed</option>
          </select>
        </Field>

        <Field label="Location">
          <input
            type="text"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="Venice Beach studio"
            style={inputStyle}
          />
        </Field>

        <button
          type="button"
          onClick={() => setAddressOpen((v) => !v)}
          style={{
            alignSelf: 'flex-start',
            background: 'transparent',
            border: 'none',
            color: '#1E3A6B',
            fontSize: 12,
            fontWeight: 600,
            textDecoration: 'underline',
            cursor: 'pointer',
            padding: 0,
          }}
        >
          {addressOpen ? 'Hide full address' : '+ Full address'}
        </button>
        {addressOpen && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <Field label="Address line">
              <input
                type="text"
                value={addressLine}
                onChange={(e) => setAddressLine(e.target.value)}
                style={inputStyle}
              />
            </Field>
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 8 }}>
              <Field label="City">
                <input
                  type="text"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  style={inputStyle}
                />
              </Field>
              <Field label="State">
                <input
                  type="text"
                  value={stateCode}
                  onChange={(e) => setStateCode(e.target.value)}
                  style={inputStyle}
                />
              </Field>
              <Field label="Zip">
                <input
                  type="text"
                  value={zip}
                  onChange={(e) => setZip(e.target.value)}
                  style={inputStyle}
                />
              </Field>
            </div>
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <Field label="Start date">
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              style={inputStyle}
            />
          </Field>
          <Field label="End date">
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              style={inputStyle}
            />
          </Field>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <Field label="Call time">
            <input
              type="time"
              value={callTime}
              onChange={(e) => setCallTime(e.target.value)}
              style={inputStyle}
            />
          </Field>
          <Field label="Day rate ($)">
            <input
              type="number"
              min={0}
              step={25}
              value={dayRate}
              onChange={(e) => setDayRate(e.target.value)}
              style={inputStyle}
            />
          </Field>
        </div>

        <Field label="Shoot days (CSV dates or JSON)">
          <textarea
            value={shootDaysRaw}
            onChange={(e) => setShootDaysRaw(e.target.value)}
            rows={2}
            placeholder="2026-05-01, 2026-05-02"
            style={{ ...inputStyle, resize: 'vertical' }}
          />
        </Field>

        <Field label="Description">
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            style={{ ...inputStyle, resize: 'vertical' }}
          />
        </Field>

        <Field label="Client notes">
          <textarea
            value={clientNotes}
            onChange={(e) => setClientNotes(e.target.value)}
            rows={2}
            style={{ ...inputStyle, resize: 'vertical' }}
          />
        </Field>

        <Field label="Admin notes">
          <textarea
            value={adminNotes}
            onChange={(e) => setAdminNotes(e.target.value)}
            rows={2}
            style={{ ...inputStyle, resize: 'vertical' }}
          />
        </Field>

        <Field label="Num talent">
          <input
            type="number"
            min={0}
            step={1}
            value={numTalent}
            onChange={(e) => setNumTalent(e.target.value)}
            style={inputStyle}
          />
        </Field>

        {error && (
          <p
            style={{
              fontSize: 12,
              color: '#b91c1c',
              background: 'rgba(239,68,68,0.08)',
              border: '1px solid rgba(239,68,68,0.25)',
              borderRadius: 8,
              padding: '8px 10px',
            }}
          >
            {error}
          </p>
        )}

        <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
          <Link
            href="/admin/jobs"
            style={{
              flex: 1,
              padding: '12px 0',
              borderRadius: 10,
              background: 'rgba(15,27,46,0.05)',
              color: '#0F1B2E',
              fontSize: 12,
              fontWeight: 600,
              textAlign: 'center',
              textDecoration: 'none',
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
            }}
          >
            Cancel
          </Link>
          <button
            type="submit"
            disabled={saving}
            style={{
              flex: 2,
              padding: '12px 0',
              borderRadius: 10,
              background: '#0F1B2E',
              color: '#F0A500',
              border: 'none',
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              cursor: saving ? 'wait' : 'pointer',
              opacity: saving ? 0.7 : 1,
            }}
          >
            {saving ? 'Saving…' : 'Create job'}
          </button>
        </div>
      </form>
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  padding: '10px 12px',
  border: '1px solid rgba(15,27,46,0.15)',
  borderRadius: 8,
  fontSize: 14,
  color: '#0F1B2E',
  background: '#fff',
  outline: 'none',
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
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span
        style={{
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: '#1E3A6B',
        }}
      >
        {label}
        {required && <span style={{ color: '#b91c1c' }}> *</span>}
      </span>
      {children}
    </label>
  )
}

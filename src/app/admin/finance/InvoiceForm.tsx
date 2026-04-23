'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase-browser'

type ClientOption = {
  id: string
  full_name: string | null
  client_profiles:
    | { company_name: string | null }
    | { company_name: string | null }[]
    | null
}

type JobOption = {
  id: string
  title: string
  start_date: string | null
  end_date: string | null
  day_rate_cents: number | null
}

type BookingOption = {
  id: string
  confirmed_rate_cents: number | null
  talent_id: string | null
  profiles:
    | {
        full_name: string | null
        first_name: string | null
        last_name: string | null
        talent_profiles:
          | { primary_role: string | null }
          | { primary_role: string | null }[]
          | null
      }
    | {
        full_name: string | null
        first_name: string | null
        last_name: string | null
        talent_profiles:
          | { primary_role: string | null }
          | { primary_role: string | null }[]
          | null
      }[]
    | null
  invoice_line_items:
    | Array<{
        id: string
        invoice_id: string
        invoices: { status: string } | { status: string }[] | null
      }>
    | null
}

type LineItem = {
  description: string
  quantity: number
  unit_price_cents: number
  booking_id: string | null
  talent_id: string | null
}

export type InvoiceFormInitial = {
  id?: string
  client_id?: string | null
  job_id?: string | null
  due_date?: string | null
  notes?: string | null
  tax_percent?: number
  invoice_number?: string | null
  line_items?: LineItem[]
}

type Props = {
  mode: 'new' | 'edit'
  initial: InvoiceFormInitial
  action: (formData: FormData) => Promise<void>
  preselectedJobId?: string | null
  lockedClient?: boolean
}

function unwrap<T>(v: T | T[] | null | undefined): T | null {
  if (v == null) return null
  return Array.isArray(v) ? v[0] ?? null : v
}

function clientLabel(c: ClientOption): string {
  const cp = unwrap(c.client_profiles)
  return cp?.company_name || c.full_name || 'Unnamed client'
}

function daysBetweenInclusive(start: string | null, end: string | null): number {
  if (!start) return 1
  const s = new Date(start)
  const e = end ? new Date(end) : s
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return 1
  const ms = e.getTime() - s.getTime()
  return Math.max(1, Math.round(ms / (1000 * 60 * 60 * 24)) + 1)
}

function formatShort(iso: string | null): string {
  if (!iso) return ''
  const parts = iso.split('-').map(Number)
  if (parts.length !== 3 || parts.some(Number.isNaN)) return ''
  const d = new Date(parts[0], parts[1] - 1, parts[2])
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function todayPlusDaysIso(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function fmtCents(cents: number): string {
  if (!cents && cents !== 0) return '$0'
  return `$${(cents / 100).toLocaleString('en-US', {
    maximumFractionDigits: 2,
  })}`
}

export function InvoiceForm({
  mode,
  initial,
  action,
  preselectedJobId,
  lockedClient,
}: Props) {
  const supabase = createClient()

  const [clients, setClients] = useState<ClientOption[]>([])
  const [loadingClients, setLoadingClients] = useState(mode === 'new')

  const [clientId, setClientId] = useState(initial.client_id ?? '')
  const [jobs, setJobs] = useState<JobOption[]>([])
  const [loadingJobs, setLoadingJobs] = useState(false)
  const [jobId, setJobId] = useState(initial.job_id ?? preselectedJobId ?? '')

  const [bookings, setBookings] = useState<BookingOption[]>([])
  const [autofillBusy, setAutofillBusy] = useState(false)

  const [items, setItems] = useState<LineItem[]>(
    initial.line_items && initial.line_items.length > 0
      ? initial.line_items
      : []
  )

  const [taxPercent, setTaxPercent] = useState<number>(initial.tax_percent ?? 0)
  const [dueDate, setDueDate] = useState<string>(
    initial.due_date ?? todayPlusDaysIso(14)
  )
  const [notes, setNotes] = useState<string>(initial.notes ?? '')

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // ─── Fetch clients on mount (new mode) ───
  useEffect(() => {
    if (mode === 'edit') return
    let cancelled = false
    async function load() {
      const { data } = await supabase
        .from('profiles')
        .select(`id, full_name, client_profiles (company_name)`)
        .eq('role', 'client')
        .order('full_name')
      if (cancelled) return
      setClients((data ?? []) as ClientOption[])
      setLoadingClients(false)
    }
    load()
    return () => {
      cancelled = true
    }
  }, [mode, supabase])

  // ─── Fetch jobs when client changes ───
  useEffect(() => {
    if (!clientId) {
      setJobs([])
      return
    }
    let cancelled = false
    async function load() {
      setLoadingJobs(true)
      const { data } = await supabase
        .from('jobs')
        .select('id, title, start_date, end_date, day_rate_cents')
        .eq('client_id', clientId)
        .order('start_date', { ascending: false, nullsFirst: false })
      if (cancelled) return
      setJobs((data ?? []) as JobOption[])
      setLoadingJobs(false)
    }
    load()
    return () => {
      cancelled = true
    }
  }, [clientId, supabase])

  // ─── Fetch confirmed bookings when job changes ───
  useEffect(() => {
    if (!jobId) {
      setBookings([])
      return
    }
    let cancelled = false
    async function load() {
      const { data } = await supabase
        .from('job_bookings')
        .select(
          `id, confirmed_rate_cents, talent_id,
           profiles!job_bookings_talent_id_fkey (full_name, first_name, last_name,
             talent_profiles (primary_role)),
           invoice_line_items (id, invoice_id,
             invoices (status))`
        )
        .eq('job_id', jobId)
        .eq('status', 'confirmed')
      if (cancelled) return
      setBookings((data ?? []) as unknown as BookingOption[])
    }
    load()
    return () => {
      cancelled = true
    }
  }, [jobId, supabase])

  const selectedJob = useMemo(
    () => jobs.find((j) => j.id === jobId) ?? null,
    [jobs, jobId]
  )

  const uninvoicedBookings = useMemo(() => {
    return bookings.filter((b) => {
      const live = (b.invoice_line_items ?? []).some((li) => {
        const inv = Array.isArray(li.invoices) ? li.invoices[0] : li.invoices
        return inv && inv.status !== 'void'
      })
      return !live
    })
  }, [bookings])

  function autofillFromBookings() {
    if (!selectedJob) return
    setAutofillBusy(true)
    const days = daysBetweenInclusive(
      selectedJob.start_date,
      selectedJob.end_date
    )
    const range =
      selectedJob.start_date && selectedJob.end_date &&
      selectedJob.start_date !== selectedJob.end_date
        ? `${formatShort(selectedJob.start_date)} – ${formatShort(selectedJob.end_date)}`
        : formatShort(selectedJob.start_date)

    const newItems: LineItem[] = uninvoicedBookings.map((b) => {
      const p = unwrap(b.profiles)
      const tp = p ? unwrap(p.talent_profiles) : null
      const name =
        [p?.first_name, p?.last_name].filter(Boolean).join(' ') ||
        p?.full_name ||
        'Talent'
      const role = tp?.primary_role ?? null
      const descBase = role ? `${name} — ${role}` : name
      const description = range ? `${descBase} (${range})` : descBase
      return {
        description,
        quantity: days,
        unit_price_cents: b.confirmed_rate_cents ?? 0,
        booking_id: b.id,
        talent_id: b.talent_id,
      }
    })
    setItems((prev) => [...prev, ...newItems])
    setAutofillBusy(false)
  }

  function addBlankLine() {
    setItems((prev) => [
      ...prev,
      {
        description: '',
        quantity: 1,
        unit_price_cents: 0,
        booking_id: null,
        talent_id: null,
      },
    ])
  }

  function updateLine(index: number, patch: Partial<LineItem>) {
    setItems((prev) =>
      prev.map((li, i) => (i === index ? { ...li, ...patch } : li))
    )
  }

  function removeLine(index: number) {
    setItems((prev) => prev.filter((_, i) => i !== index))
  }

  const subtotalCents = items.reduce(
    (s, li) => s + Math.round(li.quantity * li.unit_price_cents),
    0
  )
  const taxCents = Math.round(subtotalCents * (taxPercent / 100))
  // Line items are CLIENT-FACING per the rate rule (auto-invoice path
  // writes talent_net × 1.15 into unit_price_cents). totalCents is
  // therefore what the client owes; the 15% RS fee is embedded inside
  // it (not an addition on top), so we extract it as 15/115 of total.
  const RS_FEE_PERCENT = 15
  const clientTotalCents = subtotalCents + taxCents
  const rsFeeCents = Math.round((clientTotalCents * 15) / 115)
  const talentTotalCents = clientTotalCents - rsFeeCents

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (saving) return
    setSaving(true)
    setError('')

    if (!clientId) {
      setError('Please pick a client.')
      setSaving(false)
      return
    }
    const validItems = items.filter(
      (li) => li.description.trim() && li.unit_price_cents > 0
    )
    if (validItems.length === 0) {
      setError('Add at least one line item.')
      setSaving(false)
      return
    }

    const fd = new FormData()
    if (mode === 'edit' && initial.id) fd.set('invoiceId', initial.id)
    fd.set('client_id', clientId)
    fd.set('job_id', jobId)
    fd.set('due_date', dueDate)
    fd.set('notes', notes)
    fd.set('tax_percent', String(taxPercent))
    fd.set(
      'line_items',
      JSON.stringify(
        validItems.map((li) => ({
          description: li.description.trim(),
          quantity: li.quantity,
          unit_price_cents: li.unit_price_cents,
          booking_id: li.booking_id,
          talent_id: li.talent_id,
        }))
      )
    )

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

  const heading = mode === 'new' ? 'New invoice' : 'Edit invoice'
  const saveLabel = mode === 'new' ? 'Save as draft' : 'Save changes'
  const backHref =
    mode === 'edit' && initial.id ? `/admin/finance/${initial.id}` : '/admin/finance'

  return (
    <div className="mx-auto" style={{ maxWidth: 720, padding: '20px 18px 28px' }}>
      <Link href={backHref} style={{ fontSize: 13, color: '#7A90AA', textDecoration: 'none' }}>
        ← {mode === 'edit' ? 'Invoice' : 'Finance'}
      </Link>
      <h1 className="text-white" style={{ fontSize: 20, fontWeight: 600, marginTop: 8 }}>
        {heading}
      </h1>

      <form
        onSubmit={onSubmit}
        className="mt-4 bg-white rounded-xl"
        style={{ padding: 20, color: '#1E3A6B' }}
      >
        {/* ─── Client & job ─── */}
        <SectionHeading>Client &amp; job</SectionHeading>
        <Field label="Client" required>
          <select
            required
            value={clientId}
            onChange={(e) => {
              setClientId(e.target.value)
              setJobId('') // reset job when client changes
            }}
            disabled={loadingClients || lockedClient || mode === 'edit'}
            className={INPUT_CLS}
            style={
              loadingClients || lockedClient || mode === 'edit'
                ? { background: '#F3F4F6' }
                : undefined
            }
          >
            <option value="">
              {loadingClients ? 'Loading…' : 'Select client'}
            </option>
            {mode === 'edit' && clientId && clients.length === 0 && (
              <option value={clientId}>(existing client)</option>
            )}
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {clientLabel(c)}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Job (optional)">
          <select
            value={jobId}
            onChange={(e) => setJobId(e.target.value)}
            disabled={!clientId || loadingJobs || mode === 'edit'}
            className={INPUT_CLS}
            style={
              !clientId || loadingJobs || mode === 'edit'
                ? { background: '#F3F4F6' }
                : undefined
            }
          >
            <option value="">
              {loadingJobs
                ? 'Loading jobs…'
                : clientId
                ? 'No specific job'
                : 'Pick a client first'}
            </option>
            {jobs.map((j) => (
              <option key={j.id} value={j.id}>
                {j.title}
                {j.start_date ? ` · ${formatShort(j.start_date)}` : ''}
              </option>
            ))}
          </select>
        </Field>

        <Divider />

        {/* ─── Line items ─── */}
        <SectionHeading>Line items</SectionHeading>

        {jobId && uninvoicedBookings.length > 0 && (
          <button
            type="button"
            onClick={autofillFromBookings}
            disabled={autofillBusy}
            className="mb-3 rounded-lg"
            style={{
              padding: '8px 14px',
              fontSize: 12,
              fontWeight: 600,
              letterSpacing: '0.04em',
              background: '#EEF2FF',
              color: '#1E3A6B',
              border: '1px solid #C7D2FE',
              cursor: autofillBusy ? 'wait' : 'pointer',
            }}
          >
            {autofillBusy
              ? 'Adding…'
              : `✨ Auto-fill from ${uninvoicedBookings.length} confirmed booking${uninvoicedBookings.length === 1 ? '' : 's'}`}
          </button>
        )}

        {items.length === 0 ? (
          <p
            className="mb-3"
            style={{
              fontSize: 12,
              color: '#7A90AA',
              fontStyle: 'italic',
              padding: '12px 14px',
              background: '#F9FAFB',
              borderRadius: 8,
              border: '1px dashed #E5E7EB',
            }}
          >
            No line items yet. Add one below or auto-fill from bookings.
          </p>
        ) : (
          <div className="flex flex-col gap-2 mb-3">
            {items.map((li, i) => {
              const lineTotal = Math.round(li.quantity * li.unit_price_cents)
              return (
                <div
                  key={i}
                  className="flex items-start gap-2"
                  style={{ flexWrap: 'wrap' }}
                >
                  <input
                    type="text"
                    value={li.description}
                    onChange={(e) =>
                      updateLine(i, { description: e.target.value })
                    }
                    placeholder="Description"
                    className={INPUT_CLS}
                    style={{ flex: '2 1 240px', minWidth: 180 }}
                  />
                  <input
                    type="number"
                    min={0.5}
                    step={0.5}
                    value={li.quantity}
                    onChange={(e) =>
                      updateLine(i, {
                        quantity: Math.max(
                          0.5,
                          parseFloat(e.target.value) || 1
                        ),
                      })
                    }
                    aria-label="Quantity"
                    className={INPUT_CLS}
                    style={{ width: 70, flex: '0 0 70px' }}
                  />
                  <div style={{ position: 'relative', width: 110, flex: '0 0 110px' }}>
                    <span
                      style={{
                        position: 'absolute',
                        left: 10,
                        top: '50%',
                        transform: 'translateY(-50%)',
                        color: '#888',
                        fontSize: 13,
                        pointerEvents: 'none',
                      }}
                    >
                      $
                    </span>
                    <input
                      type="number"
                      min={0}
                      step={25}
                      value={li.unit_price_cents / 100}
                      onChange={(e) =>
                        updateLine(i, {
                          unit_price_cents: Math.round(
                            (parseFloat(e.target.value) || 0) * 100
                          ),
                        })
                      }
                      aria-label="Rate"
                      className={INPUT_CLS}
                      style={{ paddingLeft: 22 }}
                    />
                  </div>
                  <div
                    className="text-right"
                    style={{
                      flex: '0 0 90px',
                      fontSize: 14,
                      color: '#1E3A6B',
                      fontWeight: 600,
                      padding: '10px 0',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {fmtCents(lineTotal)}
                  </div>
                  <button
                    type="button"
                    onClick={() => removeLine(i)}
                    aria-label="Remove line item"
                    style={{
                      background: 'transparent',
                      border: '1px solid #FCA5A5',
                      color: '#DC2626',
                      fontSize: 14,
                      fontWeight: 600,
                      width: 34,
                      height: 40,
                      borderRadius: 8,
                      cursor: 'pointer',
                      flex: '0 0 34px',
                    }}
                  >
                    ×
                  </button>
                </div>
              )
            })}
          </div>
        )}

        <button
          type="button"
          onClick={addBlankLine}
          style={{
            background: 'transparent',
            border: '1px dashed #C7D2FE',
            color: '#1E3A6B',
            fontSize: 13,
            fontWeight: 600,
            padding: '10px 14px',
            borderRadius: 8,
            cursor: 'pointer',
            width: '100%',
          }}
        >
          + Add line item
        </button>

        {/* Totals */}
        <div
          className="mt-4 ml-auto"
          style={{ maxWidth: 260, textAlign: 'right' }}
        >
          <div
            className="flex items-center justify-between"
            style={{ fontSize: 13, color: '#496275' }}
          >
            <span>Subtotal</span>
            <span style={{ fontWeight: 600, color: '#1E3A6B' }}>
              {fmtCents(subtotalCents)}
            </span>
          </div>
          <div
            className="flex items-center justify-between mt-2"
            style={{ fontSize: 13, color: '#496275' }}
          >
            <span>Tax %</span>
            <div
              style={{
                width: 90,
                display: 'flex',
                alignItems: 'center',
                gap: 4,
              }}
            >
              <input
                type="number"
                min={0}
                max={100}
                step={0.5}
                value={taxPercent}
                onChange={(e) =>
                  setTaxPercent(Math.max(0, parseFloat(e.target.value) || 0))
                }
                className={INPUT_CLS}
                style={{ padding: '6px 8px', fontSize: 13, textAlign: 'right' }}
              />
              <span style={{ fontSize: 13 }}>%</span>
            </div>
          </div>
          {taxCents > 0 && (
            <div
              className="flex items-center justify-between mt-1"
              style={{ fontSize: 13, color: '#496275' }}
            >
              <span>Tax</span>
              <span style={{ fontWeight: 600, color: '#1E3A6B' }}>
                {fmtCents(taxCents)}
              </span>
            </div>
          )}
          <div
            className="flex items-center justify-between mt-3 pt-3"
            style={{ borderTop: '1px solid #E5E7EB', fontSize: 13, color: '#496275' }}
          >
            <span>Talent total (net)</span>
            <span style={{ fontWeight: 600, color: '#1E3A6B' }}>
              {fmtCents(talentTotalCents)}
            </span>
          </div>
          <div
            className="flex items-center justify-between mt-1"
            style={{ fontSize: 13, color: '#496275' }}
          >
            <span>RS fee ({RS_FEE_PERCENT}% of client total)</span>
            <span style={{ fontWeight: 600, color: '#1E3A6B' }}>
              {fmtCents(rsFeeCents)}
            </span>
          </div>
          <div
            className="flex items-center justify-between mt-2 pt-2"
            style={{ borderTop: '2px solid #1E3A6B' }}
          >
            <span style={{ fontSize: 14, fontWeight: 700, color: '#1E3A6B' }}>
              Client total
            </span>
            <span style={{ fontSize: 18, fontWeight: 700, color: '#1E3A6B' }}>
              {fmtCents(clientTotalCents)}
            </span>
          </div>
        </div>

        <Divider />

        {/* ─── Details ─── */}
        <SectionHeading>Details</SectionHeading>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Due date">
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className={INPUT_CLS}
            />
          </Field>
          <Field label="Invoice number">
            <input
              type="text"
              value={initial.invoice_number ?? ''}
              disabled
              placeholder={mode === 'new' ? 'Will be assigned on save' : ''}
              className={INPUT_CLS}
              style={{ background: '#F3F4F6', color: '#6B7280' }}
            />
          </Field>
        </div>
        <Field label="Notes (appears on the invoice)">
          <textarea
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
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
          href={backHref}
          className="block text-center mt-3"
          style={{ fontSize: 13, color: '#7A90AA', textDecoration: 'none' }}
        >
          Cancel
        </Link>
      </form>
    </div>
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

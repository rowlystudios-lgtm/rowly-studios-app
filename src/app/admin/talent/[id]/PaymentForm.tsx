'use client'

import { useState } from 'react'
import { recordTalentPayment } from '../actions'

export type UnpaidBooking = {
  id: string
  amountCents: number | null
  jobTitle: string | null
  jobStart: string | null
}

type Props = {
  talentId: string
  unpaidBookings: UnpaidBooking[]
}

const METHODS = [
  'Bank transfer',
  'Check',
  'PayPal',
  'Venmo',
  'Zelle',
  'Cash',
  'Other',
]

function todayIsoLA(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Los_Angeles',
  }).format(new Date())
}

function fmtCents(c: number | null | undefined): string {
  if (!c && c !== 0) return '—'
  return `$${(c / 100).toLocaleString('en-US', { maximumFractionDigits: 0 })}`
}

function bookingLabel(b: UnpaidBooking): string {
  const parts = [b.jobTitle ?? 'Untitled job']
  if (b.jobStart) parts.push(b.jobStart)
  if (b.amountCents != null) parts.push(fmtCents(b.amountCents))
  return parts.join(' · ')
}

export function PaymentForm({ talentId, unpaidBookings }: Props) {
  const [open, setOpen] = useState(false)
  const [amount, setAmount] = useState('')
  const [paymentDate, setPaymentDate] = useState(todayIsoLA())
  const [method, setMethod] = useState('Bank transfer')
  const [reference, setReference] = useState('')
  const [bookingId, setBookingId] = useState('')
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  function reset() {
    setAmount('')
    setPaymentDate(todayIsoLA())
    setMethod('Bank transfer')
    setReference('')
    setBookingId('')
    setError('')
  }

  function onPickBooking(id: string) {
    setBookingId(id)
    const match = unpaidBookings.find((b) => b.id === id)
    if (match?.amountCents != null && !amount) {
      setAmount(String(match.amountCents / 100))
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full rounded-lg bg-[#F0A500] hover:bg-[#F5B733] text-[#0F1B2E] transition-colors"
        style={{
          padding: '10px 0',
          fontSize: 12,
          fontWeight: 700,
          letterSpacing: '0.04em',
          textTransform: 'uppercase',
          border: 'none',
          cursor: 'pointer',
        }}
      >
        + Record payment
      </button>
    )
  }

  return (
    <form
      action={async (fd: FormData) => {
        if (busy) return
        setBusy(true)
        setError('')
        if (!amount.trim()) {
          setError('Enter an amount.')
          setBusy(false)
          return
        }
        fd.set('talent_id', talentId)
        fd.set('amount', amount)
        fd.set('payment_date', paymentDate)
        fd.set('method', method)
        fd.set('reference', reference)
        fd.set('booking_id', bookingId)
        try {
          await recordTalentPayment(fd)
          setSaved(true)
          reset()
          setTimeout(() => setSaved(false), 2500)
          setOpen(false)
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Payment failed.'
          setError(msg)
        } finally {
          setBusy(false)
        }
      }}
    >
      <div className="grid grid-cols-2 gap-2">
        <DarkField label="Amount ($)">
          <DollarInput value={amount} onChange={setAmount} autoFocus />
        </DarkField>
        <DarkField label="Date">
          <input
            type="date"
            value={paymentDate}
            onChange={(e) => setPaymentDate(e.target.value)}
            required
            className={DARK_INPUT_CLS}
          />
        </DarkField>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <DarkField label="Method">
          <select
            value={method}
            onChange={(e) => setMethod(e.target.value)}
            className={DARK_INPUT_CLS}
          >
            {METHODS.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </DarkField>
        <DarkField label="Reference">
          <input
            type="text"
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            placeholder="Transfer ID, check #, …"
            className={DARK_INPUT_CLS}
          />
        </DarkField>
      </div>
      <DarkField label="Link to booking (optional)">
        <select
          value={bookingId}
          onChange={(e) => onPickBooking(e.target.value)}
          className={DARK_INPUT_CLS}
        >
          <option value="">— No booking —</option>
          {unpaidBookings.map((b) => (
            <option key={b.id} value={b.id}>
              {bookingLabel(b)}
            </option>
          ))}
        </select>
      </DarkField>

      {error && (
        <p
          className="mt-2"
          style={{
            fontSize: 12,
            color: '#F87171',
            background: 'rgba(239,68,68,0.12)',
            border: '1px solid rgba(239,68,68,0.3)',
            padding: '8px 10px',
            borderRadius: 8,
          }}
        >
          {error}
        </p>
      )}
      {saved && (
        <p
          className="mt-2"
          style={{
            fontSize: 12,
            color: '#86EFAC',
            background: 'rgba(34,197,94,0.12)',
            border: '1px solid rgba(34,197,94,0.3)',
            padding: '8px 10px',
            borderRadius: 8,
          }}
        >
          Payment recorded ✓
        </p>
      )}

      <div className="flex gap-2 mt-3">
        <button
          type="button"
          onClick={() => {
            reset()
            setOpen(false)
          }}
          disabled={busy}
          style={{
            flex: 1,
            padding: '9px 0',
            borderRadius: 8,
            background: 'transparent',
            color: '#AABDE0',
            border: '1px solid rgba(170,189,224,0.25)',
            fontSize: 12,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={busy}
          style={{
            flex: 2,
            padding: '9px 0',
            borderRadius: 8,
            background: '#F0A500',
            color: '#0F1B2E',
            border: 'none',
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
            cursor: busy ? 'wait' : 'pointer',
            opacity: busy ? 0.7 : 1,
          }}
        >
          {busy ? 'Saving…' : 'Save payment'}
        </button>
      </div>
    </form>
  )
}

function DarkField({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <label className="block" style={{ marginBottom: 10 }}>
      <span
        style={{
          display: 'block',
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
          color: '#7A90AA',
          marginBottom: 4,
        }}
      >
        {label}
      </span>
      {children}
    </label>
  )
}

function DollarInput({
  value,
  onChange,
  autoFocus,
}: {
  value: string
  onChange: (v: string) => void
  autoFocus?: boolean
}) {
  return (
    <div style={{ position: 'relative' }}>
      <span
        style={{
          position: 'absolute',
          left: 10,
          top: '50%',
          transform: 'translateY(-50%)',
          color: '#7A90AA',
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
        required
        autoFocus={autoFocus}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={DARK_INPUT_CLS}
        style={{ paddingLeft: 22 }}
      />
    </div>
  )
}

const DARK_INPUT_CLS =
  'block w-full rounded-lg px-3 py-2 text-sm text-white bg-[rgba(255,255,255,0.05)] border border-[rgba(170,189,224,0.2)] focus:outline-none focus:ring-2 focus:ring-[#F0A500]/40 focus:border-[#F0A500]/50 transition'

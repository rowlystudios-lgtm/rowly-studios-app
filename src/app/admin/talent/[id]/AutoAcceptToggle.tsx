'use client'

import { useState } from 'react'
import { setAutoAccept } from '../actions'

type Props = {
  clientId: string
  talentId: string
  companyName: string
  jobsTogether: number
  autoAccept: boolean
  autoAcceptRateCents: number | null
  /** Fallback rate to pre-fill the input when enabling (talent's day rate). */
  defaultRateCents: number | null
}

function fmtUsd(c: number | null | undefined): string {
  if (!c && c !== 0) return '—'
  return `$${(c / 100).toLocaleString('en-US', { maximumFractionDigits: 0 })}`
}

function centsToDollars(c: number | null | undefined): string {
  return c != null ? String(c / 100) : ''
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).slice(0, 2)
  return parts.map((p) => p[0]?.toUpperCase() ?? '').join('') || '?'
}

export function AutoAcceptToggle({
  clientId,
  talentId,
  companyName,
  jobsTogether,
  autoAccept,
  autoAcceptRateCents,
  defaultRateCents,
}: Props) {
  const [busy, setBusy] = useState(false)
  const [opening, setOpening] = useState(false)
  const [rateDollars, setRateDollars] = useState(
    centsToDollars(autoAcceptRateCents ?? defaultRateCents)
  )

  async function turnOff() {
    setBusy(true)
    const fd = new FormData()
    fd.set('client_id', clientId)
    fd.set('talent_id', talentId)
    fd.set('enabled', 'false')
    await setAutoAccept(fd)
    setBusy(false)
  }

  async function turnOn(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setBusy(true)
    const fd = new FormData()
    fd.set('client_id', clientId)
    fd.set('talent_id', talentId)
    fd.set('enabled', 'true')
    fd.set('rate', rateDollars)
    await setAutoAccept(fd)
    setBusy(false)
    setOpening(false)
  }

  return (
    <article
      className="rounded-xl"
      style={{
        background: '#253D5E',
        padding: 14,
        border: '1px solid rgba(255,255,255,0.05)',
      }}
    >
      <div className="flex items-start gap-3">
        <div
          className="rounded-full flex items-center justify-center"
          style={{
            width: 40,
            height: 40,
            background: '#1E3A6B',
            color: '#fff',
            fontSize: 13,
            fontWeight: 700,
            flexShrink: 0,
          }}
        >
          {initials(companyName)}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p
            className="text-white"
            style={{ fontSize: 14, fontWeight: 600 }}
          >
            {companyName}
          </p>
          <p style={{ fontSize: 11, color: '#AABDE0', marginTop: 2 }}>
            {jobsTogether} job{jobsTogether === 1 ? '' : 's'} together
          </p>
        </div>
        {autoAccept && (
          <span
            className="rounded-full"
            style={{
              padding: '3px 9px',
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              background: 'rgba(34,197,94,0.18)',
              color: '#86EFAC',
              border: '1px solid rgba(34,197,94,0.35)',
              whiteSpace: 'nowrap',
              flexShrink: 0,
            }}
          >
            ⚡ Auto
          </span>
        )}
      </div>

      <p
        className="mt-3"
        style={{ fontSize: 12, color: '#C5D3E8', lineHeight: 1.5 }}
      >
        {autoAccept ? (
          <>
            New bookings from <strong>{companyName}</strong> go straight to{' '}
            <strong>confirmed</strong> at{' '}
            <strong>{fmtUsd(autoAcceptRateCents ?? defaultRateCents)}/day</strong>
            . No review needed.
          </>
        ) : (
          <>
            Auto-accept offers from <strong>{companyName}</strong>. When on, new
            bookings skip the offer/review step and confirm at the lock-in rate.
          </>
        )}
      </p>

      {autoAccept ? (
        <button
          type="button"
          disabled={busy}
          onClick={turnOff}
          className="mt-3 rounded-lg"
          style={{
            padding: '7px 12px',
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
            background: 'rgba(239,68,68,0.15)',
            color: '#F87171',
            border: '1px solid rgba(239,68,68,0.35)',
            cursor: busy ? 'wait' : 'pointer',
          }}
        >
          {busy ? '…' : 'Turn off auto-accept'}
        </button>
      ) : opening ? (
        <form onSubmit={turnOn} className="mt-3 flex gap-2 items-center">
          <div style={{ position: 'relative', flex: '1 1 140px' }}>
            <span
              style={{
                position: 'absolute',
                left: 10,
                top: '50%',
                transform: 'translateY(-50%)',
                color: '#7A90AA',
                fontSize: 13,
              }}
            >
              $
            </span>
            <input
              type="number"
              min={0}
              step={25}
              autoFocus
              required
              value={rateDollars}
              onChange={(e) => setRateDollars(e.target.value)}
              placeholder="Lock-in rate"
              style={{
                width: '100%',
                padding: '8px 10px 8px 22px',
                borderRadius: 8,
                border: '1px solid rgba(170,189,224,0.2)',
                background: 'rgba(255,255,255,0.05)',
                color: '#fff',
                fontSize: 13,
                outline: 'none',
              }}
            />
          </div>
          <button
            type="button"
            onClick={() => setOpening(false)}
            disabled={busy}
            style={{
              padding: '8px 10px',
              borderRadius: 8,
              background: 'transparent',
              color: '#AABDE0',
              border: '1px solid rgba(170,189,224,0.2)',
              fontSize: 11,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={busy || !rateDollars}
            style={{
              padding: '8px 12px',
              borderRadius: 8,
              background: '#F0A500',
              color: '#0F1B2E',
              border: 'none',
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
              cursor: busy ? 'wait' : 'pointer',
              opacity: busy ? 0.7 : 1,
            }}
          >
            {busy ? '…' : 'Enable'}
          </button>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setOpening(true)}
          className="mt-3 rounded-lg"
          style={{
            padding: '7px 12px',
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
            background: 'rgba(240,165,0,0.18)',
            color: '#F0A500',
            border: '1px solid rgba(240,165,0,0.35)',
            cursor: 'pointer',
          }}
        >
          ⚡ Enable auto-accept
        </button>
      )}
    </article>
  )
}

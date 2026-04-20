'use client'

import { useState } from 'react'
import {
  verifyTalent,
  updateTalentRate,
  updateRateFloor,
  updateAdminNotes,
} from '../actions'

type Props = {
  talentId: string
  verified: boolean
  dayRateCents: number | null
  rateFloorCents: number | null
  adminNotes: string | null
}

function centsToDollars(c: number | null): string {
  if (c == null) return ''
  return String(c / 100)
}

function centsToLabel(c: number | null): string {
  if (c == null) return '—'
  return `$${(c / 100).toLocaleString('en-US', { maximumFractionDigits: 0 })}`
}

export function TalentAdminControls({
  talentId,
  verified,
  dayRateCents,
  rateFloorCents,
  adminNotes,
}: Props) {
  return (
    <div className="flex flex-col gap-4">
      <VerifyControl talentId={talentId} verified={verified} />
      <RateControl
        talentId={talentId}
        label="Day rate"
        field="day_rate"
        valueCents={dayRateCents}
        action={updateTalentRate}
      />
      <RateControl
        talentId={talentId}
        label="Rate floor"
        field="rate_floor"
        valueCents={rateFloorCents}
        action={updateRateFloor}
      />
      <NotesControl talentId={talentId} initial={adminNotes ?? ''} />
    </div>
  )
}

function VerifyControl({
  talentId,
  verified,
}: {
  talentId: string
  verified: boolean
}) {
  const [busy, setBusy] = useState(false)
  return (
    <form
      action={async (fd: FormData) => {
        setBusy(true)
        fd.set('id', talentId)
        fd.set('verified', verified ? 'false' : 'true')
        await verifyTalent(fd)
        setBusy(false)
      }}
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <p
            style={{
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              color: '#7A90AA',
            }}
          >
            Verification
          </p>
          <p style={{ fontSize: 13, color: '#C5D3E8', marginTop: 2 }}>
            {verified
              ? 'Visible in roster, assignable to jobs'
              : 'Hidden from the roster until verified'}
          </p>
        </div>
        <button
          type="submit"
          disabled={busy}
          className="rounded-lg"
          style={{
            padding: '8px 12px',
            fontSize: 12,
            fontWeight: 600,
            letterSpacing: '0.04em',
            background: verified
              ? 'rgba(239,68,68,0.15)'
              : 'rgba(34,197,94,0.15)',
            color: verified ? '#F87171' : '#86EFAC',
            border: verified
              ? '1px solid rgba(239,68,68,0.35)'
              : '1px solid rgba(34,197,94,0.35)',
            cursor: busy ? 'wait' : 'pointer',
            whiteSpace: 'nowrap',
          }}
        >
          {busy
            ? '…'
            : verified
            ? 'Revoke verification'
            : '✓ Verify talent'}
        </button>
      </div>
    </form>
  )
}

function RateControl({
  talentId,
  label,
  field,
  valueCents,
  action,
}: {
  talentId: string
  label: string
  field: string
  valueCents: number | null
  action: (fd: FormData) => Promise<void>
}) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(centsToDollars(valueCents))
  const [busy, setBusy] = useState(false)

  if (!editing) {
    return (
      <div className="flex items-center justify-between gap-3">
        <div>
          <p
            style={{
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              color: '#7A90AA',
            }}
          >
            {label}
          </p>
          <p
            style={{
              fontSize: 14,
              color: '#fff',
              fontWeight: 600,
              marginTop: 2,
            }}
          >
            {centsToLabel(valueCents)}
            <span style={{ color: '#7A90AA', fontWeight: 400, fontSize: 12 }}>
              {' '}
              / day
            </span>
          </p>
        </div>
        <button
          type="button"
          onClick={() => setEditing(true)}
          style={{
            background: 'transparent',
            border: '1px solid rgba(170,189,224,0.25)',
            color: '#AABDE0',
            fontSize: 11,
            fontWeight: 600,
            padding: '6px 12px',
            borderRadius: 8,
            letterSpacing: '0.04em',
            cursor: 'pointer',
          }}
        >
          Edit
        </button>
      </div>
    )
  }

  return (
    <form
      action={async (fd: FormData) => {
        setBusy(true)
        fd.set('id', talentId)
        fd.set(field, value)
        await action(fd)
        setBusy(false)
        setEditing(false)
      }}
    >
      <p
        style={{
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: '0.14em',
          textTransform: 'uppercase',
          color: '#7A90AA',
          marginBottom: 6,
        }}
      >
        {label}
      </p>
      <div className="flex gap-2">
        <div style={{ position: 'relative', flex: 1 }}>
          <span
            style={{
              position: 'absolute',
              left: 12,
              top: '50%',
              transform: 'translateY(-50%)',
              color: '#7A90AA',
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
            value={value}
            onChange={(e) => setValue(e.target.value)}
            autoFocus
            style={{
              width: '100%',
              padding: '10px 12px 10px 26px',
              borderRadius: 8,
              border: '1px solid rgba(170,189,224,0.2)',
              background: 'rgba(255,255,255,0.05)',
              color: '#fff',
              fontSize: 14,
              outline: 'none',
            }}
          />
          <p
            style={{
              marginTop: 4,
              fontSize: 10,
              color: '#7A90AA',
              letterSpacing: '0.04em',
            }}
          >
            Min: $300
          </p>
        </div>
        <button
          type="button"
          onClick={() => setEditing(false)}
          disabled={busy}
          style={{
            padding: '10px 12px',
            borderRadius: 8,
            background: 'transparent',
            color: '#AABDE0',
            border: '1px solid rgba(170,189,224,0.2)',
            fontSize: 12,
            fontWeight: 500,
            cursor: 'pointer',
          }}
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={busy}
          style={{
            padding: '10px 14px',
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
          {busy ? '…' : 'Save'}
        </button>
      </div>
    </form>
  )
}

function NotesControl({
  talentId,
  initial,
}: {
  talentId: string
  initial: string
}) {
  const [notes, setNotes] = useState(initial)
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)
  const dirty = notes !== initial

  return (
    <form
      action={async (fd: FormData) => {
        if (!dirty) return
        setBusy(true)
        setSaved(false)
        fd.set('id', talentId)
        fd.set('notes', notes)
        await updateAdminNotes(fd)
        setBusy(false)
        setSaved(true)
        setTimeout(() => setSaved(false), 2000)
      }}
    >
      <p
        style={{
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: '0.14em',
          textTransform: 'uppercase',
          color: '#7A90AA',
          marginBottom: 6,
        }}
      >
        Admin notes (private)
      </p>
      <textarea
        rows={3}
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Private notes about this talent — only admins see this."
        style={{
          width: '100%',
          padding: '10px 12px',
          borderRadius: 8,
          border: '1px solid rgba(170,189,224,0.2)',
          background: 'rgba(255,255,255,0.05)',
          color: '#fff',
          fontSize: 13,
          outline: 'none',
          resize: 'vertical',
          lineHeight: 1.5,
        }}
      />
      <div className="flex items-center justify-end gap-2 mt-2">
        {saved && (
          <span style={{ fontSize: 11, color: '#4ADE80' }}>
            ✓ Saved
          </span>
        )}
        <button
          type="submit"
          disabled={busy || !dirty}
          style={{
            padding: '8px 14px',
            borderRadius: 8,
            background: dirty ? '#F0A500' : 'rgba(170,189,224,0.12)',
            color: dirty ? '#0F1B2E' : '#7A90AA',
            border: 'none',
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
            cursor: busy ? 'wait' : dirty ? 'pointer' : 'not-allowed',
            opacity: busy ? 0.7 : 1,
          }}
        >
          {busy ? '…' : 'Save note'}
        </button>
      </div>
    </form>
  )
}

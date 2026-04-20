'use client'

import { useState } from 'react'
import { markW9Received, toggle1099Sent } from '../actions'

const ENTITY_OPTIONS = [
  { key: '', label: 'Select entity type' },
  { key: 'individual', label: 'Individual / Sole Proprietor' },
  { key: 'single_member_llc', label: 'Single-member LLC' },
  { key: 'llc', label: 'LLC (taxed as S-corp)' },
  { key: 'c_corp', label: 'C-Corporation' },
  { key: 's_corp', label: 'S-Corporation' },
  { key: 'partnership', label: 'Partnership' },
  { key: 'other', label: 'Other' },
]

export function W9Form({ talentId }: { talentId: string }) {
  const [open, setOpen] = useState(false)
  const [driveUrl, setDriveUrl] = useState('')
  const [legalName, setLegalName] = useState('')
  const [last4, setLast4] = useState('')
  const [entityType, setEntityType] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg"
        style={{
          padding: '8px 14px',
          fontSize: 12,
          fontWeight: 700,
          letterSpacing: '0.04em',
          background: 'rgba(240,165,0,0.18)',
          color: '#F0A500',
          border: '1px solid rgba(240,165,0,0.35)',
          cursor: 'pointer',
          whiteSpace: 'nowrap',
        }}
      >
        Mark W-9 received
      </button>
    )
  }

  return (
    <form
      action={async (fd: FormData) => {
        setBusy(true)
        setError('')
        if (!legalName.trim()) {
          setError('Legal name is required.')
          setBusy(false)
          return
        }
        fd.set('talent_id', talentId)
        fd.set('w9_drive_url', driveUrl)
        fd.set('legal_name', legalName)
        fd.set('tax_id_last4', last4)
        fd.set('entity_type', entityType)
        try {
          await markW9Received(fd)
          setOpen(false)
          setDriveUrl('')
          setLegalName('')
          setLast4('')
          setEntityType('')
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Save failed.'
          setError(msg)
        } finally {
          setBusy(false)
        }
      }}
      className="w-full"
    >
      <div className="grid grid-cols-2 gap-2">
        <DarkField label="Legal name">
          <input
            type="text"
            required
            autoFocus
            value={legalName}
            onChange={(e) => setLegalName(e.target.value)}
            className={DARK_INPUT_CLS}
          />
        </DarkField>
        <DarkField label="Tax ID last 4">
          <input
            type="text"
            maxLength={4}
            inputMode="numeric"
            value={last4}
            onChange={(e) =>
              setLast4(e.target.value.replace(/[^\d]/g, '').slice(0, 4))
            }
            className={DARK_INPUT_CLS}
          />
        </DarkField>
      </div>
      <DarkField label="Entity type">
        <select
          value={entityType}
          onChange={(e) => setEntityType(e.target.value)}
          className={DARK_INPUT_CLS}
        >
          {ENTITY_OPTIONS.map((o) => (
            <option key={o.key || 'none'} value={o.key}>
              {o.label}
            </option>
          ))}
        </select>
      </DarkField>
      <DarkField label="W-9 Drive URL (paste link)">
        <input
          type="url"
          value={driveUrl}
          onChange={(e) => setDriveUrl(e.target.value)}
          placeholder="https://drive.google.com/…"
          className={DARK_INPUT_CLS}
        />
      </DarkField>

      {error && (
        <p
          className="mt-1"
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

      <div className="flex gap-2 mt-2">
        <button
          type="button"
          onClick={() => setOpen(false)}
          disabled={busy}
          style={{
            flex: 1,
            padding: '8px 0',
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
            padding: '8px 0',
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
          {busy ? 'Saving…' : 'Save W-9'}
        </button>
      </div>
    </form>
  )
}

export function Toggle1099SentButton({
  talentId,
  sent,
}: {
  talentId: string
  sent: boolean
}) {
  const [busy, setBusy] = useState(false)
  return (
    <form
      action={async (fd: FormData) => {
        setBusy(true)
        fd.set('talent_id', talentId)
        fd.set('next', sent ? 'false' : 'true')
        await toggle1099Sent(fd)
        setBusy(false)
      }}
    >
      <button
        type="submit"
        disabled={busy}
        className="rounded-lg"
        style={{
          padding: '6px 12px',
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: '0.04em',
          textTransform: 'uppercase',
          background: sent
            ? 'rgba(34,197,94,0.18)'
            : 'rgba(240,165,0,0.18)',
          color: sent ? '#86EFAC' : '#F0A500',
          border: sent
            ? '1px solid rgba(34,197,94,0.35)'
            : '1px solid rgba(240,165,0,0.35)',
          cursor: busy ? 'wait' : 'pointer',
        }}
      >
        {busy ? '…' : sent ? '✓ 1099 sent' : 'Mark 1099 sent'}
      </button>
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

const DARK_INPUT_CLS =
  'block w-full rounded-lg px-3 py-2 text-sm text-white bg-[rgba(255,255,255,0.05)] border border-[rgba(170,189,224,0.2)] focus:outline-none focus:ring-2 focus:ring-[#F0A500]/40 focus:border-[#F0A500]/50 transition'

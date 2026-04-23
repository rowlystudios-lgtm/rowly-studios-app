'use client'

import { useState, useTransition } from 'react'
import { sendCallSheet, type CallSheetMode } from './call-sheet-actions'

type Props = {
  jobId: string
  clientEmail: string | null
  confirmedTalentCount: number
  callSheetSentAt: string | null
}

export function CallSheetButtons({
  jobId,
  clientEmail,
  confirmedTalentCount,
  callSheetSentAt,
}: Props) {
  const [pending, startTransition] = useTransition()
  const [activeMode, setActiveMode] = useState<CallSheetMode | null>(null)
  const [success, setSuccess] = useState<{ sentTo: string[] } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [lastSent, setLastSent] = useState<string | null>(callSheetSentAt)

  const noClient = !clientEmail
  const noTalent = confirmedTalentCount === 0

  function fire(mode: CallSheetMode) {
    if (pending) return
    setActiveMode(mode)
    setSuccess(null)
    setError(null)
    startTransition(async () => {
      const fd = new FormData()
      fd.set('jobId', jobId)
      fd.set('mode', mode)
      const res = await sendCallSheet(fd)
      if (res.error) {
        setError(res.error)
      } else if (res.success) {
        setSuccess({ sentTo: res.sentTo ?? [] })
        setLastSent(new Date().toISOString())
      }
      setActiveMode(null)
    })
  }

  const lastSentLabel = lastSent
    ? new Date(lastSent).toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      })
    : null

  return (
    <section
      className="rounded-xl bg-[#1A2E4A] border border-white/5"
      style={{ padding: 16 }}
    >
      <div className="flex items-center justify-between mb-3">
        <p
          style={{
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            color: '#7A90AA',
          }}
        >
          Call sheet
        </p>
        {lastSentLabel && (
          <span style={{ fontSize: 11, color: '#86EFAC' }}>
            ✓ Last sent {lastSentLabel}
          </span>
        )}
      </div>

      {noTalent ? (
        <div
          className="rounded-lg"
          style={{
            background: 'rgba(170,189,224,0.08)',
            border: '1px solid rgba(170,189,224,0.2)',
            padding: '14px 16px',
            fontSize: 13,
            color: '#AABDE0',
          }}
        >
          Add confirmed talent to generate a call sheet.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
          <CallSheetButton
            mode="client_only"
            label="📧 Send to Client"
            sublabel={
              clientEmail ? `Client email only` : 'No client email on file'
            }
            disabled={pending || noClient}
            busy={pending && activeMode === 'client_only'}
            onClick={() => fire('client_only')}
          />
          <CallSheetButton
            mode="everyone"
            label="📬 Send to Everyone"
            sublabel={
              noClient
                ? 'No client email on file'
                : `Client + ${confirmedTalentCount} confirmed talent`
            }
            disabled={pending || noClient || noTalent}
            busy={pending && activeMode === 'everyone'}
            onClick={() => fire('everyone')}
          />
        </div>
      )}

      {success && (
        <div
          role="status"
          className="mt-3 rounded-lg"
          style={{
            background: 'rgba(74,222,128,0.12)',
            border: '1px solid rgba(74,222,128,0.4)',
            padding: '10px 14px',
            fontSize: 12,
            color: '#86EFAC',
          }}
        >
          <p style={{ fontWeight: 600 }}>
            Call sheet sent to {success.sentTo.length} recipient
            {success.sentTo.length === 1 ? '' : 's'}.
          </p>
          {success.sentTo.length > 0 && (
            <p style={{ marginTop: 4, lineHeight: 1.5, color: '#A7F3D0' }}>
              {success.sentTo.join(', ')}
            </p>
          )}
        </div>
      )}

      {error && (
        <div
          role="alert"
          className="mt-3 rounded-lg"
          style={{
            background: 'rgba(239,68,68,0.12)',
            border: '1px solid rgba(239,68,68,0.4)',
            padding: '10px 14px',
            fontSize: 12,
            color: '#FCA5A5',
          }}
        >
          {error}
        </div>
      )}
    </section>
  )
}

function CallSheetButton({
  label,
  sublabel,
  disabled,
  busy,
  onClick,
}: {
  mode: CallSheetMode
  label: string
  sublabel: string
  disabled: boolean
  busy: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="rounded-xl text-left transition-colors"
      style={{
        padding: '14px 16px',
        background: disabled ? 'rgba(255,255,255,0.04)' : '#1E3A6B',
        color: disabled ? 'rgba(170,189,224,0.45)' : '#fff',
        border: '1px solid rgba(255,255,255,0.08)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        minHeight: 64,
        opacity: disabled && !busy ? 0.7 : 1,
      }}
    >
      <div style={{ fontSize: 14, fontWeight: 600 }}>
        {busy ? 'Sending…' : label}
      </div>
      <div
        style={{
          fontSize: 11,
          color: disabled ? 'rgba(170,189,224,0.5)' : 'rgba(255,255,255,0.7)',
          marginTop: 4,
        }}
      >
        {sublabel}
      </div>
    </button>
  )
}

'use client'

import { useState } from 'react'
import { markAsSent } from '../actions'

type Props = {
  invoiceId: string
  gmailUrl: string
  label?: string
  variant?: 'primary' | 'secondary'
  /** When true, skips the "mark as sent" confirm (already sent). */
  reminder?: boolean
}

export function GmailSendButton({
  invoiceId,
  gmailUrl,
  label = 'Send via Gmail',
  variant = 'primary',
  reminder = false,
}: Props) {
  const [opened, setOpened] = useState(false)
  const [busy, setBusy] = useState(false)

  function openCompose() {
    window.open(gmailUrl, '_blank', 'noopener,noreferrer')
    if (!reminder) setOpened(true)
  }

  const primary: React.CSSProperties = {
    width: '100%',
    padding: '14px 0',
    fontSize: 14,
    fontWeight: 600,
    letterSpacing: '0.01em',
    background: '#1E3A6B',
    color: '#fff',
    border: 'none',
    borderRadius: 12,
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  }
  const secondary: React.CSSProperties = {
    padding: '9px 14px',
    fontSize: 12,
    fontWeight: 600,
    letterSpacing: '0.04em',
    background: 'rgba(255,255,255,0.06)',
    color: '#AABDE0',
    border: '1px solid rgba(170,189,224,0.2)',
    borderRadius: 10,
    cursor: 'pointer',
  }

  return (
    <div>
      <button
        type="button"
        onClick={openCompose}
        style={variant === 'primary' ? primary : secondary}
      >
        <span aria-hidden style={{ fontSize: 14 }}>
          ✉
        </span>
        {label}
      </button>

      {opened && (
        <div
          className="mt-3 rounded-xl"
          style={{
            background: 'rgba(59,130,246,0.12)',
            border: '1px solid rgba(59,130,246,0.35)',
            padding: 14,
          }}
        >
          <p
            style={{
              fontSize: 13,
              color: '#93C5FD',
              fontWeight: 600,
              marginBottom: 10,
            }}
          >
            Did you send the email?
          </p>
          <div className="flex gap-2 flex-wrap">
            <form
              action={async (fd: FormData) => {
                setBusy(true)
                fd.set('invoiceId', invoiceId)
                await markAsSent(fd)
                setBusy(false)
                setOpened(false)
              }}
              style={{ flex: 1, minWidth: 160 }}
            >
              <button
                type="submit"
                disabled={busy}
                style={{
                  width: '100%',
                  padding: '10px 0',
                  borderRadius: 10,
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
                {busy ? 'Marking…' : 'Yes — mark as sent'}
              </button>
            </form>
            <button
              type="button"
              disabled={busy}
              onClick={() => setOpened(false)}
              style={{
                flex: 1,
                minWidth: 100,
                padding: '10px 0',
                borderRadius: 10,
                background: 'transparent',
                color: '#AABDE0',
                border: '1px solid rgba(170,189,224,0.25)',
                fontSize: 12,
                fontWeight: 600,
                letterSpacing: '0.04em',
                textTransform: 'uppercase',
                cursor: 'pointer',
              }}
            >
              Not yet
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

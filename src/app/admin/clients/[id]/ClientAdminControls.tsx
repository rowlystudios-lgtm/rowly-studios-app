'use client'

import { useState } from 'react'
import { verifyClient, updateClientNotes } from '../actions'

export function ClientAdminControls({
  clientId,
  verified,
  adminNotes,
}: {
  clientId: string
  verified: boolean
  adminNotes: string | null
}) {
  return (
    <div className="flex flex-col gap-4">
      <NotesControl clientId={clientId} initial={adminNotes ?? ''} />
      <VerifyControl clientId={clientId} verified={verified} />
    </div>
  )
}

function NotesControl({
  clientId,
  initial,
}: {
  clientId: string
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
        fd.set('id', clientId)
        fd.set('notes', notes)
        await updateClientNotes(fd)
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
        placeholder="Private notes about this client — only admins see this."
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
          <span style={{ fontSize: 11, color: '#4ADE80' }}>✓ Saved</span>
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

function VerifyControl({
  clientId,
  verified,
}: {
  clientId: string
  verified: boolean
}) {
  const [busy, setBusy] = useState(false)

  return (
    <div
      className="pt-4"
      style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }}
    >
      <div className="flex items-center justify-between gap-3">
        <div style={{ flex: 1, minWidth: 0 }}>
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
          {verified ? (
            <p
              style={{ fontSize: 13, color: '#4ADE80', marginTop: 2, fontWeight: 600 }}
            >
              ✓ Account verified
            </p>
          ) : (
            <p
              style={{ fontSize: 13, color: '#F0A500', marginTop: 2, fontWeight: 600 }}
            >
              Not verified
            </p>
          )}
        </div>
        <form
          action={async (fd: FormData) => {
            setBusy(true)
            fd.set('id', clientId)
            fd.set('verified', verified ? 'false' : 'true')
            await verifyClient(fd)
            setBusy(false)
          }}
        >
          <button
            type="submit"
            disabled={busy}
            className="rounded-lg"
            style={{
              padding: '7px 14px',
              fontSize: 12,
              fontWeight: 600,
              letterSpacing: '0.04em',
              background: verified
                ? 'transparent'
                : 'rgba(34,197,94,0.15)',
              color: verified ? '#F87171' : '#86EFAC',
              border: verified
                ? '1px solid rgba(239,68,68,0.35)'
                : '1px solid rgba(34,197,94,0.35)',
              cursor: busy ? 'wait' : 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            {busy ? '…' : verified ? 'Revoke' : 'Verify now'}
          </button>
        </form>
      </div>
    </div>
  )
}

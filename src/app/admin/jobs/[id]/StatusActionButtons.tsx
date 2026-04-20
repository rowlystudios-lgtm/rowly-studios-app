'use client'

import { useState } from 'react'
import { updateJobStatus } from '../actions'

type Props = {
  jobId: string
  currentStatus: string
}

type Action = {
  next: string
  label: string
  tone?: 'neutral' | 'amber' | 'red'
  requireConfirm?: boolean
}

function actionsFor(status: string): Action[] {
  switch (status) {
    case 'crewing':
      return [
        { next: 'submitted', label: 'Mark submitted' },
        { next: 'confirmed', label: 'Mark confirmed' },
        { next: 'wrapped', label: 'Wrap job', tone: 'amber', requireConfirm: true },
        { next: 'cancelled', label: 'Cancel', tone: 'red', requireConfirm: true },
      ]
    case 'submitted':
      return [
        { next: 'crewing', label: 'Mark crewing' },
        { next: 'confirmed', label: 'Mark confirmed' },
        { next: 'wrapped', label: 'Wrap job', tone: 'amber', requireConfirm: true },
        { next: 'cancelled', label: 'Cancel', tone: 'red', requireConfirm: true },
      ]
    case 'confirmed':
      return [
        { next: 'crewing', label: 'Mark crewing' },
        { next: 'wrapped', label: 'Wrap job', tone: 'amber', requireConfirm: true },
        { next: 'cancelled', label: 'Cancel', tone: 'red', requireConfirm: true },
      ]
    default:
      return []
  }
}

export function StatusActionButtons({ jobId, currentStatus }: Props) {
  const actions = actionsFor(currentStatus)
  if (actions.length === 0) return null

  return (
    <div className="flex flex-wrap gap-2 mt-4">
      {actions.map((a) => (
        <StatusButton key={a.next} jobId={jobId} action={a} />
      ))}
    </div>
  )
}

function StatusButton({ jobId, action }: { jobId: string; action: Action }) {
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)

  const base =
    'rounded-lg transition-colors text-[12px] font-semibold tracking-wider uppercase whitespace-nowrap'
  const padding = { padding: '8px 12px', letterSpacing: '0.04em' } as const

  let style: React.CSSProperties = {
    ...padding,
    background: 'rgba(255,255,255,0.06)',
    color: '#AABDE0',
    border: '1px solid rgba(170,189,224,0.2)',
    cursor: busy ? 'wait' : 'pointer',
  }
  if (action.tone === 'amber') {
    style = {
      ...padding,
      background: confirming
        ? 'rgba(240,165,0,0.35)'
        : 'rgba(240,165,0,0.15)',
      color: '#F0A500',
      border: '1px solid rgba(240,165,0,0.35)',
      cursor: busy ? 'wait' : 'pointer',
    }
  } else if (action.tone === 'red') {
    style = {
      ...padding,
      background: confirming
        ? 'rgba(239,68,68,0.35)'
        : 'rgba(239,68,68,0.15)',
      color: '#F87171',
      border: '1px solid rgba(239,68,68,0.35)',
      cursor: busy ? 'wait' : 'pointer',
    }
  }

  return (
    <form
      action={async (fd: FormData) => {
        if (action.requireConfirm && !confirming) {
          setConfirming(true)
          setTimeout(() => setConfirming(false), 3000)
          return
        }
        setBusy(true)
        fd.set('jobId', jobId)
        fd.set('status', action.next)
        await updateJobStatus(fd)
        setBusy(false)
        setConfirming(false)
      }}
    >
      <button type="submit" disabled={busy} className={base} style={style}>
        {busy ? '…' : confirming ? 'Tap again to confirm' : action.label}
      </button>
    </form>
  )
}

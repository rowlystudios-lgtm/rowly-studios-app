'use client'

import { useState } from 'react'
import {
  syncJobsToNotion,
  syncTalentToNotion,
  syncClientsToNotion,
} from './actions'

type Result = { synced: number; errors: string[] } | null

type Kind = 'jobs' | 'talent' | 'clients'

function runForKind(kind: Kind) {
  if (kind === 'jobs') return syncJobsToNotion
  if (kind === 'talent') return syncTalentToNotion
  return syncClientsToNotion
}

export function SyncButton({
  kind,
  lastSynced,
  label,
}: {
  kind: Kind
  lastSynced: string | null
  label: string
}) {
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<Result>(null)

  async function run() {
    setBusy(true)
    setResult(null)
    const r = await runForKind(kind)()
    setBusy(false)
    setResult(r)
  }

  return (
    <div
      className="rounded-xl"
      style={{
        background: '#253D5E',
        padding: 14,
        border: '1px solid rgba(255,255,255,0.05)',
      }}
    >
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
      <p style={{ fontSize: 12, color: '#AABDE0', marginTop: 6 }}>
        {lastSynced ? `Last synced ${lastSynced}` : 'Never synced'}
      </p>
      <button
        type="button"
        onClick={run}
        disabled={busy}
        className="mt-3 w-full rounded-lg"
        style={{
          padding: '8px 0',
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: '0.04em',
          textTransform: 'uppercase',
          background: '#F0A500',
          color: '#0F1B2E',
          border: 'none',
          cursor: busy ? 'wait' : 'pointer',
          opacity: busy ? 0.7 : 1,
        }}
      >
        {busy ? 'Syncing…' : 'Sync now'}
      </button>
      {result && (
        <p
          className="mt-2"
          style={{
            fontSize: 11,
            color: result.errors.length === 0 ? '#4ADE80' : '#F0A500',
            lineHeight: 1.4,
          }}
        >
          Synced {result.synced}
          {result.errors.length > 0 &&
            ` · ${result.errors.length} error${result.errors.length === 1 ? '' : 's'}`}
        </p>
      )}
      {result && result.errors.length > 0 && (
        <p
          className="mt-1"
          style={{
            fontSize: 10,
            color: '#F87171',
            lineHeight: 1.4,
            maxHeight: 60,
            overflowY: 'auto',
          }}
        >
          {result.errors.slice(0, 3).join(' · ')}
        </p>
      )}
    </div>
  )
}

export function SyncAllButton() {
  const [busy, setBusy] = useState(false)
  const [summary, setSummary] = useState<string | null>(null)

  async function run() {
    setBusy(true)
    setSummary(null)
    const jobs = await syncJobsToNotion()
    const talent = await syncTalentToNotion()
    const clients = await syncClientsToNotion()
    const totalSynced = jobs.synced + talent.synced + clients.synced
    const totalErrors =
      jobs.errors.length + talent.errors.length + clients.errors.length
    setBusy(false)
    setSummary(
      totalErrors === 0
        ? `Synced ${totalSynced} records across jobs, talent, and clients ✓`
        : `Synced ${totalSynced} · ${totalErrors} errors. Check individual sections.`
    )
  }

  return (
    <div>
      <button
        type="button"
        onClick={run}
        disabled={busy}
        className="w-full rounded-xl bg-[#1E3A6B] hover:bg-[#253D8A] text-white transition-colors"
        style={{
          padding: '12px 0',
          fontSize: 13,
          fontWeight: 600,
          cursor: busy ? 'wait' : 'pointer',
          opacity: busy ? 0.7 : 1,
        }}
      >
        {busy ? 'Syncing all…' : 'Sync all'}
      </button>
      {summary && (
        <p
          className="mt-2 text-center"
          style={{ fontSize: 12, color: '#AABDE0' }}
        >
          {summary}
        </p>
      )}
    </div>
  )
}

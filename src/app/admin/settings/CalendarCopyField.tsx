'use client'

import { useState } from 'react'

export function CalendarCopyField({ url }: { url: string }) {
  const [copied, setCopied] = useState(false)

  async function copy() {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setCopied(false)
    }
  }

  return (
    <div className="flex gap-2 items-center">
      <input
        readOnly
        value={url}
        onClick={(e) => (e.target as HTMLInputElement).select()}
        style={{
          flex: 1,
          minWidth: 0,
          padding: '10px 12px',
          borderRadius: 8,
          border: '1px solid rgba(170,189,224,0.2)',
          background: 'rgba(255,255,255,0.05)',
          color: '#fff',
          fontSize: 12,
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
          outline: 'none',
        }}
      />
      <button
        type="button"
        onClick={copy}
        className="rounded-lg"
        style={{
          padding: '10px 14px',
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: '0.04em',
          textTransform: 'uppercase',
          background: copied ? '#4ADE80' : '#1E3A6B',
          color: copied ? '#0F1B2E' : '#fff',
          border: 'none',
          cursor: 'pointer',
          whiteSpace: 'nowrap',
        }}
      >
        {copied ? '✓ Copied' : 'Copy'}
      </button>
    </div>
  )
}

'use client'

import { useState } from 'react'

/**
 * "Your share code" card — drop in on talent and client profile pages.
 * Monospaced display + copy button. Pure client component, no data fetch.
 */
export function ShareCodeCard({
  code,
  variant = 'dark',
}: {
  code: string | null | undefined
  variant?: 'dark' | 'cream'
}) {
  const [copied, setCopied] = useState(false)
  const value = code ?? '—'

  async function copy() {
    if (!code) return
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setCopied(false)
    }
  }

  const darkStyles = {
    bg: '#2E5099',
    border: 'rgba(170,189,224,0.15)',
    label: '#AABDE0',
    value: '#fff',
    valueBg: 'rgba(0,0,0,0.25)',
    sub: 'rgba(170,189,224,0.75)',
    btnBg: '#FBF5E4',
    btnColor: '#1A3C6B',
  }
  const creamStyles = {
    bg: '#FBF5E4',
    border: 'rgba(26,60,107,0.12)',
    label: '#496275',
    value: '#1A3C6B',
    valueBg: 'rgba(26,60,107,0.08)',
    sub: '#7A90AA',
    btnBg: '#1A3C6B',
    btnColor: '#fff',
  }
  const s = variant === 'cream' ? creamStyles : darkStyles

  return (
    <div
      className="rounded-xl"
      style={{
        background: s.bg,
        border: `1px solid ${s.border}`,
        padding: 16,
      }}
    >
      <p
        style={{
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: '0.14em',
          textTransform: 'uppercase',
          color: s.label,
        }}
      >
        Your share code
      </p>
      <div
        className="flex items-center gap-2 mt-2"
        style={{
          background: s.valueBg,
          padding: '10px 14px',
          borderRadius: 10,
        }}
      >
        <span
          style={{
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
            fontSize: 18,
            fontWeight: 700,
            letterSpacing: '0.08em',
            color: s.value,
            flex: 1,
          }}
        >
          {value}
        </span>
        <button
          type="button"
          onClick={copy}
          disabled={!code}
          className="rounded-lg"
          style={{
            padding: '7px 12px',
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
            background: copied ? '#22C55E' : s.btnBg,
            color: copied ? '#fff' : s.btnColor,
            border: 'none',
            cursor: code ? 'pointer' : 'not-allowed',
            opacity: code ? 1 : 0.5,
            whiteSpace: 'nowrap',
          }}
        >
          {copied ? '✓ Copied' : 'Copy'}
        </button>
      </div>
      <p
        style={{
          fontSize: 12,
          color: s.sub,
          marginTop: 10,
          lineHeight: 1.5,
        }}
      >
        Share this code for referrals. Admin can search your account instantly
        by pasting it into the search bar.
      </p>
    </div>
  )
}

'use client'

import { useState } from 'react'

type Props = {
  name: string
  defaultValue?: string
  placeholder?: string
  className?: string
  autoComplete?: string
}

/**
 * Dark-themed password input with show/hide eye toggle. Used for the
 * Notion integration secret on /admin/settings. Posts value via the
 * surrounding server-action form.
 */
export function NotionTokenInput({
  name,
  defaultValue,
  placeholder,
  className = '',
  autoComplete = 'off',
}: Props) {
  const [visible, setVisible] = useState(false)
  return (
    <div style={{ position: 'relative' }}>
      <input
        type={visible ? 'text' : 'password'}
        name={name}
        defaultValue={defaultValue}
        placeholder={placeholder}
        autoComplete={autoComplete}
        className={className}
        style={{ paddingRight: 44 }}
      />
      <button
        type="button"
        tabIndex={-1}
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? 'Hide token' : 'Show token'}
        style={{
          position: 'absolute',
          right: 12,
          top: '50%',
          transform: 'translateY(-50%)',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          padding: 4,
          color: '#7A90AA',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          lineHeight: 1,
        }}
      >
        {visible ? (
          <svg
            width="18" height="18" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="1.75"
            strokeLinecap="round" strokeLinejoin="round" aria-hidden
          >
            <path d="M17.94 17.94A10.06 10.06 0 0 1 12 20c-7 0-11-8-11-8a19.86 19.86 0 0 1 4.22-5.32" />
            <path d="M9.9 4.24A10.07 10.07 0 0 1 12 4c7 0 11 8 11 8a19.87 19.87 0 0 1-3.17 4.14" />
            <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
            <line x1="1" y1="1" x2="23" y2="23" />
          </svg>
        ) : (
          <svg
            width="18" height="18" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="1.75"
            strokeLinecap="round" strokeLinejoin="round" aria-hidden
          >
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        )}
      </button>
    </div>
  )
}

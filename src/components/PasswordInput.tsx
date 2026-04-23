'use client'

import { forwardRef, useState } from 'react'

type Props = Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> & {
  label?: string
}

/**
 * Password input with show/hide eye toggle.
 *
 * iOS note: the toggle is a SIBLING (flex row), not an absolute overlay
 * over the input. iPhone Safari draws its native AutoFill key icon at the
 * right edge of password fields, which would otherwise sit on top of an
 * absolutely-positioned button and make it invisible. Sibling layout
 * pushes the AutoFill chrome aside and keeps the toggle clickable.
 */
export const PasswordInput = forwardRef<HTMLInputElement, Props>(function PasswordInput(
  { className = '', style, ...rest },
  ref
) {
  const [visible, setVisible] = useState(false)

  return (
    <div
      className={className}
      style={{
        display: 'flex',
        alignItems: 'stretch',
        width: '100%',
        border: '1px solid rgba(26, 60, 107, 0.15)',
        borderRadius: 10,
        background: '#fff',
        overflow: 'hidden',
        ...style,
      }}
    >
      <input
        ref={ref}
        type={visible ? 'text' : 'password'}
        style={{
          flex: 1,
          minWidth: 0,
          border: 'none',
          outline: 'none',
          background: 'transparent',
          padding: '12px 14px',
          fontSize: 14,
          color: 'var(--rs-ink)',
          fontFamily: 'inherit',
          boxSizing: 'border-box',
        }}
        {...rest}
      />
      <button
        type="button"
        tabIndex={-1}
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? 'Hide password' : 'Show password'}
        aria-pressed={visible}
        style={{
          flexShrink: 0,
          width: 44,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'transparent',
          border: 'none',
          color: '#9AA0AD',
          cursor: 'pointer',
        }}
      >
        {visible ? (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M17.94 17.94A10.06 10.06 0 0 1 12 20c-7 0-11-8-11-8a19.86 19.86 0 0 1 4.22-5.32" />
            <path d="M9.9 4.24A10.07 10.07 0 0 1 12 4c7 0 11 8 11 8a19.87 19.87 0 0 1-3.17 4.14" />
            <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
            <line x1="1" y1="1" x2="23" y2="23" />
          </svg>
        ) : (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        )}
      </button>
    </div>
  )
})

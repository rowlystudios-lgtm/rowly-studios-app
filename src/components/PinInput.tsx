'use client'

import { useEffect, useRef } from 'react'

type Variant = 'dark' | 'light'

type Props = {
  value: string
  onChange: (pin: string) => void
  onComplete?: (pin: string) => void
  disabled?: boolean
  variant?: Variant
  autoFocus?: boolean
}

const LENGTH = 6

function sanitizeDigits(raw: string): string {
  return raw.replace(/\D/g, '').slice(0, LENGTH)
}

export function PinInput({
  value,
  onChange,
  onComplete,
  disabled = false,
  variant = 'dark',
  autoFocus = false,
}: Props) {
  const refs = useRef<(HTMLInputElement | null)[]>([])
  if (refs.current.length !== LENGTH) {
    refs.current = Array(LENGTH).fill(null)
  }

  const digits = Array.from({ length: LENGTH }, (_, i) => value[i] ?? '')

  useEffect(() => {
    if (autoFocus && !disabled) {
      refs.current[0]?.focus()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function writeAt(index: number, ch: string) {
    const next = digits.slice()
    next[index] = ch
    const joined = next.join('').slice(0, LENGTH)
    onChange(joined)
    if (joined.length === LENGTH && onComplete) {
      onComplete(joined)
    }
  }

  function handleChange(index: number, raw: string) {
    const clean = sanitizeDigits(raw)
    if (!clean) return
    if (clean.length === 1) {
      writeAt(index, clean)
      if (index < LENGTH - 1) refs.current[index + 1]?.focus()
    } else {
      // Paste into a single input
      applyPaste(clean, index)
    }
  }

  function applyPaste(clean: string, startIndex = 0) {
    const next = digits.slice()
    let i = startIndex
    for (const ch of clean) {
      if (i >= LENGTH) break
      next[i++] = ch
    }
    const joined = next.join('').slice(0, LENGTH)
    onChange(joined)
    const focusTarget = Math.min(i, LENGTH - 1)
    refs.current[focusTarget]?.focus()
    if (joined.length === LENGTH && onComplete) {
      onComplete(joined)
    }
  }

  function handleKeyDown(index: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Backspace') {
      if (digits[index]) {
        writeAt(index, '')
      } else if (index > 0) {
        const next = digits.slice()
        next[index - 1] = ''
        onChange(next.join(''))
        refs.current[index - 1]?.focus()
      }
      e.preventDefault()
      return
    }
    if (e.key === 'ArrowLeft' && index > 0) {
      refs.current[index - 1]?.focus()
      e.preventDefault()
    }
    if (e.key === 'ArrowRight' && index < LENGTH - 1) {
      refs.current[index + 1]?.focus()
      e.preventDefault()
    }
  }

  function handlePaste(index: number, e: React.ClipboardEvent<HTMLInputElement>) {
    const clean = sanitizeDigits(e.clipboardData.getData('text'))
    if (clean) {
      e.preventDefault()
      applyPaste(clean, index)
    }
  }

  const isDark = variant === 'dark'
  const boxStyle: React.CSSProperties = {
    width: 42,
    height: 52,
    borderRadius: 10,
    border: `1.5px solid ${isDark ? 'rgba(170,189,224,0.3)' : 'rgba(26,60,107,0.15)'}`,
    background: isDark ? '#2E5099' : '#f5f4f0',
    color: isDark ? '#fff' : '#1A3C6B',
    fontSize: 22,
    fontWeight: 600,
    textAlign: 'center',
    fontFamily:
      'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
    outline: 'none',
    transition: 'border-color 120ms ease',
    caretColor: isDark ? '#fff' : '#1A3C6B',
  }

  return (
    <div
      style={{
        display: 'flex',
        gap: 8,
        justifyContent: 'center',
      }}
    >
      {digits.map((d, i) => (
        <input
          key={i}
          ref={(el) => {
            refs.current[i] = el
          }}
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={1}
          value={d}
          onChange={(e) => handleChange(i, e.target.value)}
          onKeyDown={(e) => handleKeyDown(i, e)}
          onPaste={(e) => handlePaste(i, e)}
          onFocus={(e) => {
            ;(e.currentTarget as HTMLInputElement).select()
            ;(e.currentTarget as HTMLInputElement).style.borderColor = '#1A3C6B'
          }}
          onBlur={(e) => {
            ;(e.currentTarget as HTMLInputElement).style.borderColor = isDark
              ? 'rgba(170,189,224,0.3)'
              : 'rgba(26,60,107,0.15)'
          }}
          disabled={disabled}
          aria-label={`PIN digit ${i + 1}`}
          style={boxStyle}
        />
      ))}
    </div>
  )
}

'use client'

import { useEffect, useRef, useState } from 'react'
import { downloadICS, googleCalUrl, type JobRow } from '@/lib/jobs'

export function AddToCalendar({ job }: { job: JobRow }) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onDocClick(e: MouseEvent) {
      if (!rootRef.current) return
      if (!rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  function onApple(e: React.MouseEvent) {
    e.stopPropagation()
    downloadICS(job)
    setOpen(false)
  }

  function onGoogle(e: React.MouseEvent) {
    e.stopPropagation()
    window.open(googleCalUrl(job), '_blank', 'noopener,noreferrer')
    setOpen(false)
  }

  return (
    <div
      ref={rootRef}
      style={{ position: 'relative', flexShrink: 0 }}
      onClick={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        aria-label="Add to calendar"
        aria-expanded={open}
        onClick={(e) => {
          e.stopPropagation()
          setOpen((v) => !v)
        }}
        style={{
          width: 28,
          height: 28,
          borderRadius: 999,
          background: 'rgba(255,255,255,0.12)',
          border: 'none',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#fff',
          cursor: 'pointer',
        }}
      >
        <CalendarIcon />
      </button>
      {open && (
        <div
          role="menu"
          style={{
            position: 'absolute',
            top: 34,
            right: 0,
            minWidth: 170,
            background: '#2E5099',
            border: '1px solid rgba(170,189,224,0.2)',
            borderRadius: 10,
            overflow: 'hidden',
            zIndex: 20,
            boxShadow: '0 12px 32px rgba(0,0,0,0.3)',
          }}
        >
          <DropdownItem onClick={onApple}>Apple / iCal</DropdownItem>
          <div style={{ height: 1, background: 'rgba(170,189,224,0.15)' }} />
          <DropdownItem onClick={onGoogle}>Google Calendar</DropdownItem>
        </div>
      )}
    </div>
  )
}

function DropdownItem({
  children,
  onClick,
}: {
  children: React.ReactNode
  onClick: (e: React.MouseEvent) => void
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        width: '100%',
        height: 40,
        padding: '0 14px',
        background: 'transparent',
        border: 'none',
        color: '#fff',
        fontSize: 13,
        textAlign: 'left',
        cursor: 'pointer',
      }}
    >
      {children}
    </button>
  )
}

function CalendarIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </svg>
  )
}

'use client'

import { generateICS, downloadICS } from '@/lib/calendar'

function CalendarIcon() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={{ flexShrink: 0 }}
    >
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  )
}

type Props = {
  title: string
  startDate: string
  endDate?: string
  callTime?: string | null
  location?: string | null
  description?: string | null
  jobCode?: string | null
  variant?: 'primary' | 'ghost' | 'inline'
  size?: 'sm' | 'md'
}

export function AddToCalendarButton({
  title,
  startDate,
  endDate,
  callTime,
  location,
  description,
  jobCode,
  variant = 'ghost',
  size = 'md',
}: Props) {
  function handleClick() {
    const ics = generateICS({
      title,
      startDate,
      endDate,
      callTime,
      location,
      description,
      jobCode,
    })
    const safeTitle = title.replace(/[^a-z0-9]/gi, '-').toLowerCase()
    downloadICS(ics, `${safeTitle}.ics`)
  }

  const isPrimary = variant === 'primary'
  const isInline = variant === 'inline'
  const isSm = size === 'sm'

  return (
    <button
      type="button"
      onClick={handleClick}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: isSm ? 5 : 6,
        padding: isInline ? '4px 0' : isSm ? '6px 12px' : '9px 16px',
        borderRadius: isInline ? 0 : 8,
        border: isPrimary
          ? 'none'
          : isInline
            ? 'none'
            : '1px solid rgba(255,255,255,0.15)',
        background: isPrimary ? '#F0A500' : 'transparent',
        color: isPrimary ? '#0F1B2E' : isInline ? '#9AA0AD' : '#CDD9E5',
        fontSize: isSm ? 11 : 12,
        fontWeight: isPrimary ? 700 : 600,
        cursor: 'pointer',
        letterSpacing: '0.02em',
        fontFamily: 'inherit',
        whiteSpace: 'nowrap',
        textDecoration: 'none',
        lineHeight: 1,
      }}
      aria-label={`Add ${title} to calendar`}
    >
      <CalendarIcon />
      Add to Calendar
    </button>
  )
}

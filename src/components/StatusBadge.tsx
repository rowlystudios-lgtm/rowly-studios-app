'use client'

import {
  bookingStatusSwatch,
  jobStatusSwatch,
  JOB_STATUS_LABEL,
  BOOKING_STATUS_LABEL,
  type BookingStatus,
  type JobStatus,
} from '@/lib/job-status'

export function JobStatusBadge({
  status,
  small = false,
}: {
  status: JobStatus
  small?: boolean
}) {
  const s = jobStatusSwatch(status)
  return (
    <span
      style={{
        display: 'inline-block',
        padding: small ? '3px 8px' : '4px 10px',
        borderRadius: 999,
        fontSize: small ? 10 : 11,
        fontWeight: 600,
        letterSpacing: '0.04em',
        background: s.bg,
        color: s.color,
        border: s.border ? `1px solid ${s.border}` : 'none',
        whiteSpace: 'nowrap',
      }}
    >
      {JOB_STATUS_LABEL[status]}
    </span>
  )
}

export function BookingStatusBadge({ status }: { status: BookingStatus }) {
  const s = bookingStatusSwatch(status)
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '3px 8px',
        borderRadius: 999,
        fontSize: 10,
        fontWeight: 600,
        letterSpacing: '0.04em',
        background: s.bg,
        color: s.color,
        border: s.border ? `1px solid ${s.border}` : 'none',
        whiteSpace: 'nowrap',
      }}
    >
      {BOOKING_STATUS_LABEL[status]}
    </span>
  )
}

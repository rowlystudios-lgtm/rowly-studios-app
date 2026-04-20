'use client'

import {
  bookingStatusSwatch,
  jobStatusSwatch,
  JOB_STATUS_LABEL,
  BOOKING_STATUS_LABEL,
  type BookingStatus,
  type JobStatus,
} from '@/lib/job-status'

/* ─────────────────────────────────────────────────────────────
 * Legacy badges used by /app/app/* pages — kept untouched for
 * back-compat. New admin pages use the default <StatusBadge />
 * export below (Tailwind-class based).
 * ───────────────────────────────────────────────────────────── */

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

/* ─────────────────────────────────────────────────────────────
 * Shared admin StatusBadge — Tailwind classes, used across the
 * admin dashboard + list + detail pages.
 * ───────────────────────────────────────────────────────────── */

const STATUS_CLASSES: Record<string, string> = {
  // Job states
  crewing: 'bg-blue-900/40 text-blue-300',
  submitted: 'bg-amber-900/40 text-amber-300',
  confirmed: 'bg-green-900/40 text-green-300',
  wrapped: 'bg-purple-900/40 text-purple-300',
  cancelled: 'bg-red-900/40 text-red-300',
  draft: 'bg-gray-800/60 text-gray-400',

  // Invoice states
  sent: 'bg-sky-900/40 text-sky-300',
  paid: 'bg-emerald-900/40 text-emerald-300',
  overdue: 'bg-red-900/40 text-red-400',
  void: 'bg-gray-800/60 text-gray-400',

  // Booking states not already covered above
  requested: 'bg-amber-900/40 text-amber-300',
  admin_approved: 'bg-sky-900/40 text-sky-300',
  declined: 'bg-red-900/40 text-red-300',
  completed: 'bg-purple-900/40 text-purple-300',

  // Profile / generic
  pending: 'bg-amber-900/40 text-amber-300',
  verified: 'bg-green-900/40 text-green-300',
}

const STATUS_LABELS: Record<string, string> = {
  crewing: 'Crewing',
  submitted: 'Submitted',
  confirmed: 'Confirmed',
  wrapped: 'Wrapped',
  cancelled: 'Cancelled',
  draft: 'Draft',
  sent: 'Sent',
  paid: 'Paid',
  overdue: 'Overdue',
  void: 'Void',
  requested: 'Pending review',
  admin_approved: 'Awaiting talent',
  declined: 'Declined',
  completed: 'Completed',
  pending: 'Pending',
  verified: 'Verified',
}

const DEFAULT_CLASS = 'bg-gray-800/60 text-gray-400'

function titleCase(raw: string): string {
  return raw
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

type Size = 'sm' | 'md'

const SIZE_CLASSES: Record<Size, string> = {
  sm: 'text-[10px] px-2 py-0.5',
  md: 'text-[11px] px-2.5 py-1',
}

export function StatusBadge({
  status,
  size = 'md',
  label,
}: {
  status: string | null | undefined
  size?: Size
  label?: string
}) {
  const key = (status ?? '').toLowerCase()
  const colour = STATUS_CLASSES[key] ?? DEFAULT_CLASS
  const display = label ?? STATUS_LABELS[key] ?? titleCase(key || 'Unknown')
  return (
    <span
      className={`inline-block rounded-full font-semibold uppercase tracking-wider whitespace-nowrap ${SIZE_CLASSES[size]} ${colour}`}
    >
      {display}
    </span>
  )
}

export default StatusBadge

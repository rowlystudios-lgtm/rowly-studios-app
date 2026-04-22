export type JobStatus =
  | 'draft'
  | 'submitted'
  | 'crewing'
  | 'confirmed'
  | 'wrapped'
  | 'cancelled'

export type BookingStatus =
  | 'requested'
  | 'admin_approved'
  | 'confirmed'
  | 'declined'
  | 'cancelled'
  | 'unavailable'

export const JOB_STATUS_LABEL: Record<JobStatus, string> = {
  draft: 'Draft',
  submitted: 'Submitted — awaiting review',
  crewing: 'In review — talent being assigned',
  confirmed: 'Confirmed',
  wrapped: 'Completed',
  cancelled: 'Cancelled',
}

// Default label set — used by the shared BookingStatusBadge. Talent and
// client views can override copy where the same state reads differently.
export const BOOKING_STATUS_LABEL: Record<BookingStatus, string> = {
  requested: 'Pending review',
  admin_approved: 'Awaiting talent',
  confirmed: 'Confirmed',
  declined: 'Declined',
  cancelled: 'Cancelled',
  unavailable: 'Unavailable — booked elsewhere',
}

type Swatch = { bg: string; color: string; border?: string }

function swatch(
  kind:
    | 'submitted'
    | 'review'
    | 'awaiting'
    | 'confirmed'
    | 'wrapped'
    | 'cancelled'
    | 'unavailable'
): Swatch {
  switch (kind) {
    case 'submitted':
      return {
        bg: 'rgba(170,189,224,0.2)',
        color: '#AABDE0',
        border: 'rgba(170,189,224,0.3)',
      }
    case 'review':
      return {
        bg: 'rgba(212,149,10,0.2)',
        color: '#d4950a',
        border: 'rgba(212,149,10,0.35)',
      }
    case 'awaiting':
      return {
        bg: 'rgba(46,80,153,0.25)',
        color: '#AABDE0',
        border: 'rgba(46,80,153,0.5)',
      }
    case 'confirmed':
      return {
        bg: 'rgba(22,101,52,0.2)',
        color: '#4ade80',
        border: 'rgba(74,222,128,0.3)',
      }
    case 'wrapped':
      return {
        bg: 'rgba(170,189,224,0.08)',
        color: '#AABDE0',
        border: 'rgba(170,189,224,0.15)',
      }
    case 'cancelled':
      return {
        bg: 'rgba(239,68,68,0.2)',
        color: '#f87171',
        border: 'rgba(239,68,68,0.3)',
      }
    case 'unavailable':
      return {
        bg: 'rgba(120,130,140,0.18)',
        color: '#9AA3AE',
        border: 'rgba(120,130,140,0.3)',
      }
  }
}

export function jobStatusSwatch(status: JobStatus): Swatch {
  switch (status) {
    case 'submitted':
      return swatch('submitted')
    case 'crewing':
      return swatch('review')
    case 'confirmed':
      return swatch('confirmed')
    case 'wrapped':
      return swatch('wrapped')
    case 'cancelled':
      return swatch('cancelled')
    case 'draft':
      return swatch('submitted')
  }
}

export function bookingStatusSwatch(status: BookingStatus): Swatch {
  switch (status) {
    case 'requested':
      return swatch('review')
    case 'admin_approved':
      return swatch('awaiting')
    case 'confirmed':
      return swatch('confirmed')
    case 'declined':
      return swatch('cancelled')
    case 'cancelled':
      return swatch('wrapped')
    case 'unavailable':
      return swatch('unavailable')
  }
}

'use client'

import { useState } from 'react'
import {
  confirmBooking,
  declineBooking,
  markBookingPaid,
  markBookingCompleted,
  nudgeTalent,
  updateOfferedRate,
  acceptCounterOffer,
} from '../actions'

type Props = {
  bookingId: string
  jobId: string
  status: string
  paid: boolean
  offeredRateCents: number | null
  responseDeadlineAt: string | null
  negotiationNotes: string | null
}

function fmtUsd(c: number | null | undefined): string {
  if (!c && c !== 0) return '—'
  return `$${(c / 100).toLocaleString('en-US', { maximumFractionDigits: 0 })}`
}

function parseCounterFromNotes(notes: string | null): number | null {
  if (!notes) return null
  // Matches "Talent proposed: $2,400/day" or "$2400"
  const m = notes.match(/\$\s*([\d,]+(?:\.\d+)?)/)
  if (!m) return null
  const n = parseFloat(m[1].replace(/,/g, ''))
  if (!Number.isFinite(n)) return null
  return Math.round(n * 100)
}

export function BookingAdminActions({
  bookingId,
  jobId,
  status,
  paid,
  offeredRateCents,
  responseDeadlineAt,
  negotiationNotes,
}: Props) {
  if (status === 'requested') {
    return (
      <RequestedActions
        bookingId={bookingId}
        jobId={jobId}
        responseDeadlineAt={responseDeadlineAt}
      />
    )
  }
  if (status === 'negotiating') {
    return (
      <NegotiatingActions
        bookingId={bookingId}
        jobId={jobId}
        offeredRateCents={offeredRateCents}
        negotiationNotes={negotiationNotes}
      />
    )
  }
  if (status === 'confirmed') {
    return (
      <ConfirmedActions
        bookingId={bookingId}
        jobId={jobId}
        paid={paid}
      />
    )
  }
  return null
}

/* ─────────── requested ─────────── */

function RequestedActions({
  bookingId,
  jobId,
  responseDeadlineAt,
}: {
  bookingId: string
  jobId: string
  responseDeadlineAt: string | null
}) {
  const [decliningOpen, setDecliningOpen] = useState(false)
  const [reason, setReason] = useState('')

  const deadlinePassed =
    responseDeadlineAt != null && new Date(responseDeadlineAt) < new Date()

  return (
    <div className="mt-3 flex flex-col gap-2">
      <div className="flex gap-2 flex-wrap">
        <form action={declineBooking} style={{ flex: 1, minWidth: 120 }}>
          <input type="hidden" name="bookingId" value={bookingId} />
          <input type="hidden" name="jobId" value={jobId} />
          <input type="hidden" name="reason" value={reason} />
          <button
            type="button"
            onClick={() => setDecliningOpen((v) => !v)}
            className="w-full rounded-lg transition-colors"
            style={{
              padding: '9px 0',
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              background: 'rgba(239,68,68,0.15)',
              color: '#F87171',
              border: '1px solid rgba(239,68,68,0.35)',
              cursor: 'pointer',
            }}
          >
            ✗ Decline
          </button>
        </form>
        <form action={confirmBooking} style={{ flex: 2, minWidth: 160 }}>
          <input type="hidden" name="bookingId" value={bookingId} />
          <input type="hidden" name="jobId" value={jobId} />
          <button
            type="submit"
            className="w-full rounded-lg bg-[#F0A500] hover:bg-[#F5B733] text-[#0F1B2E] transition-colors"
            style={{
              padding: '9px 0',
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              border: 'none',
              cursor: 'pointer',
            }}
          >
            ✓ Confirm on their behalf
          </button>
        </form>
      </div>

      {decliningOpen && (
        <form action={declineBooking} className="flex gap-2 flex-wrap">
          <input type="hidden" name="bookingId" value={bookingId} />
          <input type="hidden" name="jobId" value={jobId} />
          <input
            type="text"
            name="reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Reason (optional)"
            style={{
              flex: '1 1 200px',
              padding: '8px 10px',
              borderRadius: 8,
              border: '1px solid rgba(170,189,224,0.2)',
              background: 'rgba(255,255,255,0.05)',
              color: '#fff',
              fontSize: 12,
              outline: 'none',
            }}
          />
          <button
            type="submit"
            style={{
              padding: '8px 12px',
              borderRadius: 8,
              background: '#B91C1C',
              color: '#fff',
              border: 'none',
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            Confirm decline
          </button>
        </form>
      )}

      <NudgeButton
        bookingId={bookingId}
        jobId={jobId}
        enabled={deadlinePassed}
        deadlineAt={responseDeadlineAt}
      />
    </div>
  )
}

/* ─────────── negotiating ─────────── */

function NegotiatingActions({
  bookingId,
  jobId,
  offeredRateCents,
  negotiationNotes,
}: {
  bookingId: string
  jobId: string
  offeredRateCents: number | null
  negotiationNotes: string | null
}) {
  const counterCents = parseCounterFromNotes(negotiationNotes)
  const [reOfferOpen, setReOfferOpen] = useState(false)
  const [reOfferDollars, setReOfferDollars] = useState(
    offeredRateCents != null ? String(offeredRateCents / 100) : ''
  )
  const [reOfferNotes, setReOfferNotes] = useState('')

  return (
    <div className="mt-3 flex flex-col gap-2">
      {counterCents != null && (
        <div
          className="rounded-lg"
          style={{
            background: 'rgba(240,165,0,0.10)',
            border: '1px solid rgba(240,165,0,0.3)',
            padding: '10px 12px',
            color: '#F0A500',
            fontSize: 12,
            fontWeight: 600,
          }}
        >
          Counter-offer: {fmtUsd(counterCents)}/day
        </div>
      )}

      <div className="flex gap-2 flex-wrap">
        {counterCents != null && (
          <form action={acceptCounterOffer} style={{ flex: 2, minWidth: 160 }}>
            <input type="hidden" name="bookingId" value={bookingId} />
            <input type="hidden" name="jobId" value={jobId} />
            <input type="hidden" name="counter" value={counterCents / 100} />
            <button
              type="submit"
              className="w-full rounded-lg bg-[#F0A500] hover:bg-[#F5B733] text-[#0F1B2E] transition-colors"
              style={{
                padding: '9px 0',
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                border: 'none',
                cursor: 'pointer',
              }}
            >
              ✓ Accept {fmtUsd(counterCents)}/day
            </button>
          </form>
        )}
        <button
          type="button"
          onClick={() => setReOfferOpen((v) => !v)}
          style={{
            flex: 1,
            minWidth: 140,
            padding: '9px 12px',
            borderRadius: 8,
            background: 'rgba(255,255,255,0.06)',
            color: '#AABDE0',
            border: '1px solid rgba(170,189,224,0.2)',
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
            cursor: 'pointer',
          }}
        >
          {reOfferOpen ? 'Cancel' : 'Propose new figure'}
        </button>
      </div>

      {reOfferOpen && (
        <form action={updateOfferedRate} className="flex flex-col gap-2">
          <input type="hidden" name="bookingId" value={bookingId} />
          <input type="hidden" name="jobId" value={jobId} />
          <div style={{ position: 'relative' }}>
            <span
              style={{
                position: 'absolute',
                left: 10,
                top: '50%',
                transform: 'translateY(-50%)',
                color: '#7A90AA',
                fontSize: 13,
                pointerEvents: 'none',
              }}
            >
              $
            </span>
            <input
              type="number"
              name="offered_rate"
              min={0}
              step={25}
              value={reOfferDollars}
              onChange={(e) => setReOfferDollars(e.target.value)}
              placeholder="New offered rate"
              style={{
                width: '100%',
                padding: '9px 10px 9px 22px',
                borderRadius: 8,
                border: '1px solid rgba(170,189,224,0.2)',
                background: 'rgba(255,255,255,0.05)',
                color: '#fff',
                fontSize: 13,
                outline: 'none',
              }}
            />
          </div>
          <input
            type="text"
            name="notes"
            value={reOfferNotes}
            onChange={(e) => setReOfferNotes(e.target.value)}
            placeholder="Note to talent (optional)"
            style={{
              padding: '8px 10px',
              borderRadius: 8,
              border: '1px solid rgba(170,189,224,0.2)',
              background: 'rgba(255,255,255,0.05)',
              color: '#fff',
              fontSize: 12,
              outline: 'none',
            }}
          />
          <button
            type="submit"
            className="rounded-lg bg-[#1E3A6B] hover:bg-[#253D8A] text-white transition-colors"
            style={{
              padding: '9px 0',
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              border: 'none',
              cursor: 'pointer',
            }}
          >
            Send new offer
          </button>
        </form>
      )}
    </div>
  )
}

/* ─────────── confirmed ─────────── */

function ConfirmedActions({
  bookingId,
  jobId,
  paid,
}: {
  bookingId: string
  jobId: string
  paid: boolean
}) {
  return (
    <div className="mt-3 flex gap-2 flex-wrap">
      {!paid && (
        <form action={markBookingPaid} style={{ flex: 1, minWidth: 140 }}>
          <input type="hidden" name="bookingId" value={bookingId} />
          <input type="hidden" name="jobId" value={jobId} />
          <button
            type="submit"
            className="w-full rounded-lg transition-colors"
            style={{
              padding: '9px 0',
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              background: 'rgba(16,185,129,0.15)',
              color: '#10B981',
              border: '1px solid rgba(16,185,129,0.35)',
              cursor: 'pointer',
            }}
          >
            Mark paid
          </button>
        </form>
      )}
      <form action={markBookingCompleted} style={{ flex: 1, minWidth: 140 }}>
        <input type="hidden" name="bookingId" value={bookingId} />
        <input type="hidden" name="jobId" value={jobId} />
        <button
          type="submit"
          className="w-full rounded-lg transition-colors"
          style={{
            padding: '9px 0',
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            background: 'rgba(168,85,247,0.15)',
            color: '#C084FC',
            border: '1px solid rgba(168,85,247,0.35)',
            cursor: 'pointer',
          }}
        >
          Mark completed
        </button>
      </form>
    </div>
  )
}

/* ─────────── nudge ─────────── */

function NudgeButton({
  bookingId,
  jobId,
  enabled,
  deadlineAt,
}: {
  bookingId: string
  jobId: string
  enabled: boolean
  deadlineAt: string | null
}) {
  if (!enabled) {
    const deadline = deadlineAt ? new Date(deadlineAt) : null
    const hoursLeft = deadline
      ? Math.max(
          0,
          Math.round((deadline.getTime() - Date.now()) / (1000 * 60 * 60))
        )
      : null
    return (
      <p
        style={{
          fontSize: 11,
          color: '#7A90AA',
          fontStyle: 'italic',
          marginTop: 2,
        }}
      >
        Nudge unlocks after the 24-hour response window
        {hoursLeft != null ? ` (~${hoursLeft}h left)` : ''}.
      </p>
    )
  }
  return (
    <form action={nudgeTalent}>
      <input type="hidden" name="bookingId" value={bookingId} />
      <input type="hidden" name="jobId" value={jobId} />
      <button
        type="submit"
        className="w-full rounded-lg"
        style={{
          padding: '9px 0',
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          background: 'rgba(240,165,0,0.18)',
          color: '#F0A500',
          border: '1px solid rgba(240,165,0,0.35)',
          cursor: 'pointer',
        }}
      >
        🔔 Nudge talent
      </button>
    </form>
  )
}

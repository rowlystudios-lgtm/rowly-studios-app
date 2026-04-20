'use client'

import { useEffect, useState } from 'react'
import { useAuth } from '@/lib/auth-context'
import { Avatar } from '@/components/Avatar'
import { AddToCalendar } from '@/components/AddToCalendar'
import { JobDetailSheet } from '@/components/JobDetailSheet'
import {
  formatLongDate,
  formatMoney,
  getMapsUrl,
  greeting,
  normalizeBooking,
  summariseShootDays,
  type Booking,
} from '@/lib/jobs'
import {
  acceptBookingOffer,
  counterBookingOffer,
  declineBookingOffer,
  markBookingViewed,
} from '@/app/actions/bookings'

const BG = '#1A3C6B'
const CARD_BG = '#2E5099'
const CARD_BORDER = 'rgba(170,189,224,0.15)'
const CARD_BORDER_SOFT = 'rgba(170,189,224,0.1)'
const TEXT_MUTED = '#AABDE0'

type SheetBusy = 'confirm' | 'decline' | null

export function TalentOverview() {
  const { user, profile, supabase } = useAuth()

  const [bookings, setBookings] = useState<Booking[]>([])
  const [loading, setLoading] = useState(true)
  const [cardError, setCardError] = useState<Record<string, string>>({})
  const [sheetBooking, setSheetBooking] = useState<Booking | null>(null)
  const [sheetBusy, setSheetBusy] = useState<SheetBusy>(null)
  const [sheetError, setSheetError] = useState('')

  const firstName =
    profile?.first_name ?? profile?.full_name?.split(' ')[0] ?? 'there'
  const displayName = [profile?.first_name, profile?.last_name]
    .filter(Boolean)
    .join(' ') || profile?.full_name || null
  const today = formatLongDate(new Date())

  useEffect(() => {
    const uid = user?.id
    if (!uid) return
    let cancelled = false

    async function load() {
      const { data, error } = await supabase
        .from('job_bookings')
        .select(
          `id, status, confirmed_rate_cents, offered_rate_cents,
           talent_reviewed_at, rate_negotiation_notes,
           jobs (
             id, title, description, location,
             start_date, end_date, call_time,
             day_rate_cents, client_notes,
             shoot_days, crew_needed
           )`
        )
        .eq('talent_id', uid)
        // Talent sees every actionable booking — requested offers, active
        // negotiations, already-confirmed jobs, and legacy admin_approved rows.
        .in('status', [
          'requested',
          'negotiating',
          'admin_approved',
          'confirmed',
        ])
        .order('created_at', { ascending: false })

      if (cancelled) return
      if (error) {
        console.error('job_bookings query', error)
        setLoading(false)
        return
      }
      const rows = (data ?? []) as Parameters<typeof normalizeBooking>[0][]
      const normalized = rows
        .map(normalizeBooking)
        .filter((b): b is Booking => b !== null)
      setBookings(normalized)
      setLoading(false)
    }

    load()
    return () => {
      cancelled = true
    }
  }, [user?.id, supabase])

  const upcoming = bookings.filter((b) => b.status === 'confirmed')
  const offers = bookings.filter(
    (b) =>
      b.status === 'requested' ||
      b.status === 'negotiating' ||
      b.status === 'admin_approved'
  )

  // Mark each visible offer as viewed once per session. Server idempotently
  // only writes when talent_reviewed_at is still null.
  useEffect(() => {
    const unseen = offers.filter(
      (b) => (b as unknown as { talent_reviewed_at?: string | null }).talent_reviewed_at == null
    )
    for (const b of unseen) {
      const fd = new FormData()
      fd.set('bookingId', b.id)
      markBookingViewed(fd).catch(() => undefined)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offers.length])

  function setBookingError(id: string, msg: string) {
    setCardError((prev) => ({ ...prev, [id]: msg }))
  }
  function clearBookingError(id: string) {
    setCardError((prev) => {
      const next = { ...prev }
      delete next[id]
      return next
    })
  }

  async function confirmBooking(booking: Booking) {
    const snapshot = bookings
    clearBookingError(booking.id)
    setBookings((b) =>
      b.map((x) =>
        x.id === booking.id ? { ...x, status: 'confirmed' as const } : x
      )
    )
    try {
      const fd = new FormData()
      fd.set('bookingId', booking.id)
      await acceptBookingOffer(fd)
      return { ok: true as const }
    } catch (err) {
      setBookings(snapshot)
      const msg = err instanceof Error ? err.message : 'Could not confirm'
      setBookingError(booking.id, msg)
      return { ok: false as const, error: msg }
    }
  }

  async function declineBooking(booking: Booking) {
    const snapshot = bookings
    clearBookingError(booking.id)
    setBookings((b) => b.filter((x) => x.id !== booking.id))
    try {
      const fd = new FormData()
      fd.set('bookingId', booking.id)
      await declineBookingOffer(fd)
      return { ok: true as const }
    } catch (err) {
      setBookings(snapshot)
      const msg = err instanceof Error ? err.message : 'Could not decline'
      setBookingError(booking.id, msg)
      return { ok: false as const, error: msg }
    }
  }

  async function counterBooking(booking: Booking, dollars: string) {
    const snapshot = bookings
    clearBookingError(booking.id)
    setBookings((b) =>
      b.map((x) =>
        x.id === booking.id ? { ...x, status: 'negotiating' as const } : x
      )
    )
    try {
      const fd = new FormData()
      fd.set('bookingId', booking.id)
      fd.set('counter', dollars)
      await counterBookingOffer(fd)
      return { ok: true as const }
    } catch (err) {
      setBookings(snapshot)
      const msg = err instanceof Error ? err.message : 'Could not send counter'
      setBookingError(booking.id, msg)
      return { ok: false as const, error: msg }
    }
  }

  async function sheetConfirm() {
    if (!sheetBooking) return
    setSheetBusy('confirm')
    setSheetError('')
    const result = await confirmBooking(sheetBooking)
    setSheetBusy(null)
    if (result.ok) {
      setSheetBooking(null)
    } else {
      setSheetError(result.error)
    }
  }

  async function sheetDecline() {
    if (!sheetBooking) return
    setSheetBusy('decline')
    setSheetError('')
    const result = await declineBooking(sheetBooking)
    setSheetBusy(null)
    if (result.ok) {
      setSheetBooking(null)
    } else {
      setSheetError(result.error)
    }
  }

  function closeSheet() {
    if (sheetBusy) return
    setSheetBooking(null)
    setSheetError('')
  }

  return (
    <main
      className="rounded-t-rs-lg"
      style={{ background: BG, color: '#fff', minHeight: 'calc(100dvh - 64px)' }}
    >
      <div className="max-w-md mx-auto px-5 pt-6 pb-10">
        <header
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            marginBottom: 20,
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <p
              style={{
                fontSize: 18,
                fontWeight: 600,
                color: '#fff',
                lineHeight: 1.2,
              }}
            >
              {greeting()}, {firstName}
            </p>
            <p style={{ fontSize: 12, color: TEXT_MUTED, marginTop: 2 }}>
              {today}
            </p>
          </div>
          <Avatar url={profile?.avatar_url ?? null} name={displayName} size={40} />
        </header>

        {loading ? (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '60px 0',
            }}
          >
            <Spinner />
          </div>
        ) : (
          <>
            <SectionHeading>Upcoming jobs</SectionHeading>
            {upcoming.length === 0 ? (
              <EmptyCard>No upcoming jobs yet.</EmptyCard>
            ) : (
              upcoming.map((b) => (
                <JobCard
                  key={b.id}
                  booking={b}
                  variant="confirmed"
                  errorMsg={cardError[b.id]}
                />
              ))
            )}

            <div style={{ height: 8 }} />

            <SectionHeading>Job offers</SectionHeading>
            {offers.length === 0 ? (
              <EmptyCard>No pending offers right now.</EmptyCard>
            ) : (
              offers.map((b) => (
                <JobCard
                  key={b.id}
                  booking={b}
                  variant="offer"
                  errorMsg={cardError[b.id]}
                  onViewDetails={() => {
                    setSheetError('')
                    setSheetBooking(b)
                  }}
                  onConfirm={() => {
                    confirmBooking(b)
                  }}
                  onDecline={() => {
                    declineBooking(b)
                  }}
                  onCounter={(dollars) => counterBooking(b, dollars)}
                />
              ))
            )}
          </>
        )}
      </div>

      <JobDetailSheet
        booking={sheetBooking}
        onClose={closeSheet}
        onConfirm={sheetConfirm}
        onDecline={sheetDecline}
        busy={sheetBusy}
        errorMsg={sheetError}
      />
    </main>
  )
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2
      style={{
        fontSize: 11,
        fontWeight: 600,
        textTransform: 'uppercase',
        letterSpacing: '0.1em',
        color: TEXT_MUTED,
        marginTop: 16,
        marginBottom: 10,
      }}
    >
      {children}
    </h2>
  )
}

function EmptyCard({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        background: CARD_BG,
        border: `1px solid ${CARD_BORDER}`,
        borderRadius: 14,
        padding: '18px 20px',
        fontSize: 13,
        color: TEXT_MUTED,
        marginBottom: 12,
      }}
    >
      {children}
    </div>
  )
}

type JobCardProps = {
  booking: Booking
  variant: 'confirmed' | 'offer'
  errorMsg?: string
  onViewDetails?: () => void
  onConfirm?: () => void
  onDecline?: () => void
  onCounter?: (dollars: string) => void
}

function JobCard({
  booking,
  variant,
  errorMsg,
  onViewDetails,
  onConfirm,
  onDecline,
  onCounter,
}: JobCardProps) {
  const job = booking.job
  const dateStr = summariseShootDays(job)
  // Cast once so we can read the extended columns fetched on the booking
  // without polluting the shared Booking type.
  const ext = booking as unknown as {
    offered_rate_cents: number | null
    rate_negotiation_notes: string | null
  }
  const offeredCents = ext.offered_rate_cents ?? null
  const rateCents =
    variant === 'confirmed'
      ? booking.confirmed_rate_cents
      : offeredCents ?? booking.confirmed_rate_cents ?? job.day_rate_cents
  const rateLabel = variant === 'confirmed' ? 'Confirmed rate' : 'Offered rate'
  const isOffer = variant === 'offer'
  const [counterOpen, setCounterOpen] = useState(false)
  const [counterDollars, setCounterDollars] = useState(
    offeredCents != null ? String(offeredCents / 100) : ''
  )
  const negotiating = booking.status === 'negotiating'

  function openMaps(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    if (!job.location) return
    window.open(getMapsUrl(job.location), '_blank', 'noopener,noreferrer')
  }

  return (
    <article
      style={{
        background: CARD_BG,
        border: `1px solid ${CARD_BORDER}`,
        borderLeft: isOffer ? '4px solid #d4950a' : `1px solid ${CARD_BORDER}`,
        borderRadius: 14,
        overflow: 'hidden',
        marginBottom: 12,
      }}
    >
      {/* Title row */}
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: 12,
          padding: '14px 16px 10px',
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          {isOffer && (
            <span
              style={{
                display: 'inline-block',
                padding: '3px 8px',
                borderRadius: 999,
                background: 'rgba(212,149,10,0.2)',
                color: '#d4950a',
                fontSize: 9,
                fontWeight: 700,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                marginBottom: 6,
                border: '1px solid rgba(212,149,10,0.35)',
              }}
            >
              Job offer
            </span>
          )}
          <h3
            style={{
              fontSize: 16,
              fontWeight: 600,
              color: '#fff',
              lineHeight: 1.25,
            }}
          >
            {job.title}
          </h3>
        </div>
        <AddToCalendar job={job} />
      </div>

      {/* Date row */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '0 16px 8px',
          fontSize: 13,
          color: '#fff',
        }}
      >
        <CalendarGlyph />
        <span>{dateStr}</span>
      </div>

      {/* Location row */}
      {job.location && (
        <a
          href="#"
          onClick={openMaps}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '0 16px 10px',
            fontSize: 13,
            color: '#fff',
            textDecoration: 'underline',
            textUnderlineOffset: 2,
          }}
        >
          <PinGlyph />
          <span>{job.location}</span>
          <span style={{ color: TEXT_MUTED }}>↗</span>
        </a>
      )}

      {/* Client notes */}
      {job.client_notes && (
        <div
          style={{
            padding: '8px 14px',
            borderTop: `1px solid ${CARD_BORDER_SOFT}`,
            fontSize: 12,
            color: TEXT_MUTED,
            lineHeight: 1.5,
          }}
        >
          <span
            style={{
              fontSize: 10,
              fontWeight: 500,
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              display: 'block',
              marginBottom: 4,
            }}
          >
            Notes
          </span>
          {job.client_notes}
        </div>
      )}

      {errorMsg && (
        <div
          style={{
            padding: '8px 14px',
            borderTop: `1px solid ${CARD_BORDER_SOFT}`,
            fontSize: 12,
            color: '#fca5a5',
            lineHeight: 1.5,
          }}
        >
          {errorMsg}
        </div>
      )}

      {/* Bottom strip */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '12px 14px',
          borderTop: `1px solid ${CARD_BORDER_SOFT}`,
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <p
            style={{
              fontSize: 10,
              fontWeight: 500,
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              color: TEXT_MUTED,
            }}
          >
            {rateLabel}
          </p>
          <p style={{ fontSize: 14, fontWeight: 700, color: '#fff', marginTop: 2 }}>
            {rateCents
              ? (
                <>
                  {formatMoney(rateCents)}
                  <span style={{ color: TEXT_MUTED, fontWeight: 400 }}> / day</span>
                </>
              )
              : (
                <span style={{ color: TEXT_MUTED, fontWeight: 500 }}>Rate TBC</span>
              )}
          </p>
        </div>

        {variant === 'confirmed' ? (
          <span
            style={{
              padding: '6px 10px',
              borderRadius: 999,
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              background: 'rgba(74,222,128,0.15)',
              color: '#4ade80',
              border: '1px solid rgba(74,222,128,0.25)',
            }}
          >
            Confirmed
          </span>
        ) : (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              flexWrap: 'nowrap',
            }}
          >
            {onCounter && !counterOpen && (
              <button
                type="button"
                onClick={() => setCounterOpen(true)}
                style={{
                  padding: '8px 12px',
                  borderRadius: 10,
                  background: 'rgba(212,149,10,0.18)',
                  color: '#F0A500',
                  border: '1px solid rgba(212,149,10,0.35)',
                  fontSize: 12,
                  fontWeight: 500,
                  cursor: 'pointer',
                }}
              >
                ✎ Counter
              </button>
            )}
            <button
              type="button"
              onClick={onDecline}
              style={{
                padding: '8px 12px',
                borderRadius: 10,
                background: 'rgba(255,255,255,0.08)',
                color: TEXT_MUTED,
                border: '1px solid rgba(170,189,224,0.2)',
                fontSize: 12,
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              Decline
            </button>
            <button
              type="button"
              onClick={onConfirm}
              style={{
                padding: '8px 14px',
                borderRadius: 10,
                background: '#fff',
                color: '#1A3C6B',
                border: 'none',
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              ✓ Accept
            </button>
          </div>
        )}
      </div>

      {isOffer && negotiating && ext.rate_negotiation_notes && (
        <div
          style={{
            padding: '10px 14px',
            borderTop: `1px solid ${CARD_BORDER_SOFT}`,
            fontSize: 12,
            color: '#F0A500',
            background: 'rgba(212,149,10,0.08)',
          }}
        >
          {ext.rate_negotiation_notes} — waiting for admin response.
        </div>
      )}

      {isOffer && counterOpen && (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (!onCounter || !counterDollars) return
            onCounter(counterDollars)
            setCounterOpen(false)
          }}
          style={{
            padding: '10px 14px',
            borderTop: `1px solid ${CARD_BORDER_SOFT}`,
            display: 'flex',
            gap: 8,
            alignItems: 'center',
          }}
        >
          <span style={{ fontSize: 12, color: TEXT_MUTED }}>$</span>
          <input
            type="number"
            min={0}
            step={25}
            autoFocus
            value={counterDollars}
            onChange={(e) => setCounterDollars(e.target.value)}
            placeholder="Your proposed rate"
            style={{
              flex: 1,
              padding: '8px 10px',
              borderRadius: 8,
              border: '1px solid rgba(170,189,224,0.2)',
              background: 'rgba(255,255,255,0.05)',
              color: '#fff',
              fontSize: 13,
              outline: 'none',
            }}
          />
          <span style={{ fontSize: 11, color: TEXT_MUTED }}>/day</span>
          <button
            type="button"
            onClick={() => setCounterOpen(false)}
            style={{
              padding: '7px 10px',
              borderRadius: 8,
              background: 'transparent',
              color: TEXT_MUTED,
              border: '1px solid rgba(170,189,224,0.2)',
              fontSize: 11,
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!counterDollars}
            style={{
              padding: '7px 12px',
              borderRadius: 8,
              background: '#F0A500',
              color: '#1A3C6B',
              border: 'none',
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
              cursor: 'pointer',
              opacity: counterDollars ? 1 : 0.6,
            }}
          >
            Send counter
          </button>
        </form>
      )}
    </article>
  )
}

function CalendarGlyph() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ color: TEXT_MUTED, flexShrink: 0 }}
      aria-hidden
    >
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </svg>
  )
}

function PinGlyph() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ color: TEXT_MUTED, flexShrink: 0 }}
      aria-hidden
    >
      <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  )
}

function Spinner() {
  return (
    <div
      style={{
        width: 28,
        height: 28,
        border: '2px solid #1A3C6B',
        borderTopColor: '#AABDE0',
        borderRadius: '50%',
        animation: 'rs-spin 0.8s linear infinite',
      }}
    >
      <style>{`@keyframes rs-spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}

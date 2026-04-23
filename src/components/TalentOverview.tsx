'use client'

import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '@/lib/auth-context'
import { Avatar } from '@/components/Avatar'
import { AddToCalendarButton } from '@/components/AddToCalendarButton'
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
  declineBookingOffer,
  markBookingViewed,
} from '@/app/actions/bookings'

const BG = '#1A3C6B'
const CARD_BG = '#2E5099'
const CARD_BORDER = 'rgba(170,189,224,0.15)'
const CARD_BORDER_SOFT = 'rgba(170,189,224,0.1)'
const TEXT_MUTED = '#AABDE0'

// offered_rate_cents / confirmed_rate_cents on a booking is always the
// TALENT NET — what talent actually take home. This component is
// talent-facing only, so day_rate_cents is rendered as-is. For any
// client-facing surface use clientRateCents() from @/lib/rates.

type SheetBusy = 'confirm' | 'decline' | null

export function TalentOverview() {
  const { user, profile, supabase } = useAuth()

  const [bookings, setBookings] = useState<Booking[]>([])
  const [loading, setLoading] = useState(true)
  // Talent's own day rate — pulled once so booking cards can show
  // contextual "Your full day rate is $X" copy on short shoots.
  const [ownDayRateCents, setOwnDayRateCents] = useState<number | null>(null)
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

  // Load talent's bookings + own day rate. Extracted so both the
  // initial mount effect and the realtime-subscription effect below
  // can re-run the same fetch when something changes server-side.
  const load = useCallback(async () => {
    const uid = user?.id
    if (!uid) return
    const rateRes = supabase
      .from('talent_profiles')
      .select('day_rate_cents')
      .eq('id', uid)
      .maybeSingle()
    const { data, error } = await supabase
      .from('job_bookings')
      .select(
        `id, status, confirmed_rate_cents, offered_rate_cents,
         talent_reviewed_at,
         is_short_shoot, shoot_duration_hours,
         jobs (
           id, title, description, location,
           start_date, end_date, call_time,
           day_rate_cents, client_notes,
           shoot_days, crew_needed
         )`
      )
      .eq('talent_id', uid)
      // Talent sees actionable offers (requested) plus already-confirmed
      // jobs. admin_approved is kept for any legacy rows — new bookings
      // go straight to 'requested' with no admin gate.
      .in('status', ['requested', 'admin_approved', 'confirmed'])
      .order('created_at', { ascending: false })

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
    try {
      const { data: rateRow } = await rateRes
      setOwnDayRateCents(rateRow?.day_rate_cents ?? null)
    } catch {
      // non-fatal — short-shoot cards just won't show the comparison note
    }
    setLoading(false)
  }, [user?.id, supabase])

  // Initial mount + whenever identity changes.
  useEffect(() => {
    if (!user?.id) return
    void load()
  }, [user?.id, load])

  // Realtime: re-fetch whenever a job_bookings row for this talent
  // changes on the server. Covers fresh offers from the roster's
  // reofferClientBooking action, declines, confirms, and any admin
  // edits. RLS on job_bookings restricts this channel to rows the
  // talent can already read, so the filter is effectively scoped.
  useEffect(() => {
    const uid = user?.id
    if (!uid) return
    const channel = supabase
      .channel(`talent-bookings:${uid}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'job_bookings',
          filter: `talent_id=eq.${uid}`,
        },
        () => {
          void load()
        }
      )
      .subscribe()
    return () => {
      try {
        void supabase.removeChannel(channel)
      } catch {
        // ignore cleanup errors on unmount
      }
    }
  }, [user?.id, supabase, load])

  const upcoming = bookings.filter((b) => b.status === 'confirmed')
  const offers = bookings.filter(
    (b) => b.status === 'requested' || b.status === 'admin_approved'
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
                  ownDayRateCents={ownDayRateCents}
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
                  ownDayRateCents={ownDayRateCents}
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
  /** Talent's own day rate, for contextual short-shoot copy. */
  ownDayRateCents?: number | null
  onViewDetails?: () => void
  onConfirm?: () => void
  onDecline?: () => void
}

function JobCard({
  booking,
  variant,
  errorMsg,
  ownDayRateCents,
  onViewDetails,
  onConfirm,
  onDecline,
}: JobCardProps) {
  const job = booking.job
  const dateStr = summariseShootDays(job)
  // offered_rate_cents is now on the Booking type directly — no cast
  // needed. is_short_shoot + shoot_duration_hours live on the row too
  // but aren't in the shared Booking shape yet, so they still need a
  // narrow cast.
  const ext = booking as unknown as {
    is_short_shoot: boolean | null
    shoot_duration_hours: number | null
  }
  const offeredCents = booking.offered_rate_cents ?? null
  // offered_rate_cents IS the talent net — display directly, no fee
  // maths. The flow is direct client → talent: the roster enforces
  // that an offer always carries a rate, but for legacy rows where
  // offered_rate_cents might be null we fall back to the job's own
  // day_rate_cents (also talent net) so the card always surfaces a
  // concrete number.
  const rateCents =
    variant === 'confirmed'
      ? booking.confirmed_rate_cents ?? offeredCents ?? null
      : offeredCents ?? job.day_rate_cents ?? null
  const isShortShoot =
    ext.is_short_shoot === true ||
    (ext.shoot_duration_hours != null && Number(ext.shoot_duration_hours) < 4)
  const durationHrs =
    ext.shoot_duration_hours != null
      ? Number(ext.shoot_duration_hours)
      : null
  // Talent's own day rate, for the contextual day-rate comparison note.
  const talentDayRateCents = ownDayRateCents ?? null
  const isOffer = variant === 'offer'

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
          {isShortShoot && (
            <span
              style={{
                display: 'inline-block',
                padding: '3px 8px',
                borderRadius: 999,
                background: 'rgba(240,165,0,0.18)',
                color: '#F0A500',
                fontSize: 9,
                fontWeight: 700,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                marginBottom: 6,
                marginLeft: isOffer ? 6 : 0,
                border: '1px solid rgba(240,165,0,0.4)',
              }}
            >
              Short shoot — under 4 hours
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
        {!isOffer && job.start_date && (
          <AddToCalendarButton
            title={`${job.title} — Rowly Studios`}
            startDate={job.start_date}
            endDate={job.end_date ?? undefined}
            callTime={job.call_time}
            location={job.location ?? undefined}
            variant="ghost"
            size="sm"
          />
        )}
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
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              color: TEXT_MUTED,
              marginBottom: 4,
            }}
          >
            {variant === 'confirmed'
              ? 'Your confirmed rate'
              : 'Rate offered to you'}
          </p>

          {offeredCents || (variant === 'confirmed' && rateCents) ? (
            <p
              style={{
                fontSize: 22,
                fontWeight: 700,
                color: '#fff',
                lineHeight: 1.1,
              }}
            >
              {formatMoney(rateCents)}
              {!isShortShoot && (
                <span
                  style={{
                    fontSize: 13,
                    fontWeight: 400,
                    color: TEXT_MUTED,
                    marginLeft: 4,
                  }}
                >
                  / day
                </span>
              )}
            </p>
          ) : (
            <p
              style={{
                fontSize: 14,
                color: TEXT_MUTED,
                fontStyle: 'italic',
              }}
            >
              Rate to be confirmed
            </p>
          )}

          {/* Short-shoot flag — complements the missing "/ day" suffix so
              the talent knows why this is a flat fee. */}
          {isShortShoot && rateCents && (
            <p
              style={{
                fontSize: 11,
                color: '#F0A500',
                marginTop: 3,
                fontWeight: 600,
              }}
            >
              Flat fee · short shoot
              {durationHrs ? ` (${durationHrs} hrs)` : ''}
            </p>
          )}

          {/* Day-rate context — only when the offer diverges from the
              talent's own day rate so they can weigh accept vs. decline. */}
          {isOffer &&
            !isShortShoot &&
            talentDayRateCents &&
            offeredCents &&
            offeredCents !== talentDayRateCents && (
              <p
                style={{
                  fontSize: 11,
                  color: TEXT_MUTED,
                  marginTop: 4,
                  lineHeight: 1.4,
                }}
              >
                Your day rate is {formatMoney(talentDayRateCents)}/day
              </p>
            )}
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

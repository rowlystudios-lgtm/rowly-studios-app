'use client'

import Link from 'next/link'
import { useState } from 'react'
import { confirmBooking, declineBooking, nudgeTalent } from './jobs/actions'
import { JobCodePill } from '@/components/JobCodePill'

export type OfferInFlight = {
  bookingId: string
  bookingStatus: 'requested' | 'negotiating'
  offeredRateCents: number | null
  talentReviewedAt: string | null
  responseDeadlineAt: string | null
  nudgeCount: number | null
  autoAccepted: boolean
  jobId: string
  jobTitle: string
  jobCode: string | null
  jobStart: string | null
  jobLocation: string | null
  talentId: string
  talentName: string
  talentRole: string | null
  talentAvatar: string | null
  clientName: string
}

function fmtUsd(c: number | null | undefined): string {
  if (!c && c !== 0) return '—'
  return `$${(c / 100).toLocaleString('en-US', { maximumFractionDigits: 0 })}`
}

function formatShort(iso: string | null): string {
  if (!iso) return ''
  const parts = iso.split('-').map(Number)
  if (parts.length !== 3 || parts.some(Number.isNaN)) return ''
  const d = new Date(parts[0], parts[1] - 1, parts[2])
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function relativeAgo(iso: string | null): string {
  if (!iso) return ''
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return ''
  const diffMins = Math.round((Date.now() - then) / 60_000)
  if (diffMins < 1) return 'just now'
  if (diffMins < 60) return `${diffMins}m ago`
  const hrs = Math.round(diffMins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.round(hrs / 24)
  return `${days}d ago`
}

function hoursUntil(iso: string | null): number | null {
  if (!iso) return null
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return null
  return Math.round((then - Date.now()) / (1000 * 60 * 60))
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).slice(0, 2)
  return parts.map((p) => p[0]?.toUpperCase() ?? '').join('') || '?'
}

export function OffersInFlight({ offers }: { offers: OfferInFlight[] }) {
  return (
    <section className="mt-6">
      <div className="flex items-center justify-between mb-3">
        <p
          style={{
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            color: '#F0A500',
          }}
        >
          Offers in flight
        </p>
        <span
          className="rounded-full"
          style={{
            padding: '2px 9px',
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: '0.06em',
            background: offers.length > 0 ? 'rgba(240,165,0,0.18)' : 'rgba(170,189,224,0.12)',
            color: offers.length > 0 ? '#F0A500' : '#7A90AA',
            border: `1px solid ${offers.length > 0 ? 'rgba(240,165,0,0.35)' : 'rgba(170,189,224,0.25)'}`,
          }}
        >
          {offers.length} pending
        </span>
      </div>

      {offers.length === 0 ? (
        <div
          className="rounded-xl text-center"
          style={{
            background: 'rgba(34,197,94,0.10)',
            border: '1px solid rgba(34,197,94,0.30)',
            padding: '18px 18px',
          }}
        >
          <p style={{ fontSize: 13, color: '#86EFAC', fontWeight: 600 }}>
            All offers resolved — nothing pending ✓
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {offers.map((o) => (
            <OfferRow key={o.bookingId} offer={o} />
          ))}
        </div>
      )}
    </section>
  )
}

function OfferRow({ offer: o }: { offer: OfferInFlight }) {
  const [busy, setBusy] = useState<'confirm' | 'decline' | 'nudge' | null>(null)
  const borderColour =
    o.bookingStatus === 'negotiating' ? '#60A5FA' : '#F0A500'
  const deadline = o.responseDeadlineAt
    ? new Date(o.responseDeadlineAt)
    : null
  const overdue = deadline != null && deadline < new Date()
  const hoursLeft = hoursUntil(o.responseDeadlineAt)

  if (o.autoAccepted) {
    return (
      <article
        className="rounded-xl"
        style={{
          background: '#1A2E4A',
          borderLeft: '4px solid #4ADE80',
          border: '1px solid rgba(255,255,255,0.05)',
          padding: 14,
          display: 'flex',
          alignItems: 'center',
          gap: 12,
        }}
      >
        <Avatar name={o.talentName} src={o.talentAvatar} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <p className="text-white" style={{ fontSize: 14, fontWeight: 500 }}>
            {o.talentName} · {o.jobTitle}
          </p>
          <p style={{ fontSize: 12, color: '#86EFAC', marginTop: 2 }}>
            ⚡ Auto-accepted — {fmtUsd(o.offeredRateCents)}/day
          </p>
        </div>
      </article>
    )
  }

  return (
    <article
      className="rounded-xl"
      style={{
        background: '#1A2E4A',
        borderLeft: `4px solid ${borderColour}`,
        border: '1px solid rgba(255,255,255,0.05)',
        padding: 14,
      }}
    >
      <div className="flex items-start gap-3">
        <Avatar name={o.talentName} src={o.talentAvatar} />

        {/* Middle */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <Link
            href={`/admin/jobs/${o.jobId}`}
            style={{
              color: '#fff',
              fontSize: 14,
              fontWeight: 500,
              textDecoration: 'none',
            }}
          >
            {o.jobTitle}
          </Link>
          <p
            style={{
              fontSize: 12,
              color: '#AABDE0',
              marginTop: 2,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {o.talentName}
            {o.talentRole ? ` · ${o.talentRole}` : ''}
          </p>
          <p style={{ fontSize: 12, color: '#7A90AA', marginTop: 1 }}>
            → {o.clientName}
          </p>
          <div className="flex flex-wrap items-center gap-2 mt-2">
            {o.jobCode && <JobCodePill code={o.jobCode} />}
            <span style={{ fontSize: 13, color: '#fff' }}>
              Offered {fmtUsd(o.offeredRateCents)}/day
            </span>
            {o.jobStart && (
              <span style={{ fontSize: 12, color: '#7A90AA' }}>
                · Shoot {formatShort(o.jobStart)}
              </span>
            )}
          </div>
        </div>

        {/* Right column */}
        <div
          className="flex flex-col items-end gap-1.5"
          style={{ flexShrink: 0, textAlign: 'right' }}
        >
          <span
            className="rounded-full"
            style={{
              padding: '3px 9px',
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              background:
                o.bookingStatus === 'negotiating'
                  ? 'rgba(59,130,246,0.2)'
                  : 'rgba(240,165,0,0.2)',
              color:
                o.bookingStatus === 'negotiating' ? '#93C5FD' : '#F0A500',
              border: `1px solid ${
                o.bookingStatus === 'negotiating'
                  ? 'rgba(59,130,246,0.35)'
                  : 'rgba(240,165,0,0.35)'
              }`,
            }}
          >
            {o.bookingStatus === 'negotiating' ? 'Negotiating' : 'Pending'}
          </span>

          {o.talentReviewedAt ? (
            <span style={{ fontSize: 11, color: '#86EFAC' }}>
              👁 Viewed {relativeAgo(o.talentReviewedAt)}
            </span>
          ) : (
            <span
              className="inline-flex items-center gap-1"
              style={{ fontSize: 11, color: '#F0A500' }}
            >
              <span
                aria-hidden
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: 999,
                  background: '#F0A500',
                }}
              />
              Not yet viewed
            </span>
          )}

          {overdue ? (
            <span
              className="rounded-full"
              style={{
                padding: '2px 8px',
                fontSize: 9,
                fontWeight: 700,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                background: 'rgba(239,68,68,0.2)',
                color: '#F87171',
                border: '1px solid rgba(239,68,68,0.35)',
              }}
            >
              Overdue
              {o.nudgeCount && o.nudgeCount > 0
                ? ` · Nudged ${o.nudgeCount}x`
                : ''}
            </span>
          ) : hoursLeft != null ? (
            <span style={{ fontSize: 11, color: '#7A90AA' }}>
              {hoursLeft > 0 ? `${hoursLeft}h to respond` : '< 1h to respond'}
            </span>
          ) : null}

          <div className="flex gap-1.5 mt-1">
            {overdue && (
              <form
                action={async (fd: FormData) => {
                  setBusy('nudge')
                  fd.set('bookingId', o.bookingId)
                  fd.set('jobId', o.jobId)
                  await nudgeTalent(fd)
                  setBusy(null)
                }}
              >
                <button
                  type="submit"
                  disabled={busy !== null}
                  style={{
                    padding: '5px 9px',
                    borderRadius: 7,
                    fontSize: 10,
                    fontWeight: 700,
                    letterSpacing: '0.06em',
                    textTransform: 'uppercase',
                    background: 'rgba(240,165,0,0.18)',
                    color: '#F0A500',
                    border: '1px solid rgba(240,165,0,0.35)',
                    cursor: busy ? 'wait' : 'pointer',
                  }}
                >
                  🔔 Nudge
                </button>
              </form>
            )}
            <form
              action={async (fd: FormData) => {
                setBusy('decline')
                fd.set('bookingId', o.bookingId)
                fd.set('jobId', o.jobId)
                await declineBooking(fd)
                setBusy(null)
              }}
            >
              <button
                type="submit"
                disabled={busy !== null}
                aria-label="Decline"
                style={{
                  padding: '5px 9px',
                  borderRadius: 7,
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                  background: 'rgba(239,68,68,0.15)',
                  color: '#F87171',
                  border: '1px solid rgba(239,68,68,0.35)',
                  cursor: busy ? 'wait' : 'pointer',
                }}
              >
                ✗ Decline
              </button>
            </form>
            <form
              action={async (fd: FormData) => {
                setBusy('confirm')
                fd.set('bookingId', o.bookingId)
                fd.set('jobId', o.jobId)
                await confirmBooking(fd)
                setBusy(null)
              }}
            >
              <button
                type="submit"
                disabled={busy !== null}
                aria-label="Confirm"
                style={{
                  padding: '5px 9px',
                  borderRadius: 7,
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                  background: '#F0A500',
                  color: '#0F1B2E',
                  border: 'none',
                  cursor: busy ? 'wait' : 'pointer',
                }}
              >
                ✓ Confirm
              </button>
            </form>
          </div>
        </div>
      </div>
    </article>
  )
}

function Avatar({ name, src }: { name: string; src: string | null }) {
  return (
    <div
      className="rounded-full overflow-hidden"
      style={{
        width: 36,
        height: 36,
        background: '#1E3A6B',
        color: '#fff',
        fontSize: 12,
        fontWeight: 700,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      }}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt=""
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        />
      ) : (
        initials(name)
      )}
    </div>
  )
}

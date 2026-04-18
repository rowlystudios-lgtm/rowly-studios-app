'use client'

import { useEffect } from 'react'
import {
  formatCallTime,
  formatDateRange,
  formatMoney,
  getMapsUrl,
  type Booking,
} from '@/lib/jobs'
import { AddToCalendar } from './AddToCalendar'

const CARD_BG = '#2E5099'
const CARD_BORDER = 'rgba(170, 189, 224, 0.15)'
const TEXT_MUTED = '#AABDE0'

type Busy = 'confirm' | 'decline' | null

export function JobDetailSheet({
  booking,
  onClose,
  onConfirm,
  onDecline,
  busy,
  errorMsg,
}: {
  booking: Booking | null
  onClose: () => void
  onConfirm: () => void
  onDecline: () => void
  busy: Busy
  errorMsg: string
}) {
  useEffect(() => {
    if (!booking) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prev
      document.removeEventListener('keydown', onKey)
    }
  }, [booking, onClose])

  if (!booking) return null

  const job = booking.job
  const dateStr = formatDateRange(job.start_date, job.end_date)
  const callStr = formatCallTime(job.call_time)
  const offered = formatMoney(job.day_rate_cents)

  function openMaps(e: React.MouseEvent) {
    e.preventDefault()
    if (!job.location) return
    window.open(getMapsUrl(job.location), '_blank', 'noopener,noreferrer')
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 200,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex',
        alignItems: 'flex-end',
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Job details"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          background: '#1A3C6B',
          borderRadius: '20px 20px 0 0',
          paddingBottom: 'calc(40px + env(safe-area-inset-bottom))',
          maxHeight: '85dvh',
          overflowY: 'auto',
          color: '#fff',
        }}
      >
        <div style={{ padding: '12px 0 4px', display: 'flex', justifyContent: 'center' }}>
          <div
            style={{
              width: 36,
              height: 4,
              borderRadius: 2,
              background: 'rgba(170,189,224,0.3)',
            }}
          />
        </div>

        <div style={{ padding: '8px 20px 0' }}>
          <div
            style={{
              marginBottom: 16,
              display: 'flex',
              alignItems: 'flex-start',
              justifyContent: 'space-between',
              gap: 12,
            }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 500,
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                  color: TEXT_MUTED,
                }}
              >
                Job request
              </span>
              <h2
                style={{
                  fontSize: 20,
                  fontWeight: 600,
                  color: '#fff',
                  marginTop: 4,
                  lineHeight: 1.2,
                }}
              >
                {job.title}
              </h2>
            </div>
            <AddToCalendar job={job} />
          </div>

          <Card>
            <Label>When</Label>
            <p style={{ fontSize: 14, marginTop: 4 }}>
              {dateStr}
              {callStr && (
                <>
                  <span style={{ color: TEXT_MUTED }}> · Call </span>
                  {callStr}
                </>
              )}
            </p>
          </Card>

          {job.location && (
            <Card>
              <Label>Location</Label>
              <a
                href="#"
                onClick={openMaps}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  fontSize: 14,
                  marginTop: 4,
                  color: '#fff',
                  textDecoration: 'underline',
                  textUnderlineOffset: 2,
                }}
              >
                <PinIcon />
                {job.location}
                <span style={{ color: TEXT_MUTED }}>↗</span>
              </a>
            </Card>
          )}

          <Card>
            <Label>Offered rate</Label>
            <p style={{ fontSize: 18, fontWeight: 700, marginTop: 4 }}>
              {offered} <span style={{ color: TEXT_MUTED, fontWeight: 400 }}>/ day</span>
            </p>
          </Card>

          {job.description && (
            <Card>
              <Label>Description</Label>
              <p
                style={{
                  fontSize: 14,
                  marginTop: 4,
                  lineHeight: 1.5,
                  whiteSpace: 'pre-wrap',
                }}
              >
                {job.description}
              </p>
            </Card>
          )}

          {job.client_notes && (
            <Card>
              <Label>Client notes</Label>
              <p
                style={{
                  fontSize: 14,
                  marginTop: 4,
                  lineHeight: 1.5,
                  whiteSpace: 'pre-wrap',
                  color: TEXT_MUTED,
                }}
              >
                {job.client_notes}
              </p>
            </Card>
          )}

          {errorMsg && (
            <p
              style={{
                fontSize: 12,
                color: '#fca5a5',
                marginTop: 12,
                padding: '10px 12px',
                background: 'rgba(248,113,113,0.12)',
                border: '1px solid rgba(248,113,113,0.25)',
                borderRadius: 10,
              }}
            >
              {errorMsg}
            </p>
          )}

          <div style={{ display: 'flex', gap: 10, marginTop: 24 }}>
            <button
              type="button"
              onClick={onDecline}
              disabled={busy !== null}
              style={{
                flex: 1,
                padding: '14px 0',
                borderRadius: 12,
                background: 'rgba(255,255,255,0.08)',
                color: TEXT_MUTED,
                border: '1px solid rgba(170,189,224,0.2)',
                fontSize: 14,
                fontWeight: 500,
                opacity: busy !== null ? 0.6 : 1,
                cursor: busy !== null ? 'wait' : 'pointer',
              }}
            >
              {busy === 'decline' ? 'Declining…' : 'Decline'}
            </button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={busy !== null}
              style={{
                flex: 1,
                padding: '14px 0',
                borderRadius: 12,
                background: '#fff',
                color: '#1A3C6B',
                border: 'none',
                fontSize: 14,
                fontWeight: 600,
                opacity: busy !== null ? 0.6 : 1,
                cursor: busy !== null ? 'wait' : 'pointer',
              }}
            >
              {busy === 'confirm' ? 'Confirming…' : 'Confirm'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        background: CARD_BG,
        border: `1px solid ${CARD_BORDER}`,
        borderRadius: 12,
        padding: '14px 16px',
        marginBottom: 10,
      }}
    >
      {children}
    </div>
  )
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <span
      style={{
        fontSize: 10,
        fontWeight: 500,
        textTransform: 'uppercase',
        letterSpacing: '0.08em',
        color: TEXT_MUTED,
      }}
    >
      {children}
    </span>
  )
}

function PinIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  )
}

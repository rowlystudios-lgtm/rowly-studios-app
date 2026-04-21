'use client'

import { useState, useTransition } from 'react'
import {
  acceptApplication,
  rejectApplication,
  saveApplicationNotes,
} from './actions'

type Application = {
  id: string
  email: string
  first_name: string | null
  last_name: string | null
  phone: string | null
  type: string
  status: string
  department: string | null
  primary_role: string | null
  instagram: string | null
  website: string | null
  company_name: string | null
  industry: string | null
  message: string | null
  admin_notes: string | null
  created_at: string
  reviewed_at: string | null
  reviewed_by: string | null
}

type Props = {
  app: Application
  reviewerName?: string | null
}

function daysAgo(iso: string): string {
  const d = new Date(iso)
  const diff = Date.now() - d.getTime()
  const days = Math.floor(diff / (1000 * 60 * 60 * 24))
  if (days === 0) {
    const hours = Math.floor(diff / (1000 * 60 * 60))
    if (hours === 0) return 'just now'
    return `${hours}h ago`
  }
  if (days === 1) return '1 day ago'
  if (days < 30) return `${days} days ago`
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

export function ApplicationCard({ app, reviewerName }: Props) {
  const [notes, setNotes] = useState(app.admin_notes ?? '')
  const [savedAt, setSavedAt] = useState<number | null>(null)
  const [saveTimer, setSaveTimer] = useState<ReturnType<
    typeof setTimeout
  > | null>(null)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const isTalent = app.type === 'talent'
  const typeColor = isTalent ? '#0FA3A3' : '#D48A00'
  const typeLabel = isTalent ? 'TALENT' : 'CLIENT'

  const status = app.status
  const isActioned = status === 'approved' || status === 'rejected'
  const statusColor =
    status === 'approved'
      ? '#2D7A3A'
      : status === 'rejected'
        ? '#9A3333'
        : '#C98A1A'
  const statusLabel = status.toUpperCase()

  function onNotesChange(v: string) {
    setNotes(v)
    if (saveTimer) clearTimeout(saveTimer)
    const t = setTimeout(() => {
      const fd = new FormData()
      fd.set('id', app.id)
      fd.set('notes', v)
      saveApplicationNotes(fd).then(() => setSavedAt(Date.now()))
    }, 800)
    setSaveTimer(t)
  }

  function handleAccept() {
    if (!confirm(`Accept ${app.first_name ?? 'this applicant'}? This will invite them via email.`))
      return
    setError(null)
    const fd = new FormData()
    fd.set('id', app.id)
    startTransition(async () => {
      const res = await acceptApplication(fd)
      if (!res?.ok) setError(res?.error ?? 'Failed')
    })
  }

  function handleReject() {
    if (!confirm(`Reject ${app.first_name ?? 'this applicant'}?`)) return
    setError(null)
    const fd = new FormData()
    fd.set('id', app.id)
    startTransition(async () => {
      const res = await rejectApplication(fd)
      if (!res?.ok) setError(res?.error ?? 'Failed')
    })
  }

  const fullName =
    [app.first_name, app.last_name].filter(Boolean).join(' ') || app.email

  return (
    <article
      style={{
        background: '#132542',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 12,
        padding: 18,
        marginBottom: 14,
        color: '#E8EEF7',
      }}
    >
      {/* header: name + badges */}
      <header
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 12,
          flexWrap: 'wrap',
          marginBottom: 10,
        }}
      >
        <div>
          <div style={{ fontSize: 18, fontWeight: 700, lineHeight: 1.25 }}>
            {fullName}
          </div>
          <div
            style={{
              fontSize: 12,
              color: 'rgba(255,255,255,0.55)',
              marginTop: 2,
            }}
          >
            Applied {daysAgo(app.created_at)}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <span
            style={{
              background: typeColor,
              color: '#fff',
              fontSize: 10,
              fontWeight: 800,
              letterSpacing: '0.14em',
              padding: '4px 8px',
              borderRadius: 4,
            }}
          >
            {typeLabel}
          </span>
          <span
            style={{
              background: statusColor,
              color: '#fff',
              fontSize: 10,
              fontWeight: 800,
              letterSpacing: '0.14em',
              padding: '4px 8px',
              borderRadius: 4,
            }}
          >
            {statusLabel}
          </span>
        </div>
      </header>

      {/* contact */}
      <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.8)', marginBottom: 10 }}>
        <a
          href={`mailto:${app.email}`}
          style={{ color: '#8CC4FF', textDecoration: 'none' }}
        >
          {app.email}
        </a>
        {app.phone && (
          <>
            <span style={{ color: 'rgba(255,255,255,0.3)', margin: '0 8px' }}>·</span>
            <a
              href={`tel:${app.phone}`}
              style={{ color: '#8CC4FF', textDecoration: 'none' }}
            >
              {app.phone}
            </a>
          </>
        )}
      </div>

      {/* type-specific details */}
      <dl
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
          gap: '8px 16px',
          marginBottom: 10,
          fontSize: 13,
        }}
      >
        {isTalent ? (
          <>
            {app.department && <DetailItem label="Department" value={app.department} />}
            {app.primary_role && (
              <DetailItem label="Role" value={app.primary_role} />
            )}
            {app.instagram && (
              <DetailItem
                label="Instagram"
                link={`https://instagram.com/${app.instagram.replace(/^@/, '')}`}
                value={app.instagram}
              />
            )}
            {app.website && (
              <DetailItem label="Showreel" link={app.website} value={app.website} />
            )}
          </>
        ) : (
          <>
            {app.company_name && (
              <DetailItem label="Company" value={app.company_name} />
            )}
            {app.industry && <DetailItem label="Industry" value={app.industry} />}
            {app.website && (
              <DetailItem label="Website" link={app.website} value={app.website} />
            )}
          </>
        )}
      </dl>

      {/* message */}
      {app.message && (
        <blockquote
          style={{
            borderLeft: '3px solid rgba(0,194,224,0.6)',
            padding: '6px 12px',
            margin: '10px 0',
            fontSize: 13,
            lineHeight: 1.55,
            color: 'rgba(255,255,255,0.78)',
            fontStyle: 'italic',
            background: 'rgba(255,255,255,0.03)',
          }}
        >
          {app.message}
        </blockquote>
      )}

      {/* admin notes */}
      <div style={{ marginTop: 12 }}>
        <label
          style={{
            display: 'block',
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
            color: 'rgba(255,255,255,0.45)',
            marginBottom: 6,
          }}
        >
          Admin notes
          {savedAt && (
            <span
              style={{
                color: '#2ECC71',
                marginLeft: 8,
                letterSpacing: 0,
                textTransform: 'none',
                fontWeight: 500,
              }}
            >
              Saved
            </span>
          )}
        </label>
        <textarea
          value={notes}
          onChange={(e) => onNotesChange(e.target.value)}
          placeholder="Private notes about this applicant…"
          rows={2}
          style={{
            width: '100%',
            background: 'rgba(0,0,0,0.25)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 6,
            color: '#E8EEF7',
            padding: '8px 10px',
            fontSize: 13,
            fontFamily: 'inherit',
            resize: 'vertical',
            outline: 'none',
          }}
        />
      </div>

      {/* actions */}
      {!isActioned ? (
        <div
          style={{
            display: 'flex',
            gap: 10,
            marginTop: 14,
            flexWrap: 'wrap',
          }}
        >
          <button
            onClick={handleAccept}
            disabled={pending}
            style={{
              flex: '1 1 auto',
              minWidth: 140,
              padding: '10px 16px',
              background: '#2D7A3A',
              border: 'none',
              borderRadius: 6,
              color: '#fff',
              fontSize: 13,
              fontWeight: 700,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              cursor: pending ? 'default' : 'pointer',
              opacity: pending ? 0.6 : 1,
            }}
          >
            {pending ? 'Processing…' : 'Accept'}
          </button>
          <button
            onClick={handleReject}
            disabled={pending}
            style={{
              flex: '1 1 auto',
              minWidth: 140,
              padding: '10px 16px',
              background: 'transparent',
              border: '1px solid rgba(226,59,59,0.55)',
              borderRadius: 6,
              color: '#FF7A7A',
              fontSize: 13,
              fontWeight: 700,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              cursor: pending ? 'default' : 'pointer',
              opacity: pending ? 0.6 : 1,
            }}
          >
            Reject
          </button>
        </div>
      ) : (
        <div
          style={{
            marginTop: 12,
            padding: '8px 12px',
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 6,
            fontSize: 12,
            color: 'rgba(255,255,255,0.6)',
          }}
        >
          {statusLabel.toLowerCase() === 'approved' ? 'Approved' : 'Rejected'} by{' '}
          <strong style={{ color: 'rgba(255,255,255,0.85)' }}>
            {reviewerName ?? 'admin'}
          </strong>
          {app.reviewed_at && <> · {daysAgo(app.reviewed_at)}</>}
        </div>
      )}

      {error && (
        <div
          role="alert"
          style={{
            marginTop: 10,
            padding: '8px 12px',
            background: 'rgba(226,59,59,0.1)',
            border: '1px solid rgba(226,59,59,0.4)',
            borderRadius: 6,
            color: '#FF7A7A',
            fontSize: 12,
          }}
        >
          {error}
        </div>
      )}
    </article>
  )
}

function DetailItem({
  label,
  value,
  link,
}: {
  label: string
  value: string
  link?: string
}) {
  return (
    <div>
      <div
        style={{
          fontSize: 9,
          fontWeight: 700,
          letterSpacing: '0.18em',
          textTransform: 'uppercase',
          color: 'rgba(255,255,255,0.4)',
          marginBottom: 2,
        }}
      >
        {label}
      </div>
      {link ? (
        <a
          href={link}
          target="_blank"
          rel="noreferrer"
          style={{
            color: '#8CC4FF',
            textDecoration: 'none',
            fontSize: 13,
            wordBreak: 'break-word',
          }}
        >
          {value}
        </a>
      ) : (
        <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.85)' }}>
          {value}
        </span>
      )}
    </div>
  )
}

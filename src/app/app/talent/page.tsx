'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useAuth } from '@/lib/auth-context'
import { Avatar } from '@/components/Avatar'
import { AdminGuard } from '@/components/AdminGuard'
import { PageShell, TEXT_MUTED, TEXT_PRIMARY } from '@/components/PageShell'
import { DEPARTMENT_LABELS, type Department } from '@/lib/types'

const CARD_BG = '#2E5099'
const CARD_BORDER = 'rgba(170,189,224,0.15)'
const SOFT_BORDER = 'rgba(170,189,224,0.12)'
const AVAILABLE_GREEN = '#4ade80'
const AMBER = '#d4950a'
const RED = '#ef4444'
const BUTTON_NAVY = '#1A3C6B'

type Row = {
  id: string
  email: string | null
  first_name: string | null
  last_name: string | null
  full_name: string | null
  avatar_url: string | null
  city: string | null
  verified: boolean
  available: boolean
  created_at: string | null
  talent_profiles:
    | { department: Department | null; day_rate_cents: number | null }
    | { department: Department | null; day_rate_cents: number | null }[]
    | null
}

type ApplicationRow = {
  id: string
  email: string
  first_name: string | null
  last_name: string | null
  phone: string | null
  department: string | null
  instagram: string | null
  website: string | null
  message: string | null
  terms_agreed: boolean
  terms_agreed_at: string | null
  status: 'pending' | 'approved' | 'rejected'
  created_at: string | null
  admin_notes: string | null
}

type InviteRow = {
  id: string
  email: string
  application_id: string | null
  invited_at: string | null
  signed_up_at: string | null
  profile_id: string | null
}

function unwrap<T>(v: T | T[] | null): T | null {
  if (!v) return null
  return Array.isArray(v) ? v[0] ?? null : v
}

function fullName(row: Row): string {
  return (
    [row.first_name, row.last_name].filter(Boolean).join(' ') ||
    row.full_name ||
    'Unnamed'
  )
}

function appFullName(a: ApplicationRow): string {
  return (
    [a.first_name, a.last_name].filter(Boolean).join(' ') || a.email || 'Applicant'
  )
}

function formatDate(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

export default function AdminTalentPageWrapper() {
  return (
    <AdminGuard>
      <AdminTalentPage />
    </AdminGuard>
  )
}

function AdminTalentPage() {
  const { supabase, user } = useAuth()
  const [rows, setRows] = useState<Row[]>([])
  const [applications, setApplications] = useState<ApplicationRow[]>([])
  const [invites, setInvites] = useState<InviteRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [toggling, setToggling] = useState<string | null>(null)
  const [actionBusy, setActionBusy] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState('')
  const [rejectingId, setRejectingId] = useState<string | null>(null)
  const [rejectNotes, setRejectNotes] = useState('')
  const [showInviteForm, setShowInviteForm] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteBusy, setInviteBusy] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    const [
      { data: profilesData, error: profilesError },
      { data: appsData, error: appsError },
      { data: invitesData, error: invitesError },
    ] = await Promise.all([
      supabase
        .from('profiles')
        .select(
          `id, email, first_name, last_name, full_name, avatar_url,
           city, verified, available, created_at,
           talent_profiles (department, day_rate_cents)`
        )
        .eq('role', 'talent')
        .order('last_name'),
      supabase
        .from('talent_applications')
        .select(
          `id, email, first_name, last_name, phone, department,
           instagram, website, message, terms_agreed, terms_agreed_at,
           status, created_at, admin_notes`
        )
        .eq('status', 'pending')
        .order('created_at', { ascending: false }),
      supabase
        .from('talent_invites')
        .select(`id, email, application_id, invited_at, signed_up_at, profile_id`)
        .order('invited_at', { ascending: false }),
    ])

    if (profilesError) setError(profilesError.message)
    else if (appsError) setError(appsError.message)
    else if (invitesError) setError(invitesError.message)

    setRows((profilesData ?? []) as Row[])
    setApplications((appsData ?? []) as ApplicationRow[])
    setInvites((invitesData ?? []) as InviteRow[])
    setLoading(false)
  }, [supabase])

  useEffect(() => {
    load()
  }, [load])

  const invitedEmails = useMemo(() => {
    const s = new Set<string>()
    for (const i of invites) {
      if (i.email) s.add(i.email.toLowerCase())
    }
    return s
  }, [invites])

  // Invites that have no matching signed-up profile yet.
  const awaitingSignup = useMemo(() => {
    const profileEmails = new Set(
      rows.map((r) => r.email?.toLowerCase()).filter(Boolean) as string[]
    )
    return invites.filter(
      (i) =>
        !i.signed_up_at &&
        !(i.email && profileEmails.has(i.email.toLowerCase()))
    )
  }, [invites, rows])

  async function toggleVerified(row: Row) {
    if (toggling) return
    const snapshot = rows
    const next = !row.verified
    setRows((rs) =>
      rs.map((r) => (r.id === row.id ? { ...r, verified: next } : r))
    )
    setToggling(row.id)
    const { error } = await supabase
      .from('profiles')
      .update({
        verified: next,
        verified_at: next ? new Date().toISOString() : null,
      })
      .eq('id', row.id)
    if (error) {
      setRows(snapshot)
      setError(error.message)
    }
    setToggling(null)
  }

  async function approveApplication(app: ApplicationRow) {
    if (actionBusy || !user?.id) return
    setActionBusy(app.id)
    setError('')
    setSuccessMsg('')

    const nowIso = new Date().toISOString()
    const email = app.email.toLowerCase().trim()

    // 1. Mark the application approved.
    const { error: updErr } = await supabase
      .from('talent_applications')
      .update({
        status: 'approved',
        reviewed_by: user.id,
        reviewed_at: nowIso,
      })
      .eq('id', app.id)

    if (updErr) {
      setError(updErr.message)
      setActionBusy(null)
      return
    }

    // 2. Upsert into talent_invites so the email is pre-approved.
    const { error: invErr } = await supabase
      .from('talent_invites')
      .upsert(
        {
          email,
          application_id: app.id,
          invited_by: user.id,
          invited_at: nowIso,
        },
        { onConflict: 'email' }
      )

    if (invErr) {
      setError(invErr.message)
      setActionBusy(null)
      return
    }

    // 3. Refresh state: drop from pending, add to invites list.
    setApplications((as) => as.filter((a) => a.id !== app.id))
    setInvites((inv) => {
      const next = inv.filter((i) => i.email.toLowerCase() !== email)
      next.unshift({
        id: `tmp-${app.id}`,
        email,
        application_id: app.id,
        invited_at: nowIso,
        signed_up_at: null,
        profile_id: null,
      })
      return next
    })
    setSuccessMsg(
      `Invite ready for ${email}. Remember to send the invite email to ${email}.`
    )
    setActionBusy(null)
  }

  async function rejectApplication(app: ApplicationRow) {
    if (actionBusy || !user?.id) return
    setActionBusy(app.id)
    setError('')
    setSuccessMsg('')

    const { error: updErr } = await supabase
      .from('talent_applications')
      .update({
        status: 'rejected',
        reviewed_by: user.id,
        reviewed_at: new Date().toISOString(),
        admin_notes: rejectNotes.trim() || null,
      })
      .eq('id', app.id)

    if (updErr) {
      setError(updErr.message)
      setActionBusy(null)
      return
    }

    setApplications((as) => as.filter((a) => a.id !== app.id))
    setRejectingId(null)
    setRejectNotes('')
    setActionBusy(null)
  }

  async function addInviteForEmail(rawEmail: string): Promise<boolean> {
    if (!user?.id) return false
    const email = rawEmail.toLowerCase().trim()
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError('Please enter a valid email address.')
      return false
    }
    const nowIso = new Date().toISOString()
    const { error: invErr } = await supabase
      .from('talent_invites')
      .upsert(
        { email, invited_by: user.id, invited_at: nowIso },
        { onConflict: 'email' }
      )
    if (invErr) {
      setError(invErr.message)
      return false
    }
    setInvites((inv) => {
      const next = inv.filter((i) => i.email.toLowerCase() !== email)
      next.unshift({
        id: `tmp-${email}`,
        email,
        application_id: null,
        invited_at: nowIso,
        signed_up_at: null,
        profile_id: null,
      })
      return next
    })
    setSuccessMsg(`Invite added for ${email}. Remember to send the invite email.`)
    return true
  }

  async function handleManualInvite(e: React.FormEvent) {
    e.preventDefault()
    if (inviteBusy) return
    setInviteBusy(true)
    const ok = await addInviteForEmail(inviteEmail)
    setInviteBusy(false)
    if (ok) {
      setInviteEmail('')
      setShowInviteForm(false)
    }
  }

  const verifiedCount = rows.filter((r) => r.verified).length
  const sortedRows = useMemo(() => {
    return [...rows].sort((a, b) => {
      if (a.verified === b.verified) {
        // Unverified without invite = most urgent, surface first.
        const aHasInvite = a.email ? invitedEmails.has(a.email.toLowerCase()) : false
        const bHasInvite = b.email ? invitedEmails.has(b.email.toLowerCase()) : false
        if (a.verified === false && aHasInvite !== bHasInvite) {
          return aHasInvite ? 1 : -1
        }
        return (a.last_name ?? '').localeCompare(b.last_name ?? '')
      }
      return a.verified ? 1 : -1
    })
  }, [rows, invitedEmails])

  return (
    <PageShell>
      <h1 style={{ fontSize: 22, fontWeight: 600, marginBottom: 4 }}>Talent</h1>
      <p style={{ fontSize: 12, color: TEXT_MUTED, marginBottom: 16 }}>
        {loading
          ? 'Loading…'
          : `${rows.length} in roster · ${verifiedCount} verified · ${applications.length} pending application${applications.length === 1 ? '' : 's'}`}
      </p>

      {error && (
        <p
          style={{
            fontSize: 12,
            color: '#fca5a5',
            background: 'rgba(248,113,113,0.12)',
            border: '1px solid rgba(248,113,113,0.25)',
            borderRadius: 10,
            padding: '10px 12px',
            marginBottom: 10,
          }}
        >
          {error}
        </p>
      )}
      {successMsg && (
        <p
          style={{
            fontSize: 12,
            color: AVAILABLE_GREEN,
            background: 'rgba(74,222,128,0.12)',
            border: '1px solid rgba(74,222,128,0.3)',
            borderRadius: 10,
            padding: '10px 12px',
            marginBottom: 10,
          }}
        >
          {successMsg}
        </p>
      )}

      {/* ================ SECTION A — APPLICATIONS ================ */}
      {!loading && applications.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <div
            style={{
              background: 'rgba(212,149,10,0.15)',
              border: '1px solid rgba(212,149,10,0.35)',
              borderRadius: 12,
              padding: '12px 14px',
              color: AMBER,
              fontSize: 13,
              fontWeight: 600,
              marginBottom: 12,
            }}
          >
            ⚠ {applications.length} new application{applications.length === 1 ? '' : 's'} awaiting review
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {applications.map((app) => (
              <ApplicationCard
                key={app.id}
                app={app}
                busy={actionBusy === app.id}
                rejecting={rejectingId === app.id}
                rejectNotes={rejectNotes}
                onRejectNotesChange={setRejectNotes}
                onApprove={() => approveApplication(app)}
                onStartReject={() => {
                  setRejectingId(app.id)
                  setRejectNotes('')
                }}
                onCancelReject={() => {
                  setRejectingId(null)
                  setRejectNotes('')
                }}
                onConfirmReject={() => rejectApplication(app)}
              />
            ))}
          </div>
        </div>
      )}

      {/* ================ SECTION B — ROSTER ================ */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 10,
        }}
      >
        <p
          style={{
            fontSize: 10,
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            color: TEXT_MUTED,
          }}
        >
          Talent roster
        </p>
        <button
          type="button"
          onClick={() => {
            setShowInviteForm((v) => !v)
            setSuccessMsg('')
          }}
          style={{
            padding: '6px 10px',
            borderRadius: 999,
            background: showInviteForm ? 'rgba(255,255,255,0.08)' : '#fff',
            color: showInviteForm ? TEXT_MUTED : BUTTON_NAVY,
            border: showInviteForm
              ? '1px solid rgba(170,189,224,0.25)'
              : 'none',
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: '0.04em',
            cursor: 'pointer',
          }}
        >
          {showInviteForm ? 'Cancel' : '+ Invite someone'}
        </button>
      </div>

      {showInviteForm && (
        <form
          onSubmit={handleManualInvite}
          style={{
            display: 'flex',
            gap: 8,
            background: CARD_BG,
            border: `1px solid ${CARD_BORDER}`,
            borderRadius: 12,
            padding: 10,
            marginBottom: 12,
          }}
        >
          <input
            type="email"
            required
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
            placeholder="email@example.com"
            className="rs-input"
            style={{ flex: 1 }}
            disabled={inviteBusy}
          />
          <button
            type="submit"
            disabled={inviteBusy || !inviteEmail}
            style={{
              padding: '10px 14px',
              borderRadius: 10,
              background: '#fff',
              color: BUTTON_NAVY,
              border: 'none',
              fontSize: 11,
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              cursor: inviteBusy ? 'wait' : 'pointer',
              opacity: inviteBusy || !inviteEmail ? 0.6 : 1,
              whiteSpace: 'nowrap',
            }}
          >
            {inviteBusy ? 'Adding…' : 'Add to invite list'}
          </button>
        </form>
      )}

      {/* Invited, not yet signed up */}
      {awaitingSignup.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          <p
            style={{
              fontSize: 10,
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              color: TEXT_MUTED,
              marginBottom: 6,
            }}
          >
            Invited — awaiting signup ({awaitingSignup.length})
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {awaitingSignup.map((inv) => (
              <div
                key={inv.id}
                style={{
                  background: CARD_BG,
                  border: `1px solid ${CARD_BORDER}`,
                  borderRadius: 12,
                  padding: '10px 12px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p
                    style={{
                      fontSize: 13,
                      fontWeight: 600,
                      color: TEXT_PRIMARY,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {inv.email}
                  </p>
                  <p style={{ fontSize: 11, color: TEXT_MUTED, marginTop: 2 }}>
                    Invited {formatDate(inv.invited_at)}
                  </p>
                </div>
                <span
                  style={{
                    padding: '4px 10px',
                    borderRadius: 999,
                    fontSize: 10,
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                    background: 'rgba(212,149,10,0.18)',
                    color: AMBER,
                    border: '1px solid rgba(212,149,10,0.35)',
                    whiteSpace: 'nowrap',
                    flexShrink: 0,
                  }}
                >
                  Awaiting signup
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Roster profiles */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {sortedRows.map((row) => {
          const tp = unwrap(row.talent_profiles)
          const dept = tp?.department ? DEPARTMENT_LABELS[tp.department] : null
          const name = fullName(row)
          const emailLower = row.email?.toLowerCase() ?? ''
          const hasInvite = emailLower ? invitedEmails.has(emailLower) : false
          const unapprovedNoInvite = !row.verified && !hasInvite

          return (
            <div
              key={row.id}
              style={{
                background: CARD_BG,
                border: unapprovedNoInvite
                  ? `1px solid rgba(239,68,68,0.35)`
                  : `1px solid ${CARD_BORDER}`,
                borderRadius: 12,
                padding: '10px 12px',
                display: 'flex',
                alignItems: 'center',
                gap: 12,
              }}
            >
              <Link
                href={`/app/talent/${row.id}`}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  flex: 1,
                  minWidth: 0,
                  color: TEXT_PRIMARY,
                  textDecoration: 'none',
                }}
              >
                <Avatar url={row.avatar_url} name={name} size={40} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p
                    style={{
                      fontSize: 13,
                      fontWeight: 600,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {name}
                  </p>
                  <p
                    style={{
                      fontSize: 11,
                      color: TEXT_MUTED,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {[dept, row.city].filter(Boolean).join(' · ') || 'No department'}
                  </p>
                </div>
              </Link>

              {unapprovedNoInvite && (
                <button
                  type="button"
                  onClick={async () => {
                    if (!row.email) return
                    await addInviteForEmail(row.email)
                    await load()
                  }}
                  title="Add to invite list"
                  style={{
                    padding: '5px 10px',
                    borderRadius: 999,
                    border: '1px solid rgba(239,68,68,0.45)',
                    background: 'rgba(239,68,68,0.15)',
                    color: RED,
                    fontSize: 10,
                    fontWeight: 700,
                    letterSpacing: '0.06em',
                    textTransform: 'uppercase',
                    cursor: 'pointer',
                    flexShrink: 0,
                    whiteSpace: 'nowrap',
                  }}
                >
                  No invite · Add
                </button>
              )}

              {!unapprovedNoInvite && (
                <span
                  aria-hidden
                  title={row.available ? 'Available' : 'Unavailable'}
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: 999,
                    background: row.available
                      ? AVAILABLE_GREEN
                      : 'rgba(170,189,224,0.4)',
                    flexShrink: 0,
                  }}
                />
              )}

              {row.verified ? (
                <button
                  type="button"
                  onClick={() => toggleVerified(row)}
                  disabled={toggling === row.id}
                  aria-label="Unverify"
                  style={{
                    width: 30,
                    height: 30,
                    borderRadius: 999,
                    border: 'none',
                    background: 'rgba(74,222,128,0.2)',
                    color: AVAILABLE_GREEN,
                    cursor: toggling === row.id ? 'wait' : 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                    transition: 'background 120ms ease',
                  }}
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <polyline points="4 12 10 18 20 6" />
                  </svg>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => toggleVerified(row)}
                  disabled={toggling === row.id}
                  aria-label="Approve talent"
                  style={{
                    padding: '5px 10px',
                    borderRadius: 999,
                    border: '1px solid rgba(212,149,10,0.45)',
                    background: 'rgba(212,149,10,0.18)',
                    color: AMBER,
                    fontSize: 10,
                    fontWeight: 700,
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                    cursor: toggling === row.id ? 'wait' : 'pointer',
                    flexShrink: 0,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {toggling === row.id ? 'Saving…' : 'Pending'}
                </button>
              )}
            </div>
          )
        })}
      </div>
    </PageShell>
  )
}

function ApplicationCard({
  app,
  busy,
  rejecting,
  rejectNotes,
  onRejectNotesChange,
  onApprove,
  onStartReject,
  onCancelReject,
  onConfirmReject,
}: {
  app: ApplicationRow
  busy: boolean
  rejecting: boolean
  rejectNotes: string
  onRejectNotesChange: (v: string) => void
  onApprove: () => void
  onStartReject: () => void
  onCancelReject: () => void
  onConfirmReject: () => void
}) {
  const name = appFullName(app)
  const dept = app.department
    ? DEPARTMENT_LABELS[app.department as Department] ?? app.department
    : null

  return (
    <article
      style={{
        background: CARD_BG,
        border: `1px solid ${CARD_BORDER}`,
        borderRadius: 14,
        padding: 14,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: 10,
          justifyContent: 'space-between',
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, color: TEXT_PRIMARY }}>
            {name}
          </h3>
          <p style={{ fontSize: 11, color: TEXT_MUTED, marginTop: 2 }}>
            {app.email}
            {dept && ` · ${dept}`}
            {app.created_at && ` · applied ${formatDate(app.created_at)}`}
          </p>
        </div>
        <span
          style={{
            padding: '4px 10px',
            borderRadius: 999,
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            background: 'rgba(212,149,10,0.18)',
            color: AMBER,
            border: '1px solid rgba(212,149,10,0.35)',
            whiteSpace: 'nowrap',
            flexShrink: 0,
          }}
        >
          New
        </span>
      </div>

      <div
        style={{
          marginTop: 10,
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
          fontSize: 12,
          color: TEXT_PRIMARY,
        }}
      >
        {app.phone && (
          <p>
            <span style={{ color: TEXT_MUTED }}>Phone: </span>
            {app.phone}
          </p>
        )}
        {(app.instagram || app.website) && (
          <p style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {app.instagram && (
              <a
                href={
                  app.instagram.startsWith('http')
                    ? app.instagram
                    : `https://instagram.com/${app.instagram.replace(/^@/, '')}`
                }
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: '#AABDE0', textDecoration: 'underline' }}
              >
                Instagram ↗
              </a>
            )}
            {app.website && (
              <a
                href={app.website.startsWith('http') ? app.website : `https://${app.website}`}
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: '#AABDE0', textDecoration: 'underline' }}
              >
                Website ↗
              </a>
            )}
          </p>
        )}
        {app.message && (
          <p
            style={{
              marginTop: 6,
              paddingTop: 8,
              borderTop: `1px solid ${SOFT_BORDER}`,
              fontSize: 12,
              lineHeight: 1.5,
              whiteSpace: 'pre-wrap',
            }}
          >
            {app.message}
          </p>
        )}
        <p style={{ color: TEXT_MUTED, fontSize: 11, marginTop: 6 }}>
          {app.terms_agreed ? '✓ Agreed to terms' : '⚠ Terms not agreed'}
        </p>
      </div>

      {!rejecting ? (
        <div
          style={{
            display: 'flex',
            gap: 8,
            marginTop: 12,
            paddingTop: 12,
            borderTop: `1px solid ${SOFT_BORDER}`,
          }}
        >
          <button
            type="button"
            onClick={onStartReject}
            disabled={busy}
            style={{
              flex: 1,
              padding: '10px 0',
              borderRadius: 10,
              background: 'rgba(255,255,255,0.08)',
              color: TEXT_MUTED,
              border: '1px solid rgba(170,189,224,0.2)',
              fontSize: 12,
              fontWeight: 500,
              cursor: busy ? 'wait' : 'pointer',
            }}
          >
            Reject
          </button>
          <button
            type="button"
            onClick={onApprove}
            disabled={busy}
            style={{
              flex: 2,
              padding: '10px 0',
              borderRadius: 10,
              background: '#fff',
              color: BUTTON_NAVY,
              border: 'none',
              fontSize: 12,
              fontWeight: 700,
              cursor: busy ? 'wait' : 'pointer',
              opacity: busy ? 0.7 : 1,
            }}
          >
            {busy ? 'Approving…' : 'Approve & send invite'}
          </button>
        </div>
      ) : (
        <div
          style={{
            marginTop: 12,
            paddingTop: 12,
            borderTop: `1px solid ${SOFT_BORDER}`,
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
          }}
        >
          <label>
            <span
              style={{
                fontSize: 10,
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                color: TEXT_MUTED,
              }}
            >
              Reason (optional)
            </span>
            <textarea
              value={rejectNotes}
              onChange={(e) => onRejectNotesChange(e.target.value)}
              rows={2}
              className="rs-input resize-none"
              style={{ marginTop: 4 }}
              placeholder="Why are you rejecting this application?"
            />
          </label>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              onClick={onCancelReject}
              disabled={busy}
              style={{
                flex: 1,
                padding: '10px 0',
                borderRadius: 10,
                background: 'rgba(255,255,255,0.08)',
                color: TEXT_MUTED,
                border: '1px solid rgba(170,189,224,0.2)',
                fontSize: 12,
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onConfirmReject}
              disabled={busy}
              style={{
                flex: 1,
                padding: '10px 0',
                borderRadius: 10,
                background: '#b91c1c',
                color: '#fff',
                border: 'none',
                fontSize: 12,
                fontWeight: 600,
                cursor: busy ? 'wait' : 'pointer',
                opacity: busy ? 0.7 : 1,
              }}
            >
              {busy ? 'Rejecting…' : 'Confirm reject'}
            </button>
          </div>
        </div>
      )}
    </article>
  )
}

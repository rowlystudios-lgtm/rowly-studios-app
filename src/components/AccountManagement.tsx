'use client'

import { useState, useTransition } from 'react'
import {
  pauseAccount,
  resumeAccount,
  deleteAccount,
} from '@/app/actions/admin-account'

type AccountType = 'talent' | 'client'
type AccountStatus = 'active' | 'paused' | 'deleted'

/**
 * Admin-facing section for pause/resume/delete of an account. Rendered
 * at the bottom of the talent or client detail page.
 */
export function AccountManagementSection({
  accountId,
  accountType,
  status,
  displayName,
}: {
  accountId: string
  accountType: AccountType
  status: AccountStatus
  displayName: string
}) {
  const [pending, startTransition] = useTransition()
  const [pauseReason, setPauseReason] = useState('')
  const [deleteReason, setDeleteReason] = useState('')
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  if (status === 'deleted') {
    return (
      <section
        className="mt-6 rounded-xl border border-red-500/30 bg-red-950/30"
        style={{ padding: 16 }}
      >
        <h2 className="text-red-300" style={{ fontSize: 14, fontWeight: 700 }}>
          Account deleted
        </h2>
        <p className="mt-1" style={{ fontSize: 13, color: '#FCA5A5' }}>
          This account has been deleted and the user is banned from signing in.
          The audit row lives in the deleted_accounts table.
        </p>
      </section>
    )
  }

  function doPause() {
    setError(null)
    setNotice(null)
    startTransition(async () => {
      const r = await pauseAccount({ accountId, reason: pauseReason || null })
      if (r.error) setError(r.error)
      else setNotice('Account paused.')
    })
  }

  function doResume() {
    setError(null)
    setNotice(null)
    startTransition(async () => {
      const r = await resumeAccount({ accountId })
      if (r.error) setError(r.error)
      else setNotice('Account resumed.')
    })
  }

  function doDelete() {
    setError(null)
    setNotice(null)
    if (!deleteReason.trim()) {
      setError('Enter a reason before deleting.')
      return
    }
    if (!confirmingDelete) {
      setConfirmingDelete(true)
      setTimeout(() => setConfirmingDelete(false), 4000)
      return
    }
    startTransition(async () => {
      const r = await deleteAccount({ accountId, reason: deleteReason.trim() })
      if (r.error) {
        setError(r.error)
        return
      }
      setConfirmingDelete(false)
      setNotice(
        r.driveSynced
          ? 'Account deleted. Drive audit synced.'
          : 'Account deleted. Drive audit skipped (sheet not configured).'
      )
    })
  }

  return (
    <section
      className="mt-6 rounded-xl border border-white/10 bg-[#1A2E4A]"
      style={{ padding: 16 }}
    >
      <h2 className="text-white" style={{ fontSize: 14, fontWeight: 700 }}>
        Account management
      </h2>
      <p className="mt-1" style={{ fontSize: 12, color: '#7A90AA' }}>
        {displayName} · {accountType} · currently {status}
      </p>

      {/* Pause / resume */}
      <div className="mt-4">
        {status === 'paused' ? (
          <div>
            <p style={{ fontSize: 13, color: '#F0A500', marginBottom: 8 }}>
              Account is paused. Resuming restores normal access.
            </p>
            <button
              type="button"
              onClick={doResume}
              disabled={pending}
              className="rounded-lg bg-[#1E3A6B] hover:bg-[#253D8A] text-white transition-colors"
              style={{
                padding: '10px 14px',
                fontSize: 12,
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
                minHeight: 40,
              }}
            >
              {pending ? '…' : 'Resume account'}
            </button>
          </div>
        ) : (
          <div>
            <label
              className="block"
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: '#AABDE0',
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
              }}
            >
              Pause reason (optional)
            </label>
            <input
              type="text"
              value={pauseReason}
              onChange={(e) => setPauseReason(e.target.value)}
              placeholder="Shared with the user in a notification"
              className="mt-1 w-full rounded-lg bg-[#0F1B2E] border border-white/10 text-white"
              style={{
                padding: '10px 12px',
                fontSize: 13,
                outline: 'none',
              }}
            />
            <button
              type="button"
              onClick={doPause}
              disabled={pending}
              className="mt-2 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 transition-colors border border-amber-500/40"
              style={{
                padding: '10px 14px',
                fontSize: 12,
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
                minHeight: 40,
              }}
            >
              {pending ? '…' : 'Pause account'}
            </button>
          </div>
        )}
      </div>

      {/* Delete — destructive, below a divider */}
      <div
        className="mt-5 pt-4"
        style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }}
      >
        <p
          style={{
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: '0.08em',
            color: '#F87171',
            textTransform: 'uppercase',
          }}
        >
          Danger zone
        </p>
        <p className="mt-1" style={{ fontSize: 12, color: '#AABDE0' }}>
          Deletion bans sign-in for 10 years, archives to deleted_accounts,
          and appends to the RS-Deleted-Accounts sheet in Drive.
        </p>
        <label
          className="block mt-3"
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: '#AABDE0',
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
          }}
        >
          Deletion reason <span style={{ color: '#F87171' }}>*</span>
        </label>
        <input
          type="text"
          value={deleteReason}
          onChange={(e) => {
            setDeleteReason(e.target.value)
            setConfirmingDelete(false)
          }}
          placeholder="Required — stored on the audit row"
          className="mt-1 w-full rounded-lg bg-[#0F1B2E] border border-white/10 text-white"
          style={{
            padding: '10px 12px',
            fontSize: 13,
            outline: 'none',
          }}
        />
        <button
          type="button"
          onClick={doDelete}
          disabled={pending}
          className="mt-2 rounded-lg transition-colors"
          style={{
            padding: '10px 14px',
            fontSize: 12,
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
            background: confirmingDelete
              ? 'rgba(239,68,68,0.45)'
              : 'rgba(239,68,68,0.15)',
            color: '#F87171',
            border: '1px solid rgba(239,68,68,0.45)',
            minHeight: 40,
          }}
        >
          {pending
            ? '…'
            : confirmingDelete
              ? 'Tap again to confirm delete'
              : 'Delete account'}
        </button>
      </div>

      {error && (
        <p
          role="alert"
          className="mt-3"
          style={{ fontSize: 12, color: '#F87171' }}
        >
          {error}
        </p>
      )}
      {notice && (
        <p
          className="mt-3"
          style={{ fontSize: 12, color: '#86EFAC' }}
        >
          {notice}
        </p>
      )}
    </section>
  )
}

/**
 * Full-screen replacement shown in the talent-facing app when
 * profiles.account_status === 'paused'. Rendered INSTEAD of the regular
 * layout children.
 */
export function PausedAccountScreen({
  displayName,
  reason,
  supportEmail = 'support@rowlystudios.com',
}: {
  displayName?: string | null
  reason?: string | null
  supportEmail?: string
}) {
  return (
    <main
      className="min-h-[100dvh] w-full flex items-center justify-center"
      style={{ background: 'var(--rs-blue-fusion)', padding: 20 }}
    >
      <div
        className="w-full rounded-2xl bg-white"
        style={{ maxWidth: 420, padding: 28 }}
      >
        <div
          className="inline-flex items-center justify-center rounded-full"
          style={{
            width: 44,
            height: 44,
            background: 'rgba(240,165,0,0.15)',
            color: '#B45309',
            fontSize: 22,
          }}
          aria-hidden
        >
          ⏸
        </div>
        <h1
          className="mt-3"
          style={{ fontSize: 20, fontWeight: 700, color: 'var(--rs-blue-logo)' }}
        >
          Your account is paused
        </h1>
        <p
          className="mt-2"
          style={{ fontSize: 14, color: 'var(--rs-blue-fusion)', lineHeight: 1.5 }}
        >
          {displayName ? `Hi ${displayName.split(' ')[0]} — ` : ''}
          an admin has temporarily paused your account. You can't book jobs or
          manage offers until it's resumed.
        </p>
        {reason && (
          <div
            className="mt-3 rounded-lg"
            style={{
              background: 'rgba(240,165,0,0.08)',
              border: '1px solid rgba(240,165,0,0.25)',
              padding: 12,
            }}
          >
            <p
              style={{
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                color: '#B45309',
              }}
            >
              Reason
            </p>
            <p style={{ fontSize: 13, color: '#1a1a1a', marginTop: 4 }}>
              {reason}
            </p>
          </div>
        )}
        <p
          className="mt-4"
          style={{ fontSize: 13, color: 'var(--rs-blue-fusion)' }}
        >
          Questions? Email{' '}
          <a
            href={`mailto:${supportEmail}`}
            style={{ color: 'var(--rs-blue-logo)', fontWeight: 600 }}
          >
            {supportEmail}
          </a>
          .
        </p>
        <form action="/auth/signout" method="post" className="mt-5">
          <button
            type="submit"
            className="w-full rounded-lg transition-colors"
            style={{
              padding: '12px 18px',
              fontSize: 13,
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              background: 'var(--rs-blue-logo)',
              color: 'var(--rs-cream)',
              minHeight: 44,
            }}
          >
            Sign out
          </button>
        </form>
      </div>
    </main>
  )
}

/**
 * Banner shown at the top of the client app when client_profiles.account_restricted
 * is true (typically set by the unrestrict-on-payment trigger's opposite: an
 * overdue-invoice trigger). The surrounding UI is expected to disable
 * "Request a job" / "Post job" CTAs while this banner is visible.
 */
export function ClientRestrictedBanner({
  reason,
  restrictedAt,
  supportEmail = 'support@rowlystudios.com',
}: {
  reason?: string | null
  restrictedAt?: string | null
  supportEmail?: string
}) {
  const shortDate = restrictedAt
    ? new Date(restrictedAt).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
      })
    : null
  return (
    <div
      role="alert"
      className="rounded-xl"
      style={{
        background: 'rgba(239,68,68,0.12)',
        border: '1px solid rgba(239,68,68,0.35)',
        padding: 14,
        marginBottom: 16,
      }}
    >
      <div className="flex items-start gap-3">
        <span
          aria-hidden
          style={{ fontSize: 18, lineHeight: 1, flexShrink: 0 }}
        >
          ⚠️
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p
            style={{
              fontSize: 13,
              fontWeight: 700,
              color: '#B91C1C',
            }}
          >
            Account restricted
            {shortDate ? ` · since ${shortDate}` : ''}
          </p>
          <p
            style={{
              fontSize: 12,
              color: '#7F1D1D',
              marginTop: 4,
              lineHeight: 1.5,
            }}
          >
            {reason ||
              'New job requests are disabled until your outstanding invoices are settled.'}{' '}
            Reach{' '}
            <a
              href={`mailto:${supportEmail}`}
              style={{ color: '#991B1B', fontWeight: 600 }}
            >
              {supportEmail}
            </a>{' '}
            once payment is through.
          </p>
        </div>
      </div>
    </div>
  )
}

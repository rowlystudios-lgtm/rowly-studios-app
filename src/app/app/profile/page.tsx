'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useAuth } from '@/lib/auth-context'
import { Avatar } from '@/components/Avatar'
import { PasswordInput } from '@/components/PasswordInput'
import { DEPARTMENT_LABELS, type Department } from '@/lib/types'

const BG = '#0a0a0a'
const CARD_BG = '#141414'
const CARD_BORDER = '#222222'
const TEXT_PRIMARY = '#ffffff'
const TEXT_MUTED = '#888888'
const NAVY = '#1A3C6B'
const ACCENT = '#2E5099'

function formatRate(cents: number | null | undefined): string {
  if (!cents) return '—'
  return `$${(cents / 100).toLocaleString()}`
}

function fullName(
  profile: { first_name?: string | null; last_name?: string | null; full_name?: string | null } | null
): string {
  if (!profile) return 'Your name'
  const joined = [profile.first_name?.trim(), profile.last_name?.trim()]
    .filter(Boolean)
    .join(' ')
  return joined || profile.full_name || 'Your name'
}

function Spinner({ size = 14, color = TEXT_PRIMARY }: { size?: number; color?: string }) {
  return (
    <svg
      className="animate-spin"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
    >
      <circle cx="12" cy="12" r="9" stroke={color} strokeOpacity="0.25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke={color} strokeWidth="3" strokeLinecap="round" />
    </svg>
  )
}

function PlayIcon({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M8 5.5v13a1 1 0 0 0 1.5.87l11-6.5a1 1 0 0 0 0-1.74l-11-6.5A1 1 0 0 0 8 5.5z" />
    </svg>
  )
}

export default function ProfilePage() {
  const { profile, user, supabase, updateProfile } = useAuth()
  const talent = profile?.talent_profiles?.[0] ?? null

  const displayName = fullName(profile)
  const department = talent?.department
    ? DEPARTMENT_LABELS[talent.department as Department]
    : null
  const subHeader = [department, profile?.city].filter(Boolean).join(' · ')

  return (
    <main
      className="rounded-t-rs-lg"
      style={{
        background: BG,
        color: TEXT_PRIMARY,
        minHeight: 'calc(100dvh - 64px)',
      }}
    >
      <div className="max-w-md mx-auto px-5 pt-6 pb-10">
        <div className="flex justify-end mb-4">
          <Link
            href="/app/profile/edit"
            className="text-[11px] uppercase tracking-wider underline"
            style={{ color: TEXT_MUTED }}
          >
            Edit profile
          </Link>
        </div>

        <div className="flex flex-col items-center text-center mb-8">
          <Avatar url={profile?.avatar_url ?? null} name={displayName} size={96} />
          <h1 className="text-[24px] font-bold mt-4 leading-tight" style={{ color: TEXT_PRIMARY }}>
            {displayName}
          </h1>
          {subHeader && (
            <p className="text-[13px] mt-1" style={{ color: TEXT_MUTED }}>
              {subHeader}
            </p>
          )}
          {profile?.verified && (
            <span
              className="inline-block mt-3 text-[10px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded-full"
              style={{ background: NAVY, color: '#ffffff' }}
            >
              ✓ Verified
            </span>
          )}
        </div>

        <Card>
          <div className="grid grid-cols-2" style={{ gap: 0 }}>
            <div className="pr-4">
              <p
                className="text-[10px] uppercase tracking-wider font-semibold mb-1"
                style={{ color: TEXT_MUTED }}
              >
                Day rate
              </p>
              <p className="text-[22px] font-bold" style={{ color: TEXT_PRIMARY }}>
                {formatRate(talent?.day_rate_cents)}
              </p>
            </div>
            <div
              className="pl-4"
              style={{ borderLeft: `1px solid ${CARD_BORDER}` }}
            >
              <p
                className="text-[10px] uppercase tracking-wider font-semibold mb-1"
                style={{ color: TEXT_MUTED }}
              >
                Rate floor
              </p>
              <p className="text-[22px] font-bold" style={{ color: TEXT_PRIMARY }}>
                {formatRate(talent?.rate_floor_cents)}
              </p>
            </div>
          </div>
        </Card>

        <SectionHeader>Availability</SectionHeader>
        <AvailabilitySection
          userId={user?.id ?? null}
          available={profile?.available ?? true}
          supabase={supabase}
          onChange={(val) => updateProfile({ available: val })}
        />

        <SectionHeader>Showreel</SectionHeader>
        {talent?.showreel_url ? (
          <a
            href={talent.showreel_url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 rounded-[14px] p-4 mb-6 transition-opacity hover:opacity-90"
            style={{ background: NAVY, color: '#ffffff' }}
          >
            <span
              className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
              style={{ background: 'rgba(255,255,255,0.15)' }}
            >
              <PlayIcon className="w-3.5 h-3.5" />
            </span>
            <span className="flex-1 text-[13px] font-semibold uppercase tracking-wider">
              View showreel
            </span>
            <span className="text-[16px]" aria-hidden>
              →
            </span>
          </a>
        ) : (
          <Card className="mb-6">
            <p className="text-[13px]" style={{ color: TEXT_MUTED }}>
              No showreel added yet
            </p>
            <Link
              href="/app/profile/edit"
              className="inline-block mt-1 text-[11px] uppercase tracking-wider underline"
              style={{ color: ACCENT }}
            >
              Add in Edit Profile →
            </Link>
          </Card>
        )}

        <SectionHeader>About</SectionHeader>
        <Card className="mb-6">
          {talent?.bio ? (
            <p
              className="text-[14px] leading-relaxed whitespace-pre-wrap"
              style={{ color: TEXT_PRIMARY }}
            >
              {talent.bio}
            </p>
          ) : (
            <p className="text-[13px]" style={{ color: TEXT_MUTED }}>
              No bio added yet
            </p>
          )}
        </Card>

        <div style={{ borderTop: `1px solid ${CARD_BORDER}` }} className="mt-10 pt-6">
          <SectionHeader>Account &amp; Security</SectionHeader>
          <ChangePasswordSection
            email={profile?.email ?? user?.email ?? null}
            supabase={supabase}
          />
        </div>
      </div>
    </main>
  )
}

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <p
      className="text-[10px] uppercase tracking-wider font-semibold mt-6 mb-2"
      style={{ color: TEXT_MUTED }}
    >
      {children}
    </p>
  )
}

function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={`rounded-[14px] p-4 ${className}`}
      style={{ background: CARD_BG, border: `1px solid ${CARD_BORDER}` }}
    >
      {children}
    </div>
  )
}

type AvailStatus = 'idle' | 'saving' | 'error'

function AvailabilitySection({
  userId,
  available,
  supabase,
  onChange,
}: {
  userId: string | null
  available: boolean
  supabase: ReturnType<typeof useAuth>['supabase']
  onChange: (val: boolean) => void
}) {
  const [status, setStatus] = useState<AvailStatus>('idle')
  const [errorMsg, setErrorMsg] = useState('')

  async function toggle() {
    if (!userId || status === 'saving') return
    const next = !available
    onChange(next)
    setStatus('saving')
    setErrorMsg('')
    const { error } = await supabase
      .from('profiles')
      .update({ available: next })
      .eq('id', userId)
    if (error) {
      onChange(!next)
      setStatus('error')
      setErrorMsg(error.message)
      return
    }
    setStatus('idle')
  }

  return (
    <Card className="mb-6">
      <div className="flex items-center gap-3">
        <span
          aria-hidden
          style={{
            width: 10,
            height: 10,
            borderRadius: 999,
            background: available ? '#2ecc71' : TEXT_MUTED,
            boxShadow: available ? '0 0 0 3px rgba(46,204,113,0.15)' : 'none',
            flexShrink: 0,
          }}
        />
        <div className="flex-1 min-w-0">
          <p className="text-[14px] font-semibold" style={{ color: TEXT_PRIMARY }}>
            {available ? 'Available' : 'Unavailable'}
          </p>
          <p className="text-[11px] mt-0.5" style={{ color: TEXT_MUTED }}>
            {available
              ? 'Clients can request you for new jobs.'
              : 'You won’t appear to clients browsing talent.'}
          </p>
        </div>
        <button
          type="button"
          onClick={toggle}
          disabled={status === 'saving' || !userId}
          role="switch"
          aria-checked={available}
          aria-label="Toggle availability"
          className="flex-shrink-0"
          style={{
            width: 44,
            height: 26,
            borderRadius: 999,
            background: available ? ACCENT : '#333',
            position: 'relative',
            transition: 'background 150ms ease',
            opacity: status === 'saving' ? 0.6 : 1,
            border: 'none',
            cursor: status === 'saving' ? 'wait' : 'pointer',
          }}
        >
          <span
            aria-hidden
            style={{
              position: 'absolute',
              top: 3,
              left: available ? 21 : 3,
              width: 20,
              height: 20,
              borderRadius: 999,
              background: '#ffffff',
              transition: 'left 150ms ease',
            }}
          />
        </button>
      </div>
      {status === 'error' && errorMsg && (
        <p className="text-[11px] mt-3 text-red-400">{errorMsg}</p>
      )}
    </Card>
  )
}

type ChangeStatus = 'idle' | 'open' | 'verifying' | 'updating' | 'done' | 'error'

function ChangePasswordSection({
  email,
  supabase,
}: {
  email: string | null
  supabase: ReturnType<typeof useAuth>['supabase']
}) {
  const [status, setStatus] = useState<ChangeStatus>('idle')
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [errorMsg, setErrorMsg] = useState('')

  function open() {
    setStatus('open')
    setErrorMsg('')
  }

  function cancel() {
    setStatus('idle')
    setCurrentPassword('')
    setNewPassword('')
    setConfirm('')
    setErrorMsg('')
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErrorMsg('')

    if (!email) {
      setStatus('error')
      setErrorMsg('Could not read your email. Refresh and try again.')
      return
    }
    if (newPassword.length < 8) {
      setStatus('error')
      setErrorMsg('New password must be at least 8 characters.')
      return
    }
    if (newPassword !== confirm) {
      setStatus('error')
      setErrorMsg('New password and confirmation do not match.')
      return
    }
    if (newPassword === currentPassword) {
      setStatus('error')
      setErrorMsg('New password must be different from the current one.')
      return
    }

    setStatus('verifying')
    const verify = await supabase.auth.signInWithPassword({
      email,
      password: currentPassword,
    })
    if (verify.error) {
      setStatus('error')
      setErrorMsg('Current password is incorrect.')
      return
    }

    setStatus('updating')
    const update = await supabase.auth.updateUser({ password: newPassword })
    if (update.error) {
      setStatus('error')
      setErrorMsg(update.error.message)
      return
    }

    setStatus('done')
    setCurrentPassword('')
    setNewPassword('')
    setConfirm('')
    setTimeout(() => setStatus('idle'), 2500)
  }

  if (status === 'idle' || status === 'done') {
    return (
      <Card>
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[13px] font-semibold" style={{ color: TEXT_PRIMARY }}>
              Password
            </p>
            <p className="text-[11px] mt-0.5" style={{ color: TEXT_MUTED }}>
              Keep your account secure. Change it any time.
            </p>
          </div>
          <button
            type="button"
            onClick={open}
            className="shrink-0 rounded-[10px] px-3 py-2 text-[11px] uppercase tracking-wider font-semibold"
            style={{ background: NAVY, color: '#ffffff' }}
          >
            Change password
          </button>
        </div>
        {status === 'done' && (
          <p className="text-[12px] mt-3" style={{ color: '#2ecc71' }}>
            Password updated successfully.
          </p>
        )}
      </Card>
    )
  }

  const busy = status === 'verifying' || status === 'updating'

  return (
    <form onSubmit={handleSubmit}>
      <Card>
        <p className="text-[13px] font-semibold mb-3" style={{ color: TEXT_PRIMARY }}>
          Change password
        </p>

        <div className="space-y-3">
          <div>
            <label className="block text-[11px] font-semibold mb-1.5" style={{ color: TEXT_MUTED }}>
              Current password
            </label>
            <PasswordInput
              required
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              autoComplete="current-password"
              disabled={busy}
            />
          </div>

          <div>
            <label className="block text-[11px] font-semibold mb-1.5" style={{ color: TEXT_MUTED }}>
              New password
            </label>
            <PasswordInput
              required
              minLength={8}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Min 8 characters"
              autoComplete="new-password"
              disabled={busy}
            />
          </div>

          <div>
            <label className="block text-[11px] font-semibold mb-1.5" style={{ color: TEXT_MUTED }}>
              Confirm new password
            </label>
            <PasswordInput
              required
              minLength={8}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="new-password"
              disabled={busy}
            />
          </div>

          {errorMsg && <p className="text-[12px] text-red-400 leading-relaxed">{errorMsg}</p>}

          <div className="flex items-center gap-3 pt-1">
            <button
              type="submit"
              disabled={busy || !currentPassword || !newPassword || !confirm}
              className="rounded-[10px] px-4 py-2 text-[11px] uppercase tracking-wider font-semibold disabled:opacity-50 flex items-center gap-2"
              style={{ background: NAVY, color: '#ffffff' }}
            >
              {busy && <Spinner />}
              {status === 'verifying' ? 'Verifying…' : status === 'updating' ? 'Updating…' : 'Update password'}
            </button>
            <button
              type="button"
              onClick={cancel}
              disabled={busy}
              className="text-[11px] uppercase tracking-wider underline disabled:opacity-50"
              style={{ color: ACCENT }}
            >
              Cancel
            </button>
          </div>
        </div>
      </Card>
    </form>
  )
}

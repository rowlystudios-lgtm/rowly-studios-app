'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useAuth } from '@/lib/auth-context'
import { Avatar } from '@/components/Avatar'
import { PasswordInput } from '@/components/PasswordInput'
import { DEPARTMENT_LABELS, type Department } from '@/lib/types'

function formatRate(cents: number | null | undefined): string | null {
  if (!cents) return null
  return `$${(cents / 100).toLocaleString()}`
}

function fullName(
  profile: { first_name?: string | null; last_name?: string | null; full_name?: string | null } | null
): string | null {
  if (!profile) return null
  const first = profile.first_name?.trim()
  const last = profile.last_name?.trim()
  const joined = [first, last].filter(Boolean).join(' ')
  return joined || profile.full_name || null
}

function Spinner() {
  return (
    <svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
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

function LinkIcon({ className = '' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="M10 14a5 5 0 0 0 7.07 0l3-3a5 5 0 0 0-7.07-7.07l-1.5 1.5" />
      <path d="M14 10a5 5 0 0 0-7.07 0l-3 3a5 5 0 0 0 7.07 7.07l1.5-1.5" />
    </svg>
  )
}

export default function ProfilePage() {
  const { profile, user, supabase } = useAuth()
  const talent = profile?.talent_profiles?.[0] ?? null

  const displayName = fullName(profile) ?? 'Your name'
  const dayRate = formatRate(talent?.day_rate_cents)
  const floor = formatRate(talent?.rate_floor_cents)

  return (
    <main className="px-5 py-6 max-w-md mx-auto">
      <div className="flex items-center gap-4 mb-5">
        <Avatar url={profile?.avatar_url ?? null} name={displayName} size={80} ring />
        <div className="flex-1 min-w-0">
          <h1 className="text-[22px] font-semibold text-rs-blue-logo leading-tight">
            {displayName}
          </h1>
          <p className="text-[12px] text-rs-blue-fusion font-medium mt-1">
            {talent?.primary_role || 'Add your role'}
            {talent?.department && ` · ${DEPARTMENT_LABELS[talent.department as Department]}`}
          </p>
          <p className="text-[11px] text-rs-blue-fusion/60 mt-1">
            {profile?.city ? `${profile.city} · ` : ''}
            {profile?.email}
          </p>
          {profile?.verified && (
            <span className="inline-block mt-2 text-[10px] uppercase tracking-wider font-semibold bg-rs-blue-fusion text-rs-cream px-2 py-0.5 rounded-full">
              ✓ Verified
            </span>
          )}
        </div>
      </div>

      <Link href="/app/profile/edit" className="rs-btn w-full text-center block mb-6">
        Edit profile
      </Link>

      <p className="text-[10px] uppercase tracking-wider text-rs-blue-fusion/60 font-semibold mb-2">
        Bio
      </p>
      <div className="bg-white rounded-rs p-4 border border-rs-blue-fusion/10 mb-5">
        <p className="text-[13px] text-rs-blue-fusion leading-relaxed">
          {talent?.bio || (
            <span className="text-rs-blue-fusion/40 italic">
              Tell clients a bit about yourself — your background, style, what sets you apart.
            </span>
          )}
        </p>
      </div>

      <p className="text-[10px] uppercase tracking-wider text-rs-blue-fusion/60 font-semibold mb-2">
        Rates
      </p>
      <div className="bg-white rounded-rs p-4 border border-rs-blue-fusion/10 mb-5 space-y-2">
        <div className="flex justify-between text-[13px]">
          <span className="text-rs-blue-fusion/70 font-medium">Day rate</span>
          <span className="font-bold text-rs-blue-logo">
            {dayRate ? `${dayRate} / day` : '—'}
          </span>
        </div>
        <div className="flex justify-between text-[12px]">
          <span className="text-rs-blue-fusion/60 font-medium">Floor</span>
          <span className="font-semibold text-rs-blue-fusion">
            {floor ? `${floor} / day` : '—'}
          </span>
        </div>
      </div>

      <p className="text-[10px] uppercase tracking-wider text-rs-blue-fusion/60 font-semibold mb-2">
        Showreel
      </p>
      {talent?.showreel_url ? (
        <a
          href={talent.showreel_url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-3 bg-rs-blue-logo rounded-rs p-4 text-rs-cream mb-5 hover:opacity-90 transition-opacity"
        >
          <span className="w-9 h-9 rounded-full bg-rs-cream/15 flex items-center justify-center flex-shrink-0">
            <PlayIcon className="w-3.5 h-3.5 text-rs-cream" />
          </span>
          <span className="flex-1 text-[13px] font-semibold uppercase tracking-wider">
            View showreel
          </span>
          <span className="text-[16px]" aria-hidden>
            →
          </span>
        </a>
      ) : (
        <div className="flex items-center gap-3 bg-white rounded-rs p-4 border border-rs-blue-fusion/10 mb-5">
          <LinkIcon className="w-4 h-4 text-rs-blue-fusion/50 flex-shrink-0" />
          <span className="flex-1 text-[13px] text-rs-blue-fusion/60 italic">
            No showreel added yet
          </span>
        </div>
      )}

      {talent?.equipment && (
        <>
          <p className="text-[10px] uppercase tracking-wider text-rs-blue-fusion/60 font-semibold mb-2">
            Equipment
          </p>
          <div className="bg-white rounded-rs p-4 border border-rs-blue-fusion/10 mb-5">
            <p className="text-[13px] text-rs-blue-fusion leading-relaxed">{talent.equipment}</p>
          </div>
        </>
      )}

      <div className="border-t border-rs-blue-fusion/15 mt-8 pt-6">
        <p className="text-[10px] uppercase tracking-wider text-rs-blue-fusion/60 font-semibold mb-3">
          Account &amp; Security
        </p>
        <ChangePasswordSection email={profile?.email ?? user?.email ?? null} supabase={supabase} />
      </div>
    </main>
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
      setErrorMsg('Could not read your email from the profile. Refresh and try again.')
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
      <div className="bg-white rounded-rs p-4 border border-rs-blue-fusion/10">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[13px] font-semibold text-rs-blue-logo">Password</p>
            <p className="text-[11px] text-rs-blue-fusion/60 mt-0.5">
              Keep your account secure. Change it any time.
            </p>
          </div>
          <button
            type="button"
            onClick={open}
            className="shrink-0 rounded-[10px] px-3 py-2 text-[11px] uppercase tracking-wider font-semibold text-white"
            style={{ backgroundColor: '#1A3C6B' }}
          >
            Change password
          </button>
        </div>
        {status === 'done' && (
          <p className="text-[12px] mt-3" style={{ color: '#1A3C6B' }}>
            Password updated successfully.
          </p>
        )}
      </div>
    )
  }

  const busy = status === 'verifying' || status === 'updating'

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-rs p-4 border border-rs-blue-fusion/10 space-y-3">
      <p className="text-[13px] font-semibold text-rs-blue-logo">Change password</p>

      <div>
        <label className="block text-[11px] font-semibold text-rs-blue-fusion mb-1.5">
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
        <label className="block text-[11px] font-semibold text-rs-blue-fusion mb-1.5">
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
        <label className="block text-[11px] font-semibold text-rs-blue-fusion mb-1.5">
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

      {errorMsg && <p className="text-[12px] text-red-700 leading-relaxed">{errorMsg}</p>}

      <div className="flex items-center gap-3 pt-1">
        <button
          type="submit"
          disabled={busy || !currentPassword || !newPassword || !confirm}
          className="rounded-[10px] px-4 py-2 text-[11px] uppercase tracking-wider font-semibold text-white disabled:opacity-50 flex items-center gap-2"
          style={{ backgroundColor: '#1A3C6B' }}
        >
          {busy && <Spinner />}
          {status === 'verifying' ? 'Verifying…' : status === 'updating' ? 'Updating…' : 'Update password'}
        </button>
        <button
          type="button"
          onClick={cancel}
          disabled={busy}
          className="text-[11px] uppercase tracking-wider underline disabled:opacity-50"
          style={{ color: '#2E5099' }}
        >
          Cancel
        </button>
      </div>
    </form>
  )
}

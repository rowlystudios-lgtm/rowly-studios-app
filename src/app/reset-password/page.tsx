'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { RSLogo } from '@/components/RSLogo'
import { PasswordInput } from '@/components/PasswordInput'
import { createClient } from '@/lib/supabase-browser'

type Status =
  | 'checking'
  | 'idle'
  | 'submitting'
  | 'done'
  | 'expired'
  | 'error'

function Spinner() {
  return (
    <svg
      className="animate-spin"
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  )
}

export default function ResetPasswordPage() {
  const router = useRouter()
  const supabase = createClient()

  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [status, setStatus] = useState<Status>('checking')
  const [errorMsg, setErrorMsg] = useState('')

  useEffect(() => {
    let cancelled = false
    let resolved = false

    // Supabase fires PASSWORD_RECOVERY when the client parses a recovery
    // token from the URL hash (or exchanges a ?code= recovery link).
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (cancelled) return
      if (event === 'PASSWORD_RECOVERY' || (event === 'SIGNED_IN' && session)) {
        resolved = true
        setStatus('idle')
      }
    })

    // Fallback: if the user already has a session (e.g. signed in and
    // navigated here manually), let them change their password.
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (cancelled || resolved) return
      if (user) {
        resolved = true
        setStatus('idle')
      } else {
        // Give onAuthStateChange a moment to fire after URL parsing.
        setTimeout(() => {
          if (cancelled || resolved) return
          setStatus('expired')
        }, 1500)
      }
    })

    return () => {
      cancelled = true
      sub.subscription.unsubscribe()
    }
  }, [supabase])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErrorMsg('')

    if (password.length < 8) {
      setStatus('error')
      setErrorMsg('Password must be at least 8 characters.')
      return
    }
    if (password !== confirm) {
      setStatus('error')
      setErrorMsg('Passwords do not match.')
      return
    }

    setStatus('submitting')
    const { error } = await supabase.auth.updateUser({ password })

    if (error) {
      const msg = error.message.toLowerCase()
      if (msg.includes('session') || msg.includes('expired') || msg.includes('invalid')) {
        setStatus('expired')
      } else {
        setStatus('error')
        setErrorMsg(error.message)
      }
      return
    }

    setStatus('done')
    router.replace('/app?toast=password-updated')
    router.refresh()
  }

  return (
    <main className="min-h-[100dvh] flex flex-col items-center justify-center px-6 py-12 rs-bg-fusion">
      <Link href="/" className="flex flex-col items-center gap-4 mb-8">
        <RSLogo size={64} />
        <span className="text-xs tracking-[2px] text-rs-cream uppercase font-semibold">
          Rowly Studios
        </span>
      </Link>

      <div className="w-full max-w-sm rs-surface rounded-rs-lg p-6">
        {status === 'checking' && (
          <p className="text-[13px] text-center" style={{ color: '#2E5099' }}>
            Verifying link…
          </p>
        )}

        {status === 'expired' && (
          <div className="text-center space-y-3">
            <p className="text-sm font-semibold uppercase tracking-wide" style={{ color: '#1A3C6B' }}>
              Link expired
            </p>
            <p className="text-[13px] leading-relaxed" style={{ color: '#2E5099' }}>
              This reset link has expired. Please request a new one.
            </p>
            <Link
              href="/login"
              className="inline-block text-[11px] uppercase tracking-wider underline mt-4"
              style={{ color: '#2E5099' }}
            >
              Back to sign in
            </Link>
          </div>
        )}

        {status === 'done' && (
          <p className="text-[13px] text-center" style={{ color: '#1A3C6B' }}>
            Password updated. Redirecting…
          </p>
        )}

        {(status === 'idle' || status === 'submitting' || status === 'error') && (
          <form onSubmit={handleSubmit} className="space-y-3">
            <label className="block text-[11px] uppercase tracking-wider font-semibold" style={{ color: '#1A3C6B' }}>
              Set a new password
            </label>

            <PasswordInput
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="New password (min 8 characters)"
              disabled={status === 'submitting'}
              autoComplete="new-password"
            />

            <PasswordInput
              required
              minLength={8}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="Confirm new password"
              disabled={status === 'submitting'}
              autoComplete="new-password"
            />

            <button
              type="submit"
              disabled={status === 'submitting' || !password || !confirm}
              className="w-full rounded-[10px] py-3 text-[12px] uppercase tracking-wider font-semibold text-white disabled:opacity-50 flex items-center justify-center gap-2"
              style={{ backgroundColor: '#1A3C6B' }}
            >
              {status === 'submitting' && <Spinner />}
              {status === 'submitting' ? 'Updating…' : 'Update password'}
            </button>

            {status === 'error' && errorMsg && (
              <p className="text-[12px] text-red-700 pt-1 leading-relaxed">{errorMsg}</p>
            )}
          </form>
        )}
      </div>
    </main>
  )
}

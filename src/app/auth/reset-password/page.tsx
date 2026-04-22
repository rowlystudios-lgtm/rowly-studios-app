'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { RSLogo } from '@/components/RSLogo'
import { PasswordInput } from '@/components/PasswordInput'
import { createClient } from '@/lib/supabase-browser'

type Status = 'idle' | 'submitting' | 'error' | 'success'

const MIN_LENGTH = 8

function isStrongEnough(pw: string): boolean {
  if (pw.length < MIN_LENGTH) return false
  const hasLetter = /[a-zA-Z]/.test(pw)
  const hasNumber = /\d/.test(pw)
  return hasLetter && hasNumber
}

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-[100dvh] flex items-center justify-center rs-bg-fusion">
          <RSLogo size={48} />
        </main>
      }
    >
      <ResetPasswordInner />
    </Suspense>
  )
}

function ResetPasswordInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = createClient()

  const invited = searchParams.get('invited') === 'true'

  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [status, setStatus] = useState<Status>('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const [sessionChecked, setSessionChecked] = useState(false)
  const [hasSession, setHasSession] = useState(false)

  // The auth/callback route exchanged the recovery/invite code for a
  // session before landing here. If no session exists, the link was
  // stale or exchanged already — send the user back to /login.
  useEffect(() => {
    let cancelled = false
    async function check() {
      const {
        data: { session },
      } = await supabase.auth.getSession()
      if (cancelled) return
      setHasSession(!!session)
      setSessionChecked(true)
    }
    check()
    return () => {
      cancelled = true
    }
  }, [supabase])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErrorMsg('')

    if (!isStrongEnough(password)) {
      setStatus('error')
      setErrorMsg(
        'Use at least 8 characters with a mix of letters and numbers.'
      )
      return
    }
    if (password !== confirm) {
      setStatus('error')
      setErrorMsg('Passwords do not match.')
      return
    }

    setStatus('submitting')
    const { error: updateErr } = await supabase.auth.updateUser({
      password,
    })

    if (updateErr) {
      setStatus('error')
      setErrorMsg(updateErr.message)
      return
    }

    // Route based on role. If the session evaporated between submit and
    // role lookup, fall back to /app — middleware will gate accordingly.
    const {
      data: { user },
    } = await supabase.auth.getUser()

    let target = '/app'
    if (user) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .maybeSingle()
      if (profile?.role === 'admin') target = '/admin'
    }
    setStatus('success')
    router.push(target)
    router.refresh()
  }

  const title = invited
    ? 'Welcome — set your password'
    : 'Set your password'

  return (
    <main className="min-h-[100dvh] flex flex-col items-center px-6 py-12 rs-bg-fusion">
      <Link href="/" className="flex flex-col items-center gap-4 mb-8">
        <RSLogo size={64} />
        <span className="text-xs tracking-[2px] text-rs-cream uppercase font-semibold">
          Rowly Studios
        </span>
      </Link>

      <div className="w-full max-w-sm rs-surface rounded-rs-lg p-6">
        <h1
          className="text-[20px] font-bold"
          style={{ color: '#1A3C6B', lineHeight: 1.2, marginBottom: 6 }}
        >
          {title}
        </h1>
        <p
          className="text-[13px] leading-relaxed"
          style={{ color: '#2E5099', marginBottom: 18 }}
        >
          Choose a strong password for your account.
        </p>

        {!sessionChecked ? (
          <div
            style={{ textAlign: 'center', padding: '16px 0', color: '#2E5099' }}
          >
            <span className="text-[13px]">Loading…</span>
          </div>
        ) : !hasSession ? (
          <div className="space-y-3">
            <p className="text-[13px] leading-relaxed" style={{ color: '#8A1C1C' }}>
              Your reset link has expired or was already used. Request a new
              one from the sign-in page.
            </p>
            <Link
              href="/login"
              className="block w-full text-center rounded-[10px] py-3 text-[12px] uppercase tracking-wider font-semibold text-white"
              style={{ backgroundColor: '#1A3C6B' }}
            >
              Back to sign in
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3">
            <PasswordInput
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="New password"
              disabled={status === 'submitting'}
              autoComplete="new-password"
            />
            <PasswordInput
              required
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="Confirm new password"
              disabled={status === 'submitting'}
              autoComplete="new-password"
            />
            <p
              className="text-[11px]"
              style={{ color: '#2E5099', opacity: 0.75, lineHeight: 1.5 }}
            >
              At least 8 characters with a mix of letters and numbers.
            </p>

            <button
              type="submit"
              disabled={
                status === 'submitting' || !password || !confirm
              }
              className="w-full rounded-[10px] py-3 text-[12px] uppercase tracking-wider font-semibold text-white disabled:opacity-50"
              style={{ backgroundColor: '#1A3C6B' }}
            >
              {status === 'submitting' ? 'Saving…' : 'Set password'}
            </button>

            {status === 'error' && errorMsg && (
              <p
                className="text-[12px] leading-relaxed pt-1"
                style={{ color: '#8A1C1C' }}
              >
                {errorMsg}
              </p>
            )}
          </form>
        )}
      </div>

      <Link
        href="/login"
        className="text-[11px] uppercase tracking-wider text-rs-cream/60 mt-8"
      >
        ← Back to sign in
      </Link>
    </main>
  )
}

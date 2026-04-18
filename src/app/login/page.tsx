'use client'

import { Suspense, useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { RSLogo } from '@/components/RSLogo'
import { InstallBanner } from '@/components/InstallBanner'
import { createClient } from '@/lib/supabase-browser'

type Status = 'checking' | 'idle' | 'submitting' | 'reset-sending' | 'reset-sent' | 'error'

export default function LoginPage() {
  return (
    <Suspense fallback={
      <main className="min-h-[100dvh] flex items-center justify-center rs-bg-fusion">
        <RSLogo size={48} />
      </main>
    }>
      <LoginInner />
    </Suspense>
  )
}

function LoginInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = createClient()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [status, setStatus] = useState<Status>('checking')
  const [errorMsg, setErrorMsg] = useState('')
  const [showReset, setShowReset] = useState(false)

  useEffect(() => {
    async function check() {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        router.replace('/app')
      } else {
        setStatus('idle')
      }
    }
    check()
  }, [router, supabase])

  useEffect(() => {
    const err = searchParams.get('error')
    if (err === 'auth_failed') {
      setErrorMsg('That sign-in link was invalid or expired. Please sign in again.')
      setStatus('error')
    }
  }, [searchParams])

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault()
    setStatus('submitting')
    setErrorMsg('')

    const { error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      setStatus('error')
      const msg = error.message.toLowerCase()
      if (msg.includes('invalid') && msg.includes('credential')) {
        setErrorMsg('Incorrect email or password. Please try again.')
      } else if (msg.includes('email not confirmed')) {
        setErrorMsg('Please confirm your email first — check your inbox for the confirmation link.')
      } else {
        setErrorMsg(error.message)
      }
      return
    }

    router.replace('/app')
    router.refresh()
  }

  async function handleReset(e: React.FormEvent) {
    e.preventDefault()
    if (!email) {
      setErrorMsg('Enter your email above first, then click "Forgot password?"')
      setStatus('error')
      return
    }
    setStatus('reset-sending')
    setErrorMsg('')

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback?next=/auth/reset-password`,
    })

    if (error) {
      setStatus('error')
      setErrorMsg(error.message)
    } else {
      setStatus('reset-sent')
    }
  }

  if (status === 'checking') {
    return (
      <main className="min-h-[100dvh] flex items-center justify-center rs-bg-fusion">
        <RSLogo size={48} />
      </main>
    )
  }

  return (
    <>
      <InstallBanner />
      <main className="min-h-[100dvh] flex flex-col items-center justify-center px-6 py-12 rs-bg-fusion">
      <Link href="/" className="flex flex-col items-center gap-4 mb-8">
        <RSLogo size={64} />
        <span className="text-xs tracking-[2px] text-rs-cream uppercase font-semibold">
          Rowly Studios
        </span>
      </Link>

      <div className="w-full max-w-sm rs-surface rounded-rs-lg p-6">
        {status === 'reset-sent' ? (
          <div className="text-center space-y-3">
            <p className="text-sm font-semibold text-rs-blue-logo uppercase tracking-wide">
              Check your inbox
            </p>
            <p className="text-[13px] text-rs-blue-fusion leading-relaxed">
              We sent a password-reset link to <strong>{email}</strong>. Open it to set a new password.
            </p>
            <button
              onClick={() => {
                setStatus('idle')
                setShowReset(false)
              }}
              className="text-[11px] uppercase tracking-wider text-rs-blue-fusion/70 underline mt-4"
            >
              Back to sign in
            </button>
          </div>
        ) : (
          <form onSubmit={showReset ? handleReset : handleSignIn} className="space-y-3">
            <label className="block text-[11px] uppercase tracking-wider font-semibold text-rs-blue-fusion">
              {showReset ? 'Reset your password' : 'Sign in'}
            </label>

            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@email.com"
              className="w-full px-3 py-3 text-[14px] text-rs-ink bg-white rounded-[10px] border border-rs-blue-fusion/15 focus:border-rs-blue-logo focus:outline-none"
              disabled={status === 'submitting' || status === 'reset-sending'}
              autoComplete="email"
            />

            {!showReset && (
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password"
                className="w-full px-3 py-3 text-[14px] text-rs-ink bg-white rounded-[10px] border border-rs-blue-fusion/15 focus:border-rs-blue-logo focus:outline-none"
                disabled={status === 'submitting'}
                autoComplete="current-password"
              />
            )}

            <button
              type="submit"
              disabled={status === 'submitting' || status === 'reset-sending' || !email || (!showReset && !password)}
              className="rs-btn w-full disabled:opacity-50"
            >
              {showReset
                ? (status === 'reset-sending' ? 'Sending…' : 'Send reset link')
                : (status === 'submitting' ? 'Signing in…' : 'Sign in')}
            </button>

            {status === 'error' && errorMsg && (
              <p className="text-[11px] text-red-700 pt-1 leading-relaxed">{errorMsg}</p>
            )}

            <div className="flex items-center justify-between pt-3 text-[11px]">
              <button
                type="button"
                onClick={() => {
                  setShowReset((v) => !v)
                  setErrorMsg('')
                  setStatus('idle')
                }}
                className="uppercase tracking-wider text-rs-blue-fusion/70 underline"
              >
                {showReset ? 'Back to sign in' : 'Forgot password?'}
              </button>
              {!showReset && (
                <Link
                  href="/signup"
                  className="uppercase tracking-wider text-rs-blue-fusion/70 underline"
                >
                  Create account
                </Link>
              )}
            </div>
          </form>
        )}
      </div>

      <Link
        href="/"
        className="text-[11px] uppercase tracking-wider text-rs-cream/60 mt-8"
      >
        ← Back
      </Link>
      </main>
    </>
  )
}

'use client'

import { Suspense, useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { RSLogo } from '@/components/RSLogo'
import { InstallBanner } from '@/components/InstallBanner'
import { PasswordInput } from '@/components/PasswordInput'
import { createClient } from '@/lib/supabase-browser'

type Status = 'checking' | 'idle' | 'submitting' | 'reset-sending' | 'reset-sent' | 'error'
type AdminStatus = 'idle' | 'submitting' | 'error'

const RESET_REDIRECT = 'https://rowly-studios-app.vercel.app/reset-password'

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

function Spinner({ color = 'currentColor' }: { color?: string }) {
  return (
    <svg
      className="animate-spin"
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
    >
      <circle cx="12" cy="12" r="9" stroke={color} strokeOpacity="0.25" strokeWidth="3" />
      <path
        d="M21 12a9 9 0 0 0-9-9"
        stroke={color}
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  )
}

function friendlyError(message: string): string {
  const msg = message.toLowerCase()
  if (msg.includes('user not found') || msg.includes('no user found')) {
    return 'No account found with that email. Contact Rowly Studios to get access.'
  }
  if (msg.includes('invalid') && (msg.includes('credential') || msg.includes('password'))) {
    return 'Incorrect password. Use "Forgot password?" below to reset it.'
  }
  if (msg.includes('email not confirmed')) {
    return 'Please confirm your email first — check your inbox for the confirmation link.'
  }
  return message
}

function LoginInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = createClient()

  const [email, setEmail] = useState('')
  const [resetEmail, setResetEmail] = useState('')
  const [password, setPassword] = useState('')
  const [status, setStatus] = useState<Status>('checking')
  const [errorMsg, setErrorMsg] = useState('')
  const [showReset, setShowReset] = useState(false)

  const [showAdminForm, setShowAdminForm] = useState(false)
  const [adminEmail, setAdminEmail] = useState('')
  const [adminPassword, setAdminPassword] = useState('')
  const [adminStatus, setAdminStatus] = useState<AdminStatus>('idle')
  const [adminErrorMsg, setAdminErrorMsg] = useState('')
  const adminEmailRef = useRef<HTMLInputElement>(null)
  const adminFormRef = useRef<HTMLDivElement>(null)

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
      setErrorMsg(friendlyError(error.message))
      return
    }

    router.replace('/app')
    router.refresh()
  }

  async function handleAdminSignIn(e: React.FormEvent) {
    e.preventDefault()
    setAdminStatus('submitting')
    setAdminErrorMsg('')

    const { error } = await supabase.auth.signInWithPassword({
      email: adminEmail,
      password: adminPassword,
    })

    if (error) {
      setAdminStatus('error')
      setAdminErrorMsg(friendlyError(error.message))
      return
    }

    router.replace('/app')
    router.refresh()
  }

  async function handleReset(e: React.FormEvent) {
    e.preventDefault()
    if (!resetEmail) return
    setStatus('reset-sending')
    setErrorMsg('')

    const { error } = await supabase.auth.resetPasswordForEmail(resetEmail, {
      redirectTo: RESET_REDIRECT,
    })

    if (error) {
      setStatus('error')
      setErrorMsg(error.message)
    } else {
      setStatus('reset-sent')
    }
  }

  function openReset() {
    setResetEmail(email)
    setShowReset(true)
    setErrorMsg('')
    setStatus('idle')
  }

  function backToSignIn() {
    setShowReset(false)
    setErrorMsg('')
    setStatus('idle')
  }

  function toggleAdminForm() {
    setShowAdminForm((prev) => {
      const next = !prev
      if (next) {
        setTimeout(() => {
          adminFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
          adminEmailRef.current?.focus()
        }, 80)
      }
      return next
    })
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
      <main className="min-h-[100dvh] flex flex-col items-center px-6 py-12 rs-bg-fusion">
        <Link href="/" className="flex flex-col items-center gap-4 mb-8">
          <RSLogo size={64} />
          <span className="text-xs tracking-[2px] text-rs-cream uppercase font-semibold">
            Rowly Studios
          </span>
        </Link>

        <div className="w-full max-w-sm rs-surface rounded-rs-lg p-6">
          {status === 'reset-sent' ? (
            <div className="text-center space-y-3">
              <p className="text-sm font-semibold uppercase tracking-wide" style={{ color: '#1A3C6B' }}>
                Check your email
              </p>
              <p className="text-[13px] leading-relaxed" style={{ color: '#2E5099' }}>
                We&apos;ve sent a reset link to <strong>{resetEmail}</strong>.
              </p>
              <button
                onClick={backToSignIn}
                className="text-[11px] uppercase tracking-wider underline mt-4"
                style={{ color: '#2E5099' }}
              >
                Back to sign in
              </button>
            </div>
          ) : showReset ? (
            <form onSubmit={handleReset} className="space-y-3">
              <label className="block text-[11px] uppercase tracking-wider font-semibold" style={{ color: '#1A3C6B' }}>
                Reset your password
              </label>
              <p className="text-[12px] leading-relaxed" style={{ color: '#2E5099' }}>
                Enter your account email and we&apos;ll send you a link to set a new password.
              </p>

              <input
                type="email"
                required
                value={resetEmail}
                onChange={(e) => setResetEmail(e.target.value)}
                placeholder="you@email.com"
                className="w-full px-3 py-3 text-[14px] text-rs-ink bg-white rounded-[10px] border focus:outline-none"
                style={{ borderColor: '#AABDE0' }}
                disabled={status === 'reset-sending'}
                autoComplete="email"
              />

              <button
                type="submit"
                disabled={status === 'reset-sending' || !resetEmail}
                className="w-full rounded-[10px] py-3 text-[12px] uppercase tracking-wider font-semibold text-white disabled:opacity-50 flex items-center justify-center gap-2"
                style={{ backgroundColor: '#1A3C6B' }}
              >
                {status === 'reset-sending' && <Spinner />}
                {status === 'reset-sending' ? 'Sending…' : 'Send reset link'}
              </button>

              {status === 'error' && errorMsg && (
                <p className="text-[11px] text-red-700 pt-1 leading-relaxed">{errorMsg}</p>
              )}

              <button
                type="button"
                onClick={backToSignIn}
                className="block mx-auto text-[11px] uppercase tracking-wider underline pt-2"
                style={{ color: '#2E5099' }}
              >
                Back to sign in
              </button>
            </form>
          ) : (
            <>
              <form onSubmit={handleSignIn} className="space-y-3">
                <label className="block text-[11px] uppercase tracking-wider font-semibold" style={{ color: '#1A3C6B' }}>
                  Sign in
                </label>

                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@email.com"
                  className="w-full px-3 py-3 text-[14px] text-rs-ink bg-white rounded-[10px] border focus:outline-none"
                  style={{ borderColor: '#AABDE0' }}
                  disabled={status === 'submitting'}
                  autoComplete="email"
                />

                <PasswordInput
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Password"
                  disabled={status === 'submitting'}
                  autoComplete="current-password"
                />

                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={openReset}
                    className="text-[11px] underline"
                    style={{ color: '#2E5099' }}
                  >
                    Forgot password?
                  </button>
                </div>

                <button
                  type="submit"
                  disabled={status === 'submitting' || !email || !password}
                  className="w-full rounded-[10px] py-3 text-[12px] uppercase tracking-wider font-semibold text-white disabled:opacity-50 flex items-center justify-center gap-2"
                  style={{ backgroundColor: '#1A3C6B' }}
                >
                  {status === 'submitting' && <Spinner />}
                  {status === 'submitting' ? 'Signing in…' : 'Sign in'}
                </button>

                {status === 'error' && errorMsg && (
                  <p className="text-[12px] text-red-700 pt-1 leading-relaxed">{errorMsg}</p>
                )}
              </form>

              <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '20px 0 14px' }}>
                <div style={{ flex: 1, height: 1, background: 'rgba(0,0,0,0.08)' }} />
                <span style={{ fontSize: 10, color: '#bbb', fontWeight: 500 }}>or</span>
                <div style={{ flex: 1, height: 1, background: 'rgba(0,0,0,0.08)' }} />
              </div>

              <button
                type="button"
                onClick={toggleAdminForm}
                aria-expanded={showAdminForm}
                style={{
                  width: '100%',
                  background: 'transparent',
                  border: '1.5px solid #1A3C6B',
                  borderRadius: 10,
                  padding: '11px 16px',
                  fontSize: 12,
                  fontWeight: 600,
                  color: '#1A3C6B',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  cursor: 'pointer',
                }}
              >
                <span
                  style={{
                    background: '#1A3C6B',
                    color: '#fff',
                    fontSize: 9,
                    fontWeight: 700,
                    padding: '2px 6px',
                    borderRadius: 4,
                    letterSpacing: '0.06em',
                  }}
                >
                  ADMIN
                </span>
                Admin access
              </button>

              {showAdminForm && (
                <form
                  ref={adminFormRef as unknown as React.RefObject<HTMLFormElement>}
                  onSubmit={handleAdminSignIn}
                  style={{
                    background: '#1A3C6B',
                    borderRadius: 12,
                    padding: 16,
                    marginTop: 14,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 10,
                  }}
                >
                  <p
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      color: '#AABDE0',
                      textTransform: 'uppercase',
                      letterSpacing: '0.08em',
                    }}
                  >
                    Admin sign in
                  </p>
                  <input
                    ref={adminEmailRef}
                    type="email"
                    required
                    value={adminEmail}
                    onChange={(e) => setAdminEmail(e.target.value)}
                    placeholder="admin@email.com"
                    className="w-full px-3 py-3 text-[14px] text-rs-ink bg-white rounded-[10px] border focus:outline-none"
                    style={{ borderColor: 'rgba(255,255,255,0.3)' }}
                    disabled={adminStatus === 'submitting'}
                    autoComplete="email"
                  />
                  <PasswordInput
                    required
                    value={adminPassword}
                    onChange={(e) => setAdminPassword(e.target.value)}
                    placeholder="Password"
                    disabled={adminStatus === 'submitting'}
                    autoComplete="current-password"
                  />
                  <button
                    type="submit"
                    disabled={
                      adminStatus === 'submitting' || !adminEmail || !adminPassword
                    }
                    style={{
                      width: '100%',
                      padding: '12px 0',
                      borderRadius: 10,
                      background: '#fff',
                      color: '#1A3C6B',
                      border: 'none',
                      fontSize: 12,
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      letterSpacing: '0.06em',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 8,
                      opacity:
                        adminStatus === 'submitting' || !adminEmail || !adminPassword
                          ? 0.55
                          : 1,
                      cursor:
                        adminStatus === 'submitting' ? 'wait' : 'pointer',
                    }}
                  >
                    {adminStatus === 'submitting' && <Spinner color="#1A3C6B" />}
                    {adminStatus === 'submitting' ? 'Signing in…' : 'Sign in as admin'}
                  </button>
                  {adminStatus === 'error' && adminErrorMsg && (
                    <p
                      style={{
                        fontSize: 12,
                        color: '#fca5a5',
                        lineHeight: 1.4,
                        marginTop: 2,
                      }}
                    >
                      {adminErrorMsg}
                    </p>
                  )}
                </form>
              )}
            </>
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

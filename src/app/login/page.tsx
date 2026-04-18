'use client'

import { Suspense, useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { RSLogo } from '@/components/RSLogo'
import { InstallBanner } from '@/components/InstallBanner'
import { PasswordInput } from '@/components/PasswordInput'
import { PinInput } from '@/components/PinInput'
import { createClient } from '@/lib/supabase-browser'
import { useAuth } from '@/lib/auth-context'

type Status = 'checking' | 'idle' | 'submitting' | 'reset-sending' | 'reset-sent' | 'error'
type AdminStep = 'password' | 'pin'
type AdminStatus = 'idle' | 'submitting' | 'error'

const RESET_REDIRECT = 'https://rowly-studios-app.vercel.app/reset-password'
const PIN_LENGTH = 6
const MAX_PIN_ATTEMPTS = 3

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
  const { refresh } = useAuth()

  const [email, setEmail] = useState('')
  const [resetEmail, setResetEmail] = useState('')
  const [password, setPassword] = useState('')
  const [status, setStatus] = useState<Status>('checking')
  const [errorMsg, setErrorMsg] = useState('')
  const [showReset, setShowReset] = useState(false)

  const [showAdminForm, setShowAdminForm] = useState(false)
  const [adminStep, setAdminStep] = useState<AdminStep>('password')
  const [adminEmail, setAdminEmail] = useState('')
  const [adminPassword, setAdminPassword] = useState('')
  const [adminStatus, setAdminStatus] = useState<AdminStatus>('idle')
  const [adminErrorMsg, setAdminErrorMsg] = useState('')

  const [pin, setPin] = useState('')
  const [pinAttempts, setPinAttempts] = useState(0)
  const [pinStatus, setPinStatus] = useState<AdminStatus>('idle')
  const [pinErrorMsg, setPinErrorMsg] = useState('')

  const adminEmailRef = useRef<HTMLInputElement>(null)
  const adminFormRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    async function check() {
      const wantsAdminPin =
        searchParams.get('admin') === '1' && searchParams.get('reason') === 'pin'

      const { data: { user } } = await supabase.auth.getUser()

      if (!user) {
        setStatus('idle')
        if (searchParams.get('admin') === '1') {
          setShowAdminForm(true)
        }
        return
      }

      if (wantsAdminPin) {
        const { data: profileRow } = await supabase
          .from('profiles')
          .select('role, email')
          .eq('id', user.id)
          .maybeSingle()

        if (profileRow?.role === 'admin') {
          setAdminEmail(profileRow.email ?? user.email ?? '')
          setShowAdminForm(true)
          setAdminStep('pin')
          setPin('')
          setPinAttempts(0)
          setPinStatus('idle')
          setPinErrorMsg('')
          setAdminStatus('idle')
          setAdminErrorMsg('')
          setStatus('idle')
          return
        }

        // Session exists but this isn't an admin account — sign out and show login
        await supabase.auth.signOut()
        setStatus('idle')
        return
      }

      router.replace('/app')
    }
    check()
  }, [router, supabase, searchParams])

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

  async function handleAdminPasswordStep(e: React.FormEvent) {
    e.preventDefault()
    setAdminStatus('submitting')
    setAdminErrorMsg('')

    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email: adminEmail,
      password: adminPassword,
    })

    if (authError) {
      setAdminStatus('error')
      setAdminErrorMsg(friendlyError(authError.message))
      return
    }

    const userId = authData.user?.id
    if (!userId) {
      await supabase.auth.signOut()
      setAdminStatus('error')
      setAdminErrorMsg('Could not verify the account. Please try again.')
      return
    }

    const { data: profileRow, error: profileError } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', userId)
      .maybeSingle()

    if (profileError || !profileRow) {
      await supabase.auth.signOut()
      setAdminStatus('error')
      setAdminErrorMsg(profileError?.message ?? 'Could not read your profile.')
      return
    }

    if (profileRow.role !== 'admin') {
      await supabase.auth.signOut()
      setAdminStatus('error')
      setAdminErrorMsg("This account doesn't have admin access.")
      return
    }

    setAdminStatus('idle')
    setAdminErrorMsg('')
    setAdminPassword('')
    setPin('')
    setPinAttempts(0)
    setPinErrorMsg('')
    setPinStatus('idle')
    setAdminStep('pin')
  }

  async function verifyPin(fullPin: string) {
    if (fullPin.length !== PIN_LENGTH) return
    if (pinStatus === 'submitting') return

    setPinStatus('submitting')
    setPinErrorMsg('')

    const { data: valid, error } = await supabase.rpc('verify_admin_pin', { pin: fullPin })

    if (error) {
      setPinStatus('error')
      setPinErrorMsg(error.message)
      return
    }

    if (valid === true) {
      setPinStatus('idle')
      // Re-fetch the profile so pin_verified_at is fresh in AuthContext
      // before AdminGuard checks it on /app.
      await refresh()
      router.push('/app')
      return
    }

    const attempts = pinAttempts + 1
    setPinAttempts(attempts)
    setPin('')

    if (attempts >= MAX_PIN_ATTEMPTS) {
      await supabase.auth.signOut()
      setAdminStep('password')
      setAdminEmail('')
      setAdminPassword('')
      setAdminStatus('error')
      setAdminErrorMsg('Too many failed attempts. Please sign in again.')
      setPinStatus('idle')
      setPinErrorMsg('')
      setPinAttempts(0)
      return
    }

    setPinStatus('error')
    setPinErrorMsg(
      `Incorrect PIN. Try again. (${MAX_PIN_ATTEMPTS - attempts} attempt${
        MAX_PIN_ATTEMPTS - attempts === 1 ? '' : 's'
      } left)`
    )
  }

  async function handlePinBack() {
    await supabase.auth.signOut()
    setAdminStep('password')
    setAdminPassword('')
    setPin('')
    setPinAttempts(0)
    setPinStatus('idle')
    setPinErrorMsg('')
    setAdminStatus('idle')
    setAdminErrorMsg('')
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
      if (!next) {
        // Collapsing — reset the admin flow entirely.
        setAdminStep('password')
        setAdminPassword('')
        setPin('')
        setPinAttempts(0)
        setPinStatus('idle')
        setPinErrorMsg('')
        setAdminStatus('idle')
        setAdminErrorMsg('')
      } else {
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
                <div
                  ref={adminFormRef}
                  style={{
                    background: '#1A3C6B',
                    borderRadius: 16,
                    padding: 20,
                    marginTop: 12,
                    transition: 'all 160ms ease',
                  }}
                >
                  {adminStep === 'password' ? (
                    <form
                      onSubmit={handleAdminPasswordStep}
                      style={{ display: 'flex', flexDirection: 'column', gap: 10 }}
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
                          cursor: adminStatus === 'submitting' ? 'wait' : 'pointer',
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
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                      {searchParams.get('reason') === 'pin' && (
                        <p
                          style={{
                            fontSize: 12,
                            color: '#AABDE0',
                            background: 'rgba(170,189,224,0.1)',
                            border: '1px solid rgba(170,189,224,0.2)',
                            borderRadius: 10,
                            padding: '10px 12px',
                            textAlign: 'center',
                            lineHeight: 1.4,
                          }}
                        >
                          Your admin session requires PIN verification to continue.
                        </p>
                      )}

                      <div style={{ textAlign: 'center' }}>
                        <p
                          style={{
                            fontSize: 16,
                            fontWeight: 700,
                            color: '#fff',
                            marginBottom: 4,
                          }}
                        >
                          Admin PIN
                        </p>
                        <p style={{ fontSize: 12, color: '#AABDE0' }}>
                          Enter your 6-digit access code
                        </p>
                      </div>

                      <PinInput
                        value={pin}
                        onChange={setPin}
                        onComplete={verifyPin}
                        disabled={pinStatus === 'submitting'}
                        variant="dark"
                        autoFocus
                      />

                      <button
                        type="button"
                        onClick={() => verifyPin(pin)}
                        disabled={pinStatus === 'submitting' || pin.length !== PIN_LENGTH}
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
                            pinStatus === 'submitting' || pin.length !== PIN_LENGTH
                              ? 0.55
                              : 1,
                          cursor: pinStatus === 'submitting' ? 'wait' : 'pointer',
                        }}
                      >
                        {pinStatus === 'submitting' && <Spinner color="#1A3C6B" />}
                        {pinStatus === 'submitting' ? 'Verifying…' : 'Verify'}
                      </button>

                      {pinStatus === 'error' && pinErrorMsg && (
                        <p
                          style={{
                            fontSize: 12,
                            color: '#fca5a5',
                            lineHeight: 1.4,
                            textAlign: 'center',
                          }}
                        >
                          {pinErrorMsg}
                        </p>
                      )}

                      <button
                        type="button"
                        onClick={handlePinBack}
                        disabled={pinStatus === 'submitting'}
                        style={{
                          background: 'transparent',
                          border: 'none',
                          color: '#AABDE0',
                          fontSize: 11,
                          textTransform: 'uppercase',
                          letterSpacing: '0.08em',
                          cursor: 'pointer',
                          textDecoration: 'underline',
                          alignSelf: 'center',
                        }}
                      >
                        ← Back
                      </button>
                    </div>
                  )}
                </div>
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

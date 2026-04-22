'use client'

import { Suspense, useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { RSLogo } from '@/components/RSLogo'
import { InstallBanner } from '@/components/InstallBanner'
import { PasswordInput } from '@/components/PasswordInput'
import { createClient } from '@/lib/supabase-browser'
import { adminSignIn } from './actions'

type Status = 'checking' | 'idle' | 'submitting' | 'error'
type AdminStatus = 'idle' | 'submitting' | 'error'
type Mode = 'signin' | 'signup'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

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
  const pageMode = searchParams.get('mode') // 'reset' when arriving from /auth/callback
  const supabase = createClient()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [status, setStatus] = useState<Status>('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const [flashMessage, setFlashMessage] = useState('')
  const [forgotMessage, setForgotMessage] = useState('')
  const [selectedRole, setSelectedRole] = useState<'talent' | 'client'>('talent')

  // ─── Reset-password box (mode=reset) ──────────────────────────
  const [resetEmail, setResetEmail] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [retypePassword, setRetypePassword] = useState('')
  const [showNew, setShowNew] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [resetStatus, setResetStatus] = useState<
    'idle' | 'loading' | 'success' | 'error'
  >('idle')
  const [resetError, setResetError] = useState('')

  const [mode, setMode] = useState<Mode>('signin')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [companyName, setCompanyName] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showWebsiteRedirect, setShowWebsiteRedirect] = useState(false)

  const [showAdminForm, setShowAdminForm] = useState(false)
  const [adminEmail, setAdminEmail] = useState('')
  const [adminPassword, setAdminPassword] = useState('')
  const [adminStatus, setAdminStatus] = useState<AdminStatus>('idle')
  const [adminErrorMsg, setAdminErrorMsg] = useState('')
  const [adminResetStatus, setAdminResetStatus] = useState<
    'idle' | 'sending' | 'sent'
  >('idle')

  const adminEmailRef = useRef<HTMLInputElement>(null)
  const adminFormRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    // Skip the warm-session redirect when we're specifically here to
    // show the reset-password box — the callback has just set a session,
    // but the user needs to stay on /login to pick a new password.
    if (searchParams.get('mode') === 'reset') {
      setStatus('idle')
      return
    }
    async function check() {
      setStatus('checking')
      try {
        const { data: { user } } = await supabase.auth.getUser()

        if (!user) {
          if (searchParams.get('admin') === '1') {
            setShowAdminForm(true)
          }
          return
        }

        // Role-based redirect for pre-authenticated visitors.
        const { data: profileRow } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', user.id)
          .maybeSingle()
        router.replace(profileRow?.role === 'admin' ? '/admin' : '/app')
      } catch (err) {
        // Swallow — the button must not be stuck if auth is unreachable.
        console.warn('[login] session check failed', err)
      } finally {
        setStatus('idle')
      }
    }
    check()
  }, [router, supabase, searchParams])

  useEffect(() => {
    const err = searchParams.get('error')
    if (err === 'auth_failed') {
      setErrorMsg('That sign-in link was invalid or expired. Please sign in again.')
      setStatus('error')
    }
    const msg = searchParams.get('message')
    if (msg) {
      setFlashMessage(msg)
    }
  }, [searchParams])

  // When we arrive in reset mode (after /auth/callback exchanges the
  // recovery code), pull the current user's email from the session so
  // the reset box can pre-fill it read-only.
  useEffect(() => {
    if (pageMode !== 'reset') return
    supabase.auth.getSession().then(({ data }) => {
      setResetEmail(data.session?.user?.email ?? '')
    })
  }, [pageMode, supabase])

  function resetSignupFields() {
    setFirstName('')
    setLastName('')
    setCompanyName('')
    setPassword('')
    setConfirmPassword('')
    setErrorMsg('')
    setStatus('idle')
  }

  function switchMode(next: Mode) {
    setMode(next)
    setErrorMsg('')
    setStatus('idle')
    if (next === 'signin') {
      setConfirmPassword('')
      setFirstName('')
      setLastName('')
      setCompanyName('')
    }
  }

  async function handleSignUp(e: React.FormEvent) {
    e.preventDefault()
    setStatus('submitting')
    setErrorMsg('')

    const first = firstName.trim()
    const last = lastName.trim()
    const company = companyName.trim()
    const cleanEmail = email.trim()

    if (!first || !last) {
      setStatus('error')
      setErrorMsg('Please enter your first and last name.')
      return
    }
    if (selectedRole === 'client' && !company) {
      setStatus('error')
      setErrorMsg('Please enter your company name.')
      return
    }
    if (!EMAIL_RE.test(cleanEmail)) {
      setStatus('error')
      setErrorMsg('Please enter a valid email address.')
      return
    }
    if (password.length < 8) {
      setStatus('error')
      setErrorMsg('Password must be at least 8 characters.')
      return
    }
    if (password !== confirmPassword) {
      setStatus('error')
      setErrorMsg('Passwords do not match.')
      return
    }

    // 1. Create the user through Supabase auth (GoTrue handles hashing etc.)
    const { data, error } = await supabase.auth.signUp({
      email: cleanEmail,
      password,
    })

    if (error) {
      setStatus('error')
      const lower = error.message.toLowerCase()
      if (lower.includes('already registered') || lower.includes('already exists')) {
        setErrorMsg('An account already exists with this email. Sign in instead.')
      } else if (lower.includes('password should be at least')) {
        setErrorMsg('Password must be at least 8 characters.')
      } else {
        setErrorMsg(error.message)
      }
      return
    }

    const userId = data.user?.id
    if (!userId) {
      setStatus('error')
      setErrorMsg('Something went wrong. Please try again.')
      return
    }

    // 2. Auto-confirm email via edge function (bypasses free-tier email delivery)
    try {
      await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/set-user-password?action=confirm-email`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId }),
        }
      )
    } catch {
      // Non-fatal — if confirmation fails, signInWithPassword below will surface it.
    }

    // 3. Sign in so subsequent updates run as an authenticated user (RLS).
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: cleanEmail,
      password,
    })
    if (signInError) {
      setStatus('error')
      setErrorMsg('Account created but sign-in failed. Please sign in manually.')
      setMode('signin')
      setConfirmPassword('')
      return
    }

    // 4. For talent, check whether this email has a pre-approval invite.
    //    Pre-approved talent (invited) → verified immediately, straight to /app.
    //    Uninvited talent → not verified, shown the website redirect screen.
    let isInvited = false
    if (selectedRole === 'talent') {
      try {
        const inviteRes = await fetch(
          `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/set-user-password?action=check-invite`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: cleanEmail.toLowerCase() }),
          }
        )
        const inviteData = await inviteRes.json().catch(() => ({}))
        isInvited = inviteData?.invited === true
      } catch {
        // Non-fatal — fall through as uninvited.
      }
    }

    // 5. Populate the profile row created by the handle_new_user trigger.
    const fullName = `${first} ${last}`
    const profileUpdate = await supabase
      .from('profiles')
      .update({
        first_name: first,
        last_name: last,
        full_name: fullName,
        role: selectedRole,
        // Client → verified immediately.
        // Talent with invite → verified immediately.
        // Talent without invite → unverified, sent to website.
        verified: selectedRole === 'client' ? true : isInvited,
      })
      .eq('id', userId)

    if (profileUpdate.error) {
      setStatus('error')
      setErrorMsg(profileUpdate.error.message)
      return
    }

    // 6. Clients: make sure client_profiles has a row with the company name.
    if (selectedRole === 'client') {
      const clientUpsert = await supabase
        .from('client_profiles')
        .upsert({ id: userId, company_name: company }, { onConflict: 'id' })
      if (clientUpsert.error) {
        setStatus('error')
        setErrorMsg(clientUpsert.error.message)
        return
      }
    }

    // 7. If invited talent, mark the invite as signed up so admin sees it.
    if (selectedRole === 'talent' && isInvited) {
      try {
        await fetch(
          `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/set-user-password?action=mark-signed-up`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              email: cleanEmail.toLowerCase(),
              profileId: userId,
            }),
          }
        )
      } catch {
        // Non-fatal — admin can reconcile manually.
      }
    }

    // 8. Route based on role / invite status.
    if (selectedRole === 'client' || isInvited) {
      setStatus('idle')
      router.replace('/app')
      router.refresh()
      return
    }

    // Uninvited talent → sign out, show website redirect screen.
    // Their auth user remains in Supabase; once admin adds an invite they
    // can sign in and they'll pass the unverified-but-invited check.
    await supabase.auth.signOut()
    resetSignupFields()
    setShowWebsiteRedirect(true)
  }

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault()
    setStatus('submitting')
    setErrorMsg('')

    const { data: authData, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error) {
      setStatus('error')
      setErrorMsg(friendlyError(error.message))
      return
    }

    const userId = authData.user?.id
    if (!userId) {
      await supabase.auth.signOut()
      setStatus('error')
      setErrorMsg('Could not read your account. Please try again.')
      return
    }

    const { data: profileRow } = await supabase
      .from('profiles')
      .select('role, verified')
      .eq('id', userId)
      .maybeSingle()

    const actualRole = profileRow?.role

    if (actualRole === 'admin') {
      await supabase.auth.signOut()
      setStatus('error')
      setErrorMsg('Admin accounts must use the Admin Access button below.')
      return
    }

    if (actualRole === 'talent' && selectedRole === 'client') {
      await supabase.auth.signOut()
      setStatus('error')
      setErrorMsg("This is a talent account. Please select 'Talent' to sign in.")
      return
    }

    if (actualRole === 'client' && selectedRole === 'talent') {
      await supabase.auth.signOut()
      setStatus('error')
      setErrorMsg("This is a client account. Please select 'Client' to sign in.")
      return
    }

    // Unverified talent: allow in only if they have an invite (admin is still
    // finishing profile review). Otherwise redirect them back to the website.
    if (actualRole === 'talent' && profileRow?.verified === false) {
      let invited = false
      try {
        const inviteRes = await fetch(
          `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/set-user-password?action=check-invite`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: email.toLowerCase().trim() }),
          }
        )
        const inviteData = await inviteRes.json().catch(() => ({}))
        invited = inviteData?.invited === true
      } catch {
        // Treat as uninvited on failure — safer default.
      }

      if (invited) {
        router.replace('/app')
        router.refresh()
        return
      }

      await supabase.auth.signOut()
      setStatus('error')
      setErrorMsg(
        "Your application hasn't been approved yet. Please apply at rowlystudios.com first, or check your email for an invite from Rowly Studios."
      )
      return
    }

    router.replace('/app')
    router.refresh()
  }

  async function handleAdminPasswordStep(e: React.FormEvent) {
    e.preventDefault()
    setAdminStatus('submitting')
    setAdminErrorMsg('')

    const result = await adminSignIn(adminEmail, adminPassword)

    if (result?.error) {
      setAdminStatus('error')
      setAdminErrorMsg(result.error)
    }
    // If no error, the server action called redirect('/admin') — Next
    // returns a 303 with Set-Cookie for the session, and the browser
    // follows it. No client-side navigation needed.
  }

  /**
   * Unified forgot-password request used by both the talent/client form
   * and the admin form. Sends a recovery link; the inline banner in the
   * form card confirms it went out.
   */
  async function handleForgotPassword(emailToReset: string) {
    setForgotMessage('')
    setAdminResetStatus('idle')
    const addr = (emailToReset ?? '').trim()
    if (!addr || !EMAIL_RE.test(addr)) {
      setForgotMessage('Enter your email address first, then tap Forgot password?.')
      return
    }
    setAdminResetStatus('sending')
    const { error } = await supabase.auth.resetPasswordForEmail(addr, {
      redirectTo: 'https://app.rowlystudios.com/auth/callback?type=recovery',
    })
    if (error) {
      setAdminResetStatus('idle')
      setForgotMessage(error.message)
      return
    }
    setAdminResetStatus('sent')
    setForgotMessage('Reset link sent. Check your email.')
  }

  /**
   * Handler for the inline reset box (mode=reset). Updates the password,
   * signs the user out of the recovery session, and bounces to /login
   * with a success banner.
   */
  async function handlePasswordReset() {
    setResetError('')
    if (newPassword.length < 8) {
      setResetError('Password must be at least 8 characters.')
      return
    }
    if (newPassword !== retypePassword) {
      setResetError('Passwords do not match.')
      return
    }
    setResetStatus('loading')
    const { error } = await supabase.auth.updateUser({
      password: newPassword,
    })
    if (error) {
      setResetStatus('error')
      setResetError(error.message)
      return
    }
    await supabase.auth.signOut()
    setResetStatus('success')
    setTimeout(() => {
      router.replace(
        '/login?message=Password+updated.+Please+sign+in.'
      )
    }, 1000)
  }

  function toggleAdminForm() {
    setShowAdminForm((prev) => {
      const next = !prev
      if (!next) {
        // Collapsing — reset the admin form.
        setAdminPassword('')
        setAdminStatus('idle')
        setAdminErrorMsg('')
        setAdminResetStatus('idle')
      } else {
        // Opening — focus the (blank) email input. No pre-fill.
        setTimeout(() => {
          adminFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
          adminEmailRef.current?.focus()
        }, 80)
      }
      return next
    })
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

        {pageMode !== 'reset' && !showWebsiteRedirect && !showAdminForm && (
          <div className="w-full max-w-sm">
            <p
              style={{
                fontSize: 11,
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.1em',
                color: '#AABDE0',
                textAlign: 'center',
                marginBottom: 14,
              }}
            >
              I am signing in as
            </p>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: 10,
                marginBottom: 20,
              }}
            >
              <button
                type="button"
                onClick={() => setSelectedRole('talent')}
                aria-pressed={selectedRole === 'talent'}
                style={{
                  borderRadius: 14,
                  padding: '18px 14px',
                  textAlign: 'center',
                  border:
                    selectedRole === 'talent'
                      ? '1.5px solid #ffffff'
                      : '1.5px solid rgba(170,189,224,0.2)',
                  background:
                    selectedRole === 'talent'
                      ? '#ffffff'
                      : 'rgba(255,255,255,0.06)',
                  cursor: 'pointer',
                  transition: 'all 150ms ease',
                }}
              >
                <div
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: '50%',
                    margin: '0 auto 8px',
                    background:
                      selectedRole === 'talent' ? '#1A3C6B' : 'rgba(170,189,224,0.15)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke={selectedRole === 'talent' ? '#fff' : '#AABDE0'}
                    strokeWidth="1.8"
                    strokeLinecap="round"
                  >
                    <circle cx="12" cy="8" r="4" />
                    <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
                  </svg>
                </div>
                <p
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    color:
                      selectedRole === 'talent'
                        ? '#1A3C6B'
                        : 'rgba(170,189,224,0.8)',
                  }}
                >
                  Talent
                </p>
                <p
                  style={{
                    fontSize: 10,
                    marginTop: 2,
                    color:
                      selectedRole === 'talent'
                        ? 'rgba(26,60,107,0.6)'
                        : 'rgba(170,189,224,0.5)',
                  }}
                >
                  Creatives &amp; crew
                </p>
              </button>

              <button
                type="button"
                onClick={() => setSelectedRole('client')}
                aria-pressed={selectedRole === 'client'}
                style={{
                  borderRadius: 14,
                  padding: '18px 14px',
                  textAlign: 'center',
                  border:
                    selectedRole === 'client'
                      ? '1.5px solid #ffffff'
                      : '1.5px solid rgba(170,189,224,0.2)',
                  background:
                    selectedRole === 'client'
                      ? '#ffffff'
                      : 'rgba(255,255,255,0.06)',
                  cursor: 'pointer',
                  transition: 'all 150ms ease',
                }}
              >
                <div
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: '50%',
                    margin: '0 auto 8px',
                    background:
                      selectedRole === 'client' ? '#1A3C6B' : 'rgba(170,189,224,0.15)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke={selectedRole === 'client' ? '#fff' : '#AABDE0'}
                    strokeWidth="1.8"
                    strokeLinecap="round"
                  >
                    <rect x="2" y="7" width="20" height="14" rx="2" />
                    <path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2" />
                  </svg>
                </div>
                <p
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    color:
                      selectedRole === 'client'
                        ? '#1A3C6B'
                        : 'rgba(170,189,224,0.8)',
                  }}
                >
                  Client
                </p>
                <p
                  style={{
                    fontSize: 10,
                    marginTop: 2,
                    color:
                      selectedRole === 'client'
                        ? 'rgba(26,60,107,0.6)'
                        : 'rgba(170,189,224,0.5)',
                  }}
                >
                  Brands &amp; agencies
                </p>
              </button>
            </div>
          </div>
        )}

        <div className="w-full max-w-sm rs-surface rounded-rs-lg p-6">
          {flashMessage && (
            <div
              role="status"
              style={{
                background: '#F0FDF4',
                border: '1px solid #BBF7D0',
                borderRadius: 8,
                padding: '10px 14px',
                color: '#16A34A',
                fontSize: 13,
                textAlign: 'center',
                marginBottom: 14,
                lineHeight: 1.45,
              }}
            >
              {flashMessage}
            </div>
          )}
          {showWebsiteRedirect ? (
            <div style={{ textAlign: 'center', padding: '32px 0' }}>
              <div style={{ marginBottom: 20, display: 'flex', justifyContent: 'center' }}>
                <RSLogo size={48} />
              </div>
              <p style={{ fontSize: 22, fontWeight: 700, color: '#1A3C6B', marginBottom: 10 }}>
                Apply on our website first
              </p>
              <p style={{ fontSize: 14, color: '#2E5099', lineHeight: 1.6, marginBottom: 28 }}>
                To join the Rowly Studios talent roster, you need to complete your application
                on our website and agree to our terms before signing up.
              </p>
              <a
                href="https://rowlystudios-lgtm.github.io/rowlystudios/join.html"
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: 'block',
                  background: '#1A3C6B',
                  color: '#fff',
                  padding: '16px 24px',
                  borderRadius: 12,
                  fontSize: 15,
                  fontWeight: 700,
                  textDecoration: 'none',
                  marginBottom: 16,
                }}
              >
                Apply to join Rowly Studios →
              </a>
              <p style={{ fontSize: 12, color: '#2E5099', lineHeight: 1.5, marginBottom: 20 }}>
                Already applied? We&apos;ll send you an invite email once your application has
                been reviewed. This usually takes 1–2 business days.
              </p>
              <button
                type="button"
                onClick={async () => {
                  await supabase.auth.signOut()
                  setShowWebsiteRedirect(false)
                  setMode('signin')
                  setEmail('')
                  setPassword('')
                  setConfirmPassword('')
                  setFirstName('')
                  setLastName('')
                  setCompanyName('')
                  setErrorMsg('')
                  setStatus('idle')
                }}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#2E5099',
                  fontSize: 12,
                  textDecoration: 'underline',
                  cursor: 'pointer',
                }}
              >
                ← Back to sign in
              </button>
            </div>
          ) : pageMode === 'reset' ? (
            <ResetBox
              resetEmail={resetEmail}
              newPassword={newPassword}
              setNewPassword={setNewPassword}
              retypePassword={retypePassword}
              setRetypePassword={setRetypePassword}
              showNew={showNew}
              setShowNew={setShowNew}
              showConfirm={showConfirm}
              setShowConfirm={setShowConfirm}
              resetStatus={resetStatus}
              resetError={resetError}
              handlePasswordReset={handlePasswordReset}
            />
          ) : (
            <>
              {!showAdminForm && (<>
              <div
                role="tablist"
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  padding: 3,
                  borderRadius: 999,
                  background: 'rgba(26,60,107,0.08)',
                  marginBottom: 16,
                }}
              >
                {(['signin', 'signup'] as Mode[]).map((m) => {
                  const active = mode === m
                  return (
                    <button
                      key={m}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      onClick={() => switchMode(m)}
                      style={{
                        padding: '8px 0',
                        borderRadius: 999,
                        border: 'none',
                        background: active ? '#1A3C6B' : 'transparent',
                        color: active ? '#ffffff' : 'rgba(46,80,153,0.65)',
                        fontSize: 11,
                        fontWeight: 700,
                        textTransform: 'uppercase',
                        letterSpacing: '0.08em',
                        cursor: 'pointer',
                        transition: 'background 150ms ease, color 150ms ease',
                      }}
                    >
                      {m === 'signin' ? 'Sign in' : 'Create account'}
                    </button>
                  )
                })}
              </div>

              {mode === 'signin' ? (
                <form onSubmit={handleSignIn} className="space-y-3">
                  <label className="block text-[11px] uppercase tracking-wider font-semibold" style={{ color: '#1A3C6B' }}>
                    {selectedRole === 'talent' ? 'Talent sign in' : 'Client sign in'}
                  </label>

                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@email.com"
                    className="w-full px-3 py-3 text-[14px] text-rs-ink bg-white rounded-[10px] border focus:outline-none"
                    style={{ borderColor: '#AABDE0' }}
                    disabled={status === 'submitting' || status === 'checking'}
                    autoComplete="email"
                  />

                  <PasswordInput
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Password"
                    disabled={status === 'submitting' || status === 'checking'}
                    autoComplete="current-password"
                  />

                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={() => handleForgotPassword(email)}
                      disabled={adminResetStatus === 'sending'}
                      className="text-[11px] underline"
                      style={{ color: '#2E5099' }}
                    >
                      {adminResetStatus === 'sending'
                        ? 'Sending…'
                        : 'Forgot password?'}
                    </button>
                  </div>

                  {forgotMessage && (
                    <p
                      className="text-[12px] leading-relaxed"
                      style={{
                        color:
                          adminResetStatus === 'sent' ? '#16A34A' : '#8A1C1C',
                      }}
                    >
                      {forgotMessage}
                    </p>
                  )}

                  <button
                    type="submit"
                    disabled={
                      status === 'submitting' ||
                      status === 'checking' ||
                      !email ||
                      !password
                    }
                    className="w-full rounded-[10px] py-3 text-[12px] uppercase tracking-wider font-semibold text-white disabled:opacity-50 flex items-center justify-center gap-2"
                    style={{ backgroundColor: '#1A3C6B' }}
                  >
                    {(status === 'submitting' || status === 'checking') && <Spinner />}
                    {status === 'checking'
                      ? 'Loading…'
                      : status === 'submitting'
                      ? 'Signing in…'
                      : selectedRole === 'talent'
                      ? 'Sign in as talent'
                      : 'Sign in as client'}
                  </button>

                  {status === 'error' && errorMsg && (
                    <p className="text-[12px] text-red-700 pt-1 leading-relaxed">{errorMsg}</p>
                  )}
                </form>
              ) : (
                <form onSubmit={handleSignUp} className="space-y-3">
                  <label
                    className="block text-[11px] uppercase tracking-wider font-semibold"
                    style={{ color: '#1A3C6B' }}
                  >
                    {selectedRole === 'talent' ? 'Create talent account' : 'Create client account'}
                  </label>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <input
                      type="text"
                      required
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      placeholder="First name"
                      className="w-full px-3 py-3 text-[14px] text-rs-ink bg-white rounded-[10px] border focus:outline-none"
                      style={{ borderColor: '#AABDE0' }}
                      disabled={status === 'submitting'}
                      autoComplete="given-name"
                    />
                    <input
                      type="text"
                      required
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      placeholder="Last name"
                      className="w-full px-3 py-3 text-[14px] text-rs-ink bg-white rounded-[10px] border focus:outline-none"
                      style={{ borderColor: '#AABDE0' }}
                      disabled={status === 'submitting'}
                      autoComplete="family-name"
                    />
                  </div>

                  {selectedRole === 'client' && (
                    <input
                      type="text"
                      required
                      value={companyName}
                      onChange={(e) => setCompanyName(e.target.value)}
                      placeholder="Company name"
                      className="w-full px-3 py-3 text-[14px] text-rs-ink bg-white rounded-[10px] border focus:outline-none"
                      style={{ borderColor: '#AABDE0' }}
                      disabled={status === 'submitting'}
                      autoComplete="organization"
                    />
                  )}

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
                    minLength={8}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Password (min 8 characters)"
                    disabled={status === 'submitting'}
                    autoComplete="new-password"
                  />
                  <PasswordInput
                    required
                    minLength={8}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Confirm password"
                    disabled={status === 'submitting'}
                    autoComplete="new-password"
                  />

                  <button
                    type="submit"
                    disabled={
                      status === 'submitting' ||
                      !firstName ||
                      !lastName ||
                      !email ||
                      !password ||
                      !confirmPassword ||
                      (selectedRole === 'client' && !companyName)
                    }
                    className="w-full rounded-[10px] py-3 text-[12px] uppercase tracking-wider font-semibold text-white disabled:opacity-50 flex items-center justify-center gap-2"
                    style={{ backgroundColor: '#1A3C6B' }}
                  >
                    {status === 'submitting' && <Spinner />}
                    {status === 'submitting'
                      ? 'Creating account…'
                      : selectedRole === 'talent'
                      ? 'Create talent account'
                      : 'Create client account'}
                  </button>

                  {status === 'error' && errorMsg && (
                    <p className="text-[12px] text-red-700 pt-1 leading-relaxed">{errorMsg}</p>
                  )}
                </form>
              )}

              <p
                className="text-center pt-3"
                style={{ fontSize: 12, color: '#2E5099' }}
              >
                {mode === 'signin' ? (
                  <>
                    New here?{' '}
                    <button
                      type="button"
                      onClick={() => switchMode('signup')}
                      className="underline font-semibold"
                      style={{ color: '#1A3C6B' }}
                    >
                      Create an account →
                    </button>
                  </>
                ) : (
                  <>
                    Already have an account?{' '}
                    <button
                      type="button"
                      onClick={() => switchMode('signin')}
                      className="underline font-semibold"
                      style={{ color: '#1A3C6B' }}
                    >
                      Sign in →
                    </button>
                  </>
                )}
              </p>

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
              </>)}

              {showAdminForm && (
                <div
                  ref={adminFormRef}
                  style={{
                    background: '#0F1B2E',
                    borderRadius: 16,
                    padding: 20,
                    marginTop: 0,
                    transition: 'all 160ms ease',
                  }}
                >
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
                          letterSpacing: '0.12em',
                          marginBottom: 4,
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
                      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                        <button
                          type="button"
                          onClick={() => handleForgotPassword(adminEmail)}
                          disabled={adminResetStatus === 'sending'}
                          style={{
                            background: 'transparent',
                            border: 'none',
                            color: '#AABDE0',
                            fontSize: 11,
                            textDecoration: 'underline',
                            cursor: 'pointer',
                            padding: 0,
                          }}
                        >
                          {adminResetStatus === 'sending'
                            ? 'Sending…'
                            : 'Forgot password?'}
                        </button>
                      </div>
                      {forgotMessage && (
                        <p
                          style={{
                            fontSize: 12,
                            color:
                              adminResetStatus === 'sent'
                                ? '#A7E2C1'
                                : '#fca5a5',
                            lineHeight: 1.4,
                          }}
                        >
                          {forgotMessage}
                        </p>
                      )}
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
                      <button
                        type="button"
                        onClick={toggleAdminForm}
                        disabled={adminStatus === 'submitting'}
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
                          marginTop: 4,
                        }}
                      >
                        ← Back to sign in
                      </button>
                    </form>
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

type ResetBoxProps = {
  resetEmail: string
  newPassword: string
  setNewPassword: (v: string) => void
  retypePassword: string
  setRetypePassword: (v: string) => void
  showNew: boolean
  setShowNew: React.Dispatch<React.SetStateAction<boolean>>
  showConfirm: boolean
  setShowConfirm: React.Dispatch<React.SetStateAction<boolean>>
  resetStatus: 'idle' | 'loading' | 'success' | 'error'
  resetError: string
  handlePasswordReset: () => void | Promise<void>
}

function ResetBox({
  resetEmail,
  newPassword,
  setNewPassword,
  retypePassword,
  setRetypePassword,
  showNew,
  setShowNew,
  showConfirm,
  setShowConfirm,
  resetStatus,
  resetError,
  handlePasswordReset,
}: ResetBoxProps) {
  if (resetStatus === 'success') {
    return (
      <div
        style={{
          background: '#F0FDF4',
          border: '1px solid #BBF7D0',
          borderRadius: 8,
          padding: '14px 16px',
          color: '#16A34A',
          fontSize: 13,
          textAlign: 'center',
        }}
      >
        Password updated. Redirecting…
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <p
        className="text-sm font-semibold uppercase tracking-wide"
        style={{ color: '#1A3C6B' }}
      >
        Reset your password
      </p>
      <p
        className="text-[12px] leading-relaxed"
        style={{ color: '#2E5099' }}
      >
        Enter your new password below.
      </p>

      {/* EMAIL (read-only) */}
      <div>
        <label
          className="block text-[10px] uppercase tracking-wider font-semibold mb-1"
          style={{ color: '#9CA3AF', letterSpacing: '0.12em' }}
        >
          Email
        </label>
        <input
          type="email"
          value={resetEmail}
          readOnly
          className="w-full px-3 py-3 text-[14px] rounded-[10px] border"
          style={{
            borderColor: '#E5E7EB',
            background: '#F3F4F6',
            color: '#6B7280',
            cursor: 'default',
          }}
        />
      </div>

      {/* NEW PASSWORD */}
      <div>
        <label
          className="block text-[10px] uppercase tracking-wider font-semibold mb-1"
          style={{ color: '#9CA3AF', letterSpacing: '0.12em' }}
        >
          New password
        </label>
        <div style={{ position: 'relative' }}>
          <input
            type={showNew ? 'text' : 'password'}
            placeholder="At least 8 characters"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            autoFocus
            className="w-full rounded-[10px] border focus:outline-none"
            style={{
              padding: '12px 44px 12px 14px',
              borderColor: '#D1D5DB',
              background: '#fff',
              color: '#1A2030',
              fontSize: 14,
              boxSizing: 'border-box',
            }}
          />
          <button
            type="button"
            onClick={() => setShowNew((v) => !v)}
            aria-label={showNew ? 'Hide password' : 'Show password'}
            style={{
              position: 'absolute',
              right: 12,
              top: '50%',
              transform: 'translateY(-50%)',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: '#9CA3AF',
              fontSize: 14,
              padding: 0,
            }}
          >
            {showNew ? '🙈' : '👁'}
          </button>
        </div>
      </div>

      {/* RETYPE PASSWORD */}
      <div>
        <label
          className="block text-[10px] uppercase tracking-wider font-semibold mb-1"
          style={{ color: '#9CA3AF', letterSpacing: '0.12em' }}
        >
          Retype password
        </label>
        <div style={{ position: 'relative' }}>
          <input
            type={showConfirm ? 'text' : 'password'}
            placeholder="Confirm new password"
            value={retypePassword}
            onChange={(e) => setRetypePassword(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                handlePasswordReset()
              }
            }}
            className="w-full rounded-[10px] border focus:outline-none"
            style={{
              padding: '12px 44px 12px 14px',
              borderColor: '#D1D5DB',
              background: '#fff',
              color: '#1A2030',
              fontSize: 14,
              boxSizing: 'border-box',
            }}
          />
          <button
            type="button"
            onClick={() => setShowConfirm((v) => !v)}
            aria-label={showConfirm ? 'Hide password' : 'Show password'}
            style={{
              position: 'absolute',
              right: 12,
              top: '50%',
              transform: 'translateY(-50%)',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: '#9CA3AF',
              fontSize: 14,
              padding: 0,
            }}
          >
            {showConfirm ? '🙈' : '👁'}
          </button>
        </div>
      </div>

      {resetError && (
        <p
          className="text-[12px] leading-relaxed"
          style={{ color: '#8A1C1C' }}
        >
          {resetError}
        </p>
      )}

      <button
        type="button"
        onClick={() => handlePasswordReset()}
        disabled={
          resetStatus === 'loading' || !newPassword || !retypePassword
        }
        className="w-full rounded-[10px] py-3 text-[12px] uppercase tracking-wider font-semibold text-white disabled:opacity-50"
        style={{ backgroundColor: '#1A3C6B', letterSpacing: '0.1em' }}
      >
        {resetStatus === 'loading' ? 'UPDATING…' : 'SET PASSWORD'}
      </button>
    </div>
  )
}

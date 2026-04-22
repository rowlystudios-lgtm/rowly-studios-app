'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'

function ResetPasswordForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const mode = searchParams.get('mode')
  const supabase = createClient()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [status, setStatus] = useState<
    'checking' | 'ready' | 'loading' | 'success' | 'error' | 'invalid'
  >('checking')
  const [errorMsg, setErrorMsg] = useState('')

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session?.user?.email) {
        setEmail(data.session.user.email)
        setStatus('ready')
      } else {
        setStatus('invalid')
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleSubmit() {
    setErrorMsg('')
    if (password.length < 8) {
      setErrorMsg('Password must be at least 8 characters.')
      return
    }
    if (password !== confirm) {
      setErrorMsg('Passwords do not match.')
      return
    }
    setStatus('loading')
    const { error } = await supabase.auth.updateUser({ password })
    if (error) {
      setStatus('error')
      setErrorMsg(error.message)
      return
    }
    await supabase.auth.signOut()
    setStatus('success')
    setTimeout(() => {
      router.push('/login?message=Password+updated.+Please+sign+in.')
    }, 1500)
  }

  const isInvite = mode === 'invite'

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'linear-gradient(160deg, #2C4A7C 0%, #0F1B2E 100%)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'Montserrat, sans-serif',
        padding: 24,
      }}
    >
      {/* Logo */}
      <div
        style={{
          width: 56,
          height: 56,
          borderRadius: '50%',
          border: '2px solid rgba(255,255,255,0.25)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: 10,
          color: '#fff',
          fontSize: 17,
          fontWeight: 700,
        }}
      >
        RS
      </div>
      <p
        style={{
          color: 'rgba(255,255,255,0.55)',
          fontSize: 10,
          letterSpacing: '0.22em',
          marginBottom: 28,
        }}
      >
        ROWLY STUDIOS
      </p>

      {/* Card */}
      <div
        style={{
          background: '#FAF8F4',
          borderRadius: 16,
          padding: '36px 32px',
          width: '100%',
          maxWidth: 400,
          boxShadow: '0 24px 64px rgba(0,0,0,0.35)',
        }}
      >
        <h2
          style={{
            fontSize: 19,
            fontWeight: 700,
            color: '#0F1B2E',
            marginBottom: 6,
            textAlign: 'center',
            letterSpacing: '-0.01em',
          }}
        >
          {isInvite ? 'Set your password' : 'Reset your password'}
        </h2>
        <p
          style={{
            fontSize: 13,
            color: '#6B7280',
            textAlign: 'center',
            marginBottom: 24,
            lineHeight: 1.5,
          }}
        >
          {isInvite
            ? 'Create a password to access your Rowly Studios account.'
            : 'Enter and confirm your new password below.'}
        </p>

        {status === 'checking' && (
          <p
            style={{
              textAlign: 'center',
              color: '#9CA3AF',
              fontSize: 13,
            }}
          >
            Verifying…
          </p>
        )}

        {status === 'invalid' && (
          <div
            style={{
              background: '#FEF2F2',
              borderRadius: 8,
              padding: '14px 16px',
              textAlign: 'center',
            }}
          >
            <p
              style={{ color: '#DC2626', fontSize: 13, marginBottom: 12 }}
            >
              This link has expired or already been used.
            </p>
            <button
              onClick={() => router.push('/login')}
              style={{
                background: '#0F1B2E',
                color: '#fff',
                border: 'none',
                borderRadius: 8,
                padding: '10px 20px',
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
                letterSpacing: '0.06em',
                fontFamily: 'inherit',
              }}
            >
              BACK TO SIGN IN
            </button>
          </div>
        )}

        {status === 'success' && (
          <div
            style={{
              background: '#F0FDF4',
              borderRadius: 8,
              padding: '14px 16px',
              textAlign: 'center',
              color: '#16A34A',
              fontSize: 13,
            }}
          >
            Password updated. Redirecting to sign in…
          </div>
        )}

        {(status === 'ready' ||
          status === 'loading' ||
          status === 'error') && (
          <>
            {/* Email — pre-filled, read only */}
            <div style={{ marginBottom: 10 }}>
              <label
                style={{
                  fontSize: 10,
                  letterSpacing: '0.12em',
                  color: '#9CA3AF',
                  display: 'block',
                  marginBottom: 4,
                }}
              >
                EMAIL
              </label>
              <input
                type="email"
                value={email}
                readOnly
                style={{
                  width: '100%',
                  padding: '11px 14px',
                  borderRadius: 8,
                  border: '1.5px solid #E5E7EB',
                  fontSize: 13,
                  fontFamily: 'inherit',
                  boxSizing: 'border-box',
                  background: '#F3F4F6',
                  color: '#6B7280',
                  cursor: 'default',
                }}
              />
            </div>

            {/* New password */}
            <div style={{ marginBottom: 10 }}>
              <label
                style={{
                  fontSize: 10,
                  letterSpacing: '0.12em',
                  color: '#9CA3AF',
                  display: 'block',
                  marginBottom: 4,
                }}
              >
                NEW PASSWORD
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showPass ? 'text' : 'password'}
                  placeholder="At least 8 characters"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoFocus
                  style={{
                    width: '100%',
                    padding: '11px 40px 11px 14px',
                    borderRadius: 8,
                    border: '1.5px solid #D1D5DB',
                    fontSize: 13,
                    fontFamily: 'inherit',
                    boxSizing: 'border-box',
                    background: '#fff',
                    outline: 'none',
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowPass((v) => !v)}
                  aria-label={showPass ? 'Hide password' : 'Show password'}
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
                  {showPass ? '🙈' : '👁'}
                </button>
              </div>
            </div>

            {/* Retype password */}
            <div style={{ marginBottom: 20 }}>
              <label
                style={{
                  fontSize: 10,
                  letterSpacing: '0.12em',
                  color: '#9CA3AF',
                  display: 'block',
                  marginBottom: 4,
                }}
              >
                RETYPE PASSWORD
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showConfirm ? 'text' : 'password'}
                  placeholder="Confirm new password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
                  style={{
                    width: '100%',
                    padding: '11px 40px 11px 14px',
                    borderRadius: 8,
                    border: '1.5px solid #D1D5DB',
                    fontSize: 13,
                    fontFamily: 'inherit',
                    boxSizing: 'border-box',
                    background: '#fff',
                    outline: 'none',
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirm((v) => !v)}
                  aria-label={
                    showConfirm ? 'Hide password' : 'Show password'
                  }
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

            {errorMsg && (
              <p
                style={{
                  color: '#DC2626',
                  fontSize: 12,
                  marginBottom: 12,
                  textAlign: 'center',
                }}
              >
                {errorMsg}
              </p>
            )}

            <button
              onClick={handleSubmit}
              disabled={status === 'loading' || !password || !confirm}
              style={{
                width: '100%',
                padding: 13,
                background:
                  status === 'loading' ? '#9CA3AF' : '#0F1B2E',
                color: '#fff',
                border: 'none',
                borderRadius: 8,
                fontSize: 12,
                fontWeight: 700,
                letterSpacing: '0.1em',
                cursor: status === 'loading' ? 'wait' : 'pointer',
                fontFamily: 'inherit',
                marginBottom: 12,
              }}
            >
              {status === 'loading' ? 'UPDATING…' : 'SET PASSWORD'}
            </button>

            <button
              onClick={() => router.push('/login')}
              style={{
                width: '100%',
                padding: 11,
                background: 'none',
                color: '#9CA3AF',
                border: '1px solid #E5E7EB',
                borderRadius: 8,
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: '0.08em',
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              ← BACK TO SIGN IN
            </button>
          </>
        )}
      </div>
    </div>
  )
}

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetPasswordForm />
    </Suspense>
  )
}

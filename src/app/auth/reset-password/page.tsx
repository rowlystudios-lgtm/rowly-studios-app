'use client'

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'

export default function ResetPasswordPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const mode = searchParams.get('mode')
  const supabase = createClient()

  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [status, setStatus] = useState<
    'idle' | 'loading' | 'success' | 'error'
  >('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const [sessionReady, setSessionReady] = useState(false)

  useEffect(() => {
    // Handle hash-based tokens (implicit flow). Supabase puts access_token
    // in the URL hash on some flows; getSession() picks that up.
    const hash = typeof window !== 'undefined' ? window.location.hash : ''
    if (hash && hash.includes('access_token')) {
      supabase.auth.getSession().then(({ data }) => {
        if (data.session) setSessionReady(true)
        else
          setErrorMsg(
            'Link expired or already used. Please request a new one.'
          )
      })
    } else {
      // Code flow — session was set by the /auth/callback route already.
      supabase.auth.getSession().then(({ data }) => {
        if (data.session) setSessionReady(true)
        else
          setErrorMsg(
            'Link expired or already used. Please request a new one.'
          )
      })
    }
  }, [supabase])

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

    setStatus('success')

    // Redirect based on role.
    setTimeout(async () => {
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .single()

      if (profile?.role === 'admin') router.push('/admin')
      else router.push('/app')
    }, 1500)
  }

  const isInvite = mode === 'invite'

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #1E3A6B 0%, #0F1B2E 100%)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'Montserrat, sans-serif',
        padding: '24px',
      }}
    >
      {/* Logo */}
      <div
        style={{
          width: 56,
          height: 56,
          borderRadius: '50%',
          border: '2px solid rgba(255,255,255,0.3)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: 12,
          color: '#fff',
          fontSize: 18,
          fontWeight: 700,
          letterSpacing: 1,
        }}
      >
        RS
      </div>
      <p
        style={{
          color: 'rgba(255,255,255,0.7)',
          fontSize: 11,
          letterSpacing: '0.2em',
          marginBottom: 32,
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
          maxWidth: 420,
          boxShadow: '0 24px 64px rgba(0,0,0,0.3)',
        }}
      >
        <h2
          style={{
            fontSize: 20,
            fontWeight: 700,
            color: '#0F1B2E',
            marginBottom: 6,
            textAlign: 'center',
          }}
        >
          {isInvite ? 'Welcome — set your password' : 'Set a new password'}
        </h2>
        <p
          style={{
            fontSize: 13,
            color: '#6B7280',
            textAlign: 'center',
            marginBottom: 28,
          }}
        >
          {isInvite
            ? 'Create a password to access your Rowly Studios account.'
            : 'Choose a strong password for your account.'}
        </p>

        {!sessionReady && !errorMsg && (
          <p style={{ textAlign: 'center', color: '#6B7280', fontSize: 14 }}>
            Verifying link…
          </p>
        )}

        {errorMsg && (
          <div
            style={{
              background: '#FEF2F2',
              border: '1px solid #FECACA',
              borderRadius: 8,
              padding: '12px 16px',
              color: '#DC2626',
              fontSize: 13,
              marginBottom: 16,
              textAlign: 'center',
            }}
          >
            {errorMsg}
          </div>
        )}

        {status === 'success' && (
          <div
            style={{
              background: '#F0FDF4',
              border: '1px solid #BBF7D0',
              borderRadius: 8,
              padding: '12px 16px',
              color: '#16A34A',
              fontSize: 13,
              textAlign: 'center',
            }}
          >
            Password updated. Redirecting you now…
          </div>
        )}

        {sessionReady && status !== 'success' && (
          <>
            {/* Password */}
            <div style={{ position: 'relative', marginBottom: 12 }}>
              <input
                type={showPass ? 'text' : 'password'}
                placeholder="New password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                style={{
                  width: '100%',
                  padding: '12px 44px 12px 14px',
                  borderRadius: 8,
                  border: '1.5px solid #D1D5DB',
                  fontSize: 14,
                  fontFamily: 'inherit',
                  boxSizing: 'border-box',
                  outline: 'none',
                  background: '#fff',
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
                  padding: 0,
                  fontSize: 16,
                }}
              >
                {showPass ? '🙈' : '👁'}
              </button>
            </div>

            {/* Confirm */}
            <div style={{ position: 'relative', marginBottom: 8 }}>
              <input
                type={showConfirm ? 'text' : 'password'}
                placeholder="Confirm password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
                style={{
                  width: '100%',
                  padding: '12px 44px 12px 14px',
                  borderRadius: 8,
                  border: '1.5px solid #D1D5DB',
                  fontSize: 14,
                  fontFamily: 'inherit',
                  boxSizing: 'border-box',
                  outline: 'none',
                  background: '#fff',
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
                  padding: 0,
                  fontSize: 16,
                }}
              >
                {showConfirm ? '🙈' : '👁'}
              </button>
            </div>

            <p
              style={{
                fontSize: 11,
                color: '#9CA3AF',
                marginBottom: 20,
                paddingLeft: 2,
              }}
            >
              At least 8 characters
            </p>

            <button
              onClick={handleSubmit}
              disabled={status === 'loading' || !password || !confirm}
              style={{
                width: '100%',
                padding: '13px',
                background:
                  status === 'loading' ? '#9CA3AF' : '#1E3A6B',
                color: '#fff',
                border: 'none',
                borderRadius: 8,
                fontSize: 13,
                fontWeight: 700,
                letterSpacing: '0.08em',
                cursor: status === 'loading' ? 'wait' : 'pointer',
                fontFamily: 'inherit',
              }}
            >
              {status === 'loading' ? 'UPDATING…' : 'SET PASSWORD'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}

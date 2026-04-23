'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { RSLogo } from '@/components/RSLogo'
import { PasswordInput } from '@/components/PasswordInput'
import { createClient } from '@/lib/supabase-browser'

type Status = 'checking' | 'ready' | 'submitting' | 'error' | 'no-session'

export default function WelcomePage() {
  const router = useRouter()
  const supabase = createClient()

  const [status, setStatus] = useState<Status>('checking')
  const [firstName, setFirstName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [errorMsg, setErrorMsg] = useState('')

  // On mount, check session. The Supabase browser client auto-parses the
  // URL fragment from the magic link so by the time getSession() resolves
  // we should have a session.
  useEffect(() => {
    let alive = true
    ;(async () => {
      const { data } = await supabase.auth.getSession()
      if (!alive) return
      if (data.session) {
        const u = data.session.user
        setEmail(u.email ?? '')
        const meta = u.user_metadata as Record<string, unknown> | null
        setFirstName(
          (meta?.first_name as string | undefined) ??
            (meta?.firstName as string | undefined) ??
            ''
        )
        setStatus('ready')
      } else {
        setStatus('no-session')
      }
    })()
    return () => {
      alive = false
    }
  }, [supabase])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErrorMsg('')
    if (password.length < 8) {
      setErrorMsg('Password must be at least 8 characters.')
      return
    }
    if (password !== confirm) {
      setErrorMsg('Passwords do not match.')
      return
    }
    setStatus('submitting')
    const { error } = await supabase.auth.updateUser({ password })
    if (error) {
      setStatus('error')
      setErrorMsg(error.message)
      return
    }
    router.replace('/app')
  }

  if (status === 'checking') {
    return (
      <main
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#f4f1ea',
          padding: '0 24px',
        }}
      >
        <div style={{ color: '#7A90AA', fontSize: 13 }}>Loading…</div>
      </main>
    )
  }

  if (status === 'no-session') {
    return (
      <main
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#f4f1ea',
          padding: '0 24px',
        }}
      >
        <div
          style={{
            maxWidth: 380,
            width: '100%',
            background: '#fff',
            borderRadius: 14,
            padding: 32,
            boxShadow: '0 2px 12px rgba(26,60,107,0.06)',
            textAlign: 'center',
          }}
        >
          <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'center' }}>
            <RSLogo size={32} />
          </div>
          <h1
            style={{
              fontSize: 18,
              fontWeight: 600,
              color: '#1A3C6B',
              margin: '0 0 8px 0',
            }}
          >
            This link has expired
          </h1>
          <p style={{ fontSize: 13, color: '#666', margin: '0 0 24px 0', lineHeight: 1.5 }}>
            Welcome links are single-use. Ask Rowly Studios to resend your
            invitation, or sign in if you already have an account.
          </p>
          <Link
            href="/login"
            style={{
              display: 'inline-block',
              background: '#1A3C6B',
              color: '#fff',
              fontSize: 13,
              fontWeight: 600,
              padding: '12px 24px',
              borderRadius: 10,
              textDecoration: 'none',
            }}
          >
            Go to sign in
          </Link>
        </div>
      </main>
    )
  }

  return (
    <main
      style={{
        minHeight: '100vh',
        background: '#f4f1ea',
        padding: '40px 24px',
      }}
    >
      <div style={{ maxWidth: 440, margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 24 }}>
          <RSLogo size={40} />
        </div>

        <div
          style={{
            background: '#fff',
            borderRadius: 14,
            padding: 32,
            boxShadow: '0 2px 12px rgba(26,60,107,0.06)',
          }}
        >
          <h1
            style={{
              fontSize: 20,
              fontWeight: 600,
              color: '#1A3C6B',
              margin: '0 0 8px 0',
            }}
          >
            Welcome{firstName ? `, ${firstName}` : ''}
          </h1>
          <p style={{ fontSize: 13, color: '#666', margin: '0 0 24px 0', lineHeight: 1.5 }}>
            Set a password to finish creating your account. Once you set
            it, you&apos;re signed in.
          </p>

          {email && (
            <div
              style={{
                marginBottom: 20,
                fontSize: 11,
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                color: '#888',
              }}
            >
              Account email
              <br />
              <span
                style={{
                  fontSize: 13,
                  textTransform: 'none',
                  letterSpacing: 'normal',
                  color: '#1A3C6B',
                }}
              >
                {email}
              </span>
            </div>
          )}

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: '0.12em',
                  textTransform: 'uppercase',
                  color: '#888',
                  marginBottom: 6,
                }}
              >
                Create password
              </label>
              <PasswordInput
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                placeholder="At least 8 characters"
                required
              />
            </div>
            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: '0.12em',
                  textTransform: 'uppercase',
                  color: '#888',
                  marginBottom: 6,
                }}
              >
                Confirm password
              </label>
              <PasswordInput
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                autoComplete="new-password"
                placeholder="Repeat password"
                required
              />
            </div>

            {errorMsg && (
              <div style={{ fontSize: 13, color: '#dc2626' }}>{errorMsg}</div>
            )}

            <button
              type="submit"
              disabled={status === 'submitting'}
              style={{
                width: '100%',
                background: '#1A3C6B',
                color: '#fff',
                fontSize: 14,
                fontWeight: 600,
                padding: '14px 0',
                borderRadius: 10,
                border: 'none',
                cursor: status === 'submitting' ? 'not-allowed' : 'pointer',
                opacity: status === 'submitting' ? 0.6 : 1,
              }}
            >
              {status === 'submitting' ? 'Creating your account…' : 'Create account'}
            </button>
          </form>
        </div>

        <div
          style={{
            background: 'rgba(255,255,255,0.6)',
            borderRadius: 14,
            padding: 18,
            marginTop: 16,
            fontSize: 12,
            color: '#555',
            lineHeight: 1.55,
          }}
        >
          <strong style={{ color: '#1A3C6B' }}>On your phone?</strong> After
          signing in, install Rowly Studios as an app:
          <br />
          iPhone (Safari): <em>Share</em> → <em>Add to Home Screen</em>.
          <br />
          Android (Chrome): <em>⋮ menu</em> → <em>Install app</em>.
          <br />
          <Link
            href="/get-started"
            style={{
              display: 'inline-block',
              marginTop: 6,
              textDecoration: 'underline',
              color: '#1A3C6B',
            }}
          >
            Detailed install steps →
          </Link>
        </div>
      </div>
    </main>
  )
}

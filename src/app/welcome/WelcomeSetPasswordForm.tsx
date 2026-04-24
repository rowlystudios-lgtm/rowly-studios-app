'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { consumeWelcomeTokenAction } from './actions'
import { createClient } from '@/lib/supabase-browser'

export default function WelcomeSetPasswordForm({
  token,
  email,
  firstName,
}: {
  token: string
  email: string
  firstName: string
}) {
  const router = useRouter()
  const supabase = createClient()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [status, setStatus] = useState<'idle' | 'submitting' | 'signing_in'>(
    'idle'
  )
  const [errorMsg, setErrorMsg] = useState('')

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
    const res = await consumeWelcomeTokenAction({ token, password })
    if (!res.ok) {
      setStatus('idle')
      setErrorMsg(res.error)
      // Special handling: if the token was already consumed in another
      // tab/device, direct them to sign in.
      if (res.code === 'consumed') {
        router.replace('/login')
      }
      return
    }
    setStatus('signing_in')
    const { error: signInErr } = await supabase.auth.signInWithPassword({
      email,
      password,
    })
    if (signInErr) {
      setStatus('idle')
      setErrorMsg(signInErr.message)
      return
    }
    router.replace('/app')
  }

  const disabled = status !== 'idle'

  return (
    <form onSubmit={handleSubmit}>
      <h1
        style={{
          margin: 0,
          fontFamily: "'Playfair Display',Georgia,serif",
          fontSize: 24,
          lineHeight: 1.3,
          color: '#1A2030',
          fontWeight: 500,
        }}
      >
        Welcome{firstName ? `, ${firstName}` : ''}
      </h1>
      <p
        style={{
          margin: '10px 0 22px 0',
          fontFamily: "'DM Sans',Helvetica,Arial,sans-serif",
          fontSize: 14,
          lineHeight: 1.6,
          color: '#4A5368',
        }}
      >
        Set a password to finish creating your account. Once you set it,
        you&apos;re signed in.
      </p>

      <div
        style={{
          marginBottom: 6,
          fontSize: 11,
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
          color: '#8A96AA',
          fontWeight: 600,
        }}
      >
        Account email
      </div>
      <div style={{ marginBottom: 20, fontSize: 14, color: '#1A2030' }}>
        {email}
      </div>

      <label style={{ display: 'block', marginBottom: 14 }}>
        <span
          style={{
            display: 'block',
            marginBottom: 6,
            fontSize: 12,
            fontWeight: 600,
            color: '#1A2030',
          }}
        >
          Create password
        </span>
        <input
          type="password"
          autoComplete="new-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="At least 8 characters"
          disabled={disabled}
          style={{
            width: '100%',
            padding: '12px 14px',
            border: '1px solid #D0D3DC',
            borderRadius: 8,
            fontSize: 14,
            fontFamily: "'DM Sans',Helvetica,Arial,sans-serif",
            color: '#1A2030',
            background: disabled ? '#F4F7FC' : '#FFFFFF',
            boxSizing: 'border-box',
            outline: 'none',
          }}
        />
      </label>

      <label style={{ display: 'block', marginBottom: 18 }}>
        <span
          style={{
            display: 'block',
            marginBottom: 6,
            fontSize: 12,
            fontWeight: 600,
            color: '#1A2030',
          }}
        >
          Confirm password
        </span>
        <input
          type="password"
          autoComplete="new-password"
          required
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          placeholder="Repeat password"
          disabled={disabled}
          style={{
            width: '100%',
            padding: '12px 14px',
            border: '1px solid #D0D3DC',
            borderRadius: 8,
            fontSize: 14,
            fontFamily: "'DM Sans',Helvetica,Arial,sans-serif",
            color: '#1A2030',
            background: disabled ? '#F4F7FC' : '#FFFFFF',
            boxSizing: 'border-box',
            outline: 'none',
          }}
        />
      </label>

      {errorMsg && (
        <div style={{ marginBottom: 14, fontSize: 13, color: '#C23B22' }}>
          {errorMsg}
        </div>
      )}

      <button
        type="submit"
        disabled={disabled}
        style={{
          width: '100%',
          padding: '14px 20px',
          background: disabled ? '#8A96AA' : '#2B4780',
          color: '#FFFFFF',
          border: 'none',
          borderRadius: 6,
          fontFamily: "'brandon-grotesque','Helvetica Neue',Arial,sans-serif",
          fontSize: 13,
          fontWeight: 700,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          cursor: disabled ? 'not-allowed' : 'pointer',
        }}
      >
        {status === 'submitting'
          ? 'Creating your account…'
          : status === 'signing_in'
            ? 'Signing you in…'
            : 'Create account'}
      </button>
    </form>
  )
}

'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { RSLogo } from '@/components/RSLogo'
import { createClient } from '@/lib/supabase-browser'

type Status = 'checking' | 'idle' | 'submitting' | 'sent' | 'error'

export default function SignupPage() {
  const router = useRouter()
  const supabase = createClient()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [status, setStatus] = useState<Status>('checking')
  const [errorMsg, setErrorMsg] = useState('')
  const [needsConfirm, setNeedsConfirm] = useState(false)

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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErrorMsg('')

    if (password.length < 8) {
      setErrorMsg('Password must be at least 8 characters.')
      setStatus('error')
      return
    }

    setStatus('submitting')

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    })

    if (error) {
      setStatus('error')
      setErrorMsg(error.message)
      return
    }

    if (data.session) {
      router.replace('/app')
      router.refresh()
      return
    }

    setNeedsConfirm(true)
    setStatus('sent')
  }

  if (status === 'checking') {
    return (
      <main className="min-h-[100dvh] flex items-center justify-center rs-bg-fusion">
        <RSLogo size={48} />
      </main>
    )
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
        {needsConfirm ? (
          <div className="text-center space-y-3">
            <p className="text-sm font-semibold text-rs-blue-logo uppercase tracking-wide">
              Confirm your email
            </p>
            <p className="text-[13px] text-rs-blue-fusion leading-relaxed">
              We sent a confirmation link to <strong>{email}</strong>. Open it to finish creating your account, then sign in.
            </p>
            <Link
              href="/login"
              className="inline-block text-[11px] uppercase tracking-wider text-rs-blue-fusion/70 underline mt-4"
            >
              Back to sign in
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3">
            <label className="block text-[11px] uppercase tracking-wider font-semibold text-rs-blue-fusion">
              Create account
            </label>

            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@email.com"
              className="w-full px-3 py-3 text-[14px] text-rs-ink bg-white rounded-[10px] border border-rs-blue-fusion/15 focus:border-rs-blue-logo focus:outline-none"
              disabled={status === 'submitting'}
              autoComplete="email"
            />

            <input
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password (min 8 characters)"
              className="w-full px-3 py-3 text-[14px] text-rs-ink bg-white rounded-[10px] border border-rs-blue-fusion/15 focus:border-rs-blue-logo focus:outline-none"
              disabled={status === 'submitting'}
              autoComplete="new-password"
            />

            <button
              type="submit"
              disabled={status === 'submitting' || !email || !password}
              className="rs-btn w-full disabled:opacity-50"
            >
              {status === 'submitting' ? 'Creating account…' : 'Create account'}
            </button>

            {status === 'error' && errorMsg && (
              <p className="text-[11px] text-red-700 pt-1 leading-relaxed">{errorMsg}</p>
            )}

            <p className="text-[11px] text-rs-blue-fusion/70 text-center pt-3 leading-relaxed">
              Already have an account?{' '}
              <Link href="/login" className="underline">Sign in</Link>
            </p>
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
  )
}

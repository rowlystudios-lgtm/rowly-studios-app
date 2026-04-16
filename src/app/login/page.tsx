'use client'

import { useState } from 'react'
import Link from 'next/link'
import { RSLogo } from '@/components/RSLogo'
import { createClient } from '@/lib/supabase-browser'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setStatus('sending')
    setErrorMsg('')

    const supabase = createClient()
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    })

    if (error) {
      setStatus('error')
      setErrorMsg(error.message)
    } else {
      setStatus('sent')
    }
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
        {status === 'sent' ? (
          <div className="text-center space-y-3">
            <p className="text-sm font-semibold text-rs-blue-logo uppercase tracking-wide">
              Check your inbox
            </p>
            <p className="text-[13px] text-rs-blue-fusion leading-relaxed">
              We sent a magic link to <strong>{email}</strong>. Tap it on your phone
              to sign in.
            </p>
            <button
              onClick={() => setStatus('idle')}
              className="text-[11px] uppercase tracking-wider text-rs-blue-fusion/70 underline mt-4"
            >
              Use a different email
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3">
            <label className="block text-[11px] uppercase tracking-wider font-semibold text-rs-blue-fusion">
              Sign in with email
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@email.com"
              className="w-full px-3 py-3 text-[14px] text-rs-ink bg-white rounded-[10px] border border-rs-blue-fusion/15 focus:border-rs-blue-logo focus:outline-none"
              disabled={status === 'sending'}
            />
            <button
              type="submit"
              disabled={status === 'sending' || !email}
              className="rs-btn w-full disabled:opacity-50"
            >
              {status === 'sending' ? 'Sending…' : 'Send magic link'}
            </button>
            {status === 'error' && (
              <p className="text-[11px] text-red-700 pt-1">{errorMsg}</p>
            )}
            <p className="text-[11px] text-rs-blue-fusion/70 text-center pt-3 leading-relaxed">
              No passwords. We&apos;ll email you a secure link to sign in.
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

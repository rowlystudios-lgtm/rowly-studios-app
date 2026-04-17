'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { RSLogo } from '@/components/RSLogo'
import { createClient } from '@/lib/supabase-browser'

export default function LoginPage() {
  const router = useRouter()
  const supabase = createClient()
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error' | 'checking'>('checking')
  const [errorMsg, setErrorMsg] = useState('')

  // If already signed in, skip straight to the app
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
    setStatus('sending')
    setErrorMsg('')

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    })

    if (error) {
      setStatus('error')
      if (error.message.toLowerCase().includes('rate limit') || error.message.includes('429')) {
        setErrorMsg('You\'ve requested a link recently — please wait 60 seconds and try again, or check your inbox for the previous link.')
      } else {
        setErrorMsg(error.message)
      }
    } else {
      setStatus('sent')
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
              We sent a magic link to <strong>{email}</strong>. Tap it on this device
              to sign in — it&apos;ll open the app directly.
            </p>
            <p className="text-[11px] text-rs-blue-fusion/60 leading-relaxed pt-2">
              Tip: open the link on whichever device you want to use the app on.
              It only works once and expires after 1 hour.
            </p>
            <button
              onClick={() => {
                setStatus('idle')
                setEmail('')
              }}
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
              autoComplete="email"
            />
            <button
              type="submit"
              disabled={status === 'sending' || !email}
              className="rs-btn w-full disabled:opacity-50"
            >
              {status === 'sending' ? 'Sending…' : 'Send magic link'}
            </button>
            {status === 'error' && (
              <p className="text-[11px] text-red-700 pt-1 leading-relaxed">{errorMsg}</p>
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

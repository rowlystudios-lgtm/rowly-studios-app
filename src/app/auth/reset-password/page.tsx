'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { RSLogo } from '@/components/RSLogo'
import { createClient } from '@/lib/supabase-browser'

type Status = 'checking' | 'no-session' | 'idle' | 'submitting' | 'done' | 'error'

export default function ResetPasswordPage() {
  const router = useRouter()
  const supabase = createClient()

  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [status, setStatus] = useState<Status>('checking')
  const [errorMsg, setErrorMsg] = useState('')

  useEffect(() => {
    async function check() {
      const { data: { user } } = await supabase.auth.getUser()
      setStatus(user ? 'idle' : 'no-session')
    }
    check()
  }, [supabase])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErrorMsg('')

    if (password.length < 8) {
      setErrorMsg('Password must be at least 8 characters.')
      setStatus('error')
      return
    }
    if (password !== confirm) {
      setErrorMsg('Passwords do not match.')
      setStatus('error')
      return
    }

    setStatus('submitting')
    const { error } = await supabase.auth.updateUser({ password })

    if (error) {
      setStatus('error')
      setErrorMsg(error.message)
      return
    }

    setStatus('done')
    setTimeout(() => {
      router.replace('/app')
      router.refresh()
    }, 1200)
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
        {status === 'checking' && (
          <p className="text-[13px] text-rs-blue-fusion text-center">Loading…</p>
        )}

        {status === 'no-session' && (
          <div className="text-center space-y-3">
            <p className="text-sm font-semibold text-rs-blue-logo uppercase tracking-wide">
              Link expired
            </p>
            <p className="text-[13px] text-rs-blue-fusion leading-relaxed">
              This reset link is no longer valid. Request a new one from the sign-in page.
            </p>
            <Link
              href="/login"
              className="inline-block text-[11px] uppercase tracking-wider text-rs-blue-fusion/70 underline mt-4"
            >
              Back to sign in
            </Link>
          </div>
        )}

        {status === 'done' && (
          <div className="text-center space-y-3">
            <p className="text-sm font-semibold text-rs-blue-logo uppercase tracking-wide">
              Password updated
            </p>
            <p className="text-[13px] text-rs-blue-fusion leading-relaxed">
              Signing you in…
            </p>
          </div>
        )}

        {(status === 'idle' || status === 'submitting' || status === 'error') && (
          <form onSubmit={handleSubmit} className="space-y-3">
            <label className="block text-[11px] uppercase tracking-wider font-semibold text-rs-blue-fusion">
              Set a new password
            </label>

            <input
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="New password (min 8 characters)"
              className="w-full px-3 py-3 text-[14px] text-rs-ink bg-white rounded-[10px] border border-rs-blue-fusion/15 focus:border-rs-blue-logo focus:outline-none"
              disabled={status === 'submitting'}
              autoComplete="new-password"
            />

            <input
              type="password"
              required
              minLength={8}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="Confirm new password"
              className="w-full px-3 py-3 text-[14px] text-rs-ink bg-white rounded-[10px] border border-rs-blue-fusion/15 focus:border-rs-blue-logo focus:outline-none"
              disabled={status === 'submitting'}
              autoComplete="new-password"
            />

            <button
              type="submit"
              disabled={status === 'submitting' || !password || !confirm}
              className="rs-btn w-full disabled:opacity-50"
            >
              {status === 'submitting' ? 'Updating…' : 'Update password'}
            </button>

            {status === 'error' && errorMsg && (
              <p className="text-[11px] text-red-700 pt-1 leading-relaxed">{errorMsg}</p>
            )}
          </form>
        )}
      </div>
    </main>
  )
}

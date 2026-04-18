'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth-context'

export function AdminGuard({ children }: { children: React.ReactNode }) {
  const { user, profile, session, loading } = useAuth()
  const router = useRouter()
  const [verified, setVerified] = useState<boolean | null>(null)

  useEffect(() => {
    if (loading) return

    if (!user || !session) {
      router.replace('/login')
      return
    }

    if (profile?.role !== 'admin') {
      router.replace('/app')
      return
    }

    const lastSignIn = new Date(user.last_sign_in_at ?? 0)
    const pinVerified = profile.pin_verified_at
      ? new Date(profile.pin_verified_at)
      : null

    if (pinVerified && pinVerified > lastSignIn) {
      setVerified(true)
    } else {
      setVerified(false)
      router.replace('/login?admin=1&reason=pin')
    }
  }, [loading, user, session, profile, router])

  if (loading || verified === null) {
    return <GuardSpinner />
  }

  if (!verified) return null

  return <>{children}</>
}

function GuardSpinner() {
  return (
    <div
      style={{
        minHeight: '100dvh',
        background: '#1A3C6B',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div
        style={{
          width: 28,
          height: 28,
          border: '2px solid #2E5099',
          borderTopColor: '#AABDE0',
          borderRadius: '50%',
          animation: 'rs-admin-spin 0.8s linear infinite',
        }}
      />
      <style>{`@keyframes rs-admin-spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}

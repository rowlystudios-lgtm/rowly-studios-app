'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth-context'

export function LoadingScreen() {
  return (
    <div
      style={{
        minHeight: '100dvh',
        background: '#0a0a0a',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div
        style={{
          width: 32,
          height: 32,
          border: '2px solid #1A3C6B',
          borderTopColor: '#AABDE0',
          borderRadius: '50%',
          animation: 'rs-spin 0.8s linear infinite',
        }}
      />
      <style>{`@keyframes rs-spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}

export function AuthGate({ children }: { children: React.ReactNode }) {
  const { user, profile, loading } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (!loading && !user) {
      router.replace('/login')
    }
  }, [loading, user, router])

  if (loading) return <LoadingScreen />
  if (!user || !profile) return <LoadingScreen />

  return <>{children}</>
}

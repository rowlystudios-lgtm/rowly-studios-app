'use client'

import { useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useAuth, roleOf } from '@/lib/auth-context'

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

// Paths only admins can access.
const ADMIN_ONLY_PREFIXES = ['/app/talent', '/app/clients', '/app/jobs']
// Paths only clients can access.
const CLIENT_ONLY_PREFIXES = ['/app/post-job', '/app/roster', '/app/account']
// Paths only talent can access.
const TALENT_ONLY_PREFIXES = ['/app/calendar', '/app/profile', '/app/history']

function isBlocked(path: string, role: 'talent' | 'client' | 'admin'): boolean {
  if (role === 'admin') return false
  if (role === 'client') {
    return ADMIN_ONLY_PREFIXES.some((p) => path.startsWith(p))
  }
  if (role === 'talent') {
    return (
      ADMIN_ONLY_PREFIXES.some((p) => path.startsWith(p)) ||
      CLIENT_ONLY_PREFIXES.some((p) => path.startsWith(p))
    )
  }
  return false
}

function isRoleMismatched(path: string, role: 'talent' | 'client' | 'admin'): boolean {
  // Admins can go anywhere.
  if (role === 'admin') return false
  // Talent-only routes → block non-talent.
  if (TALENT_ONLY_PREFIXES.some((p) => path.startsWith(p)) && role !== 'talent') return true
  // Client-only routes → block non-client.
  if (CLIENT_ONLY_PREFIXES.some((p) => path.startsWith(p)) && role !== 'client') return true
  return false
}

export function AuthGate({ children }: { children: React.ReactNode }) {
  const { user, profile, loading } = useAuth()
  const router = useRouter()
  const pathname = usePathname()
  const role = roleOf(profile)

  useEffect(() => {
    if (loading) return
    if (!user) {
      router.replace('/login')
      return
    }
    if (!profile) return
    if (isBlocked(pathname, role) || isRoleMismatched(pathname, role)) {
      router.replace('/app')
    }
  }, [loading, user, profile, pathname, role, router])

  if (loading) return <LoadingScreen />
  if (!user || !profile) return <LoadingScreen />
  if (isBlocked(pathname, role) || isRoleMismatched(pathname, role)) {
    return <LoadingScreen />
  }

  return <>{children}</>
}

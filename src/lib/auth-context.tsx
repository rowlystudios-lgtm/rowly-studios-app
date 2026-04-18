'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import type { User, Session, SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase-browser'
import type { Profile, TalentProfile, UserRole } from '@/lib/types'

export type FullProfile = Profile & {
  talent_profiles?: TalentProfile[] | null
}

type AuthCtx = {
  user: User | null
  session: Session | null
  profile: FullProfile | null
  loading: boolean
  supabase: SupabaseClient
  refresh: () => Promise<void>
  updateProfile: (patch: Partial<FullProfile>) => void
}

const supabase = createClient()

const AuthContext = createContext<AuthCtx>({
  user: null,
  session: null,
  profile: null,
  loading: true,
  supabase,
  refresh: async () => {},
  updateProfile: () => {},
})

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<FullProfile | null>(null)
  const [loading, setLoading] = useState(true)

  async function loadProfile(userId: string) {
    const { data } = await supabase
      .from('profiles')
      .select('*, talent_profiles(*)')
      .eq('id', userId)
      .maybeSingle()
    setProfile((data as FullProfile | null) ?? null)
    setLoading(false)
  }

  function updateProfile(patch: Partial<FullProfile>) {
    setProfile((p) => (p ? { ...p, ...patch } : (patch as FullProfile)))
  }

  async function refresh() {
    const { data: { session: s } } = await supabase.auth.getSession()
    setSession(s)
    setUser(s?.user ?? null)
    if (s?.user) {
      await loadProfile(s.user.id)
    } else {
      setProfile(null)
      setLoading(false)
    }
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setUser(session?.user ?? null)
      if (session?.user) {
        loadProfile(session.user.id)
      } else {
        setLoading(false)
      }
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      setUser(session?.user ?? null)
      if (session?.user) {
        loadProfile(session.user.id)
      } else {
        setProfile(null)
        setLoading(false)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  return (
    <AuthContext.Provider value={{ user, session, profile, loading, supabase, refresh, updateProfile }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}

export function roleOf(profile: FullProfile | null): UserRole {
  return (profile?.role as UserRole) ?? 'talent'
}

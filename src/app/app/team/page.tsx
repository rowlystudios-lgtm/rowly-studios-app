'use client'

import { useEffect, useState } from 'react'
import { useAuth } from '@/lib/auth-context'
import { Avatar } from '@/components/Avatar'
import { DEPARTMENT_LABELS, type Department } from '@/lib/types'

type TeamMember = {
  id: string
  full_name: string | null
  email: string | null
  role: string
  verified: boolean
  avatar_url: string | null
  talent_profiles: Array<{
    department: Department | null
    primary_role: string | null
  }> | null
}

export default function TeamPage() {
  const { user, supabase } = useAuth()
  const [list, setList] = useState<TeamMember[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function load() {
      const { data } = await supabase
        .from('profiles')
        .select('id, full_name, email, role, verified, avatar_url, talent_profiles(department, primary_role)')
        .eq('verified', true)
        .eq('role', 'talent')
        .order('full_name', { ascending: true, nullsFirst: false })
      if (cancelled) return
      setList((data as TeamMember[] | null) ?? [])
      setLoading(false)
    }
    load()
    return () => {
      cancelled = true
    }
  }, [supabase])

  return (
    <main className="px-5 py-6 max-w-md mx-auto">
      <h1 className="text-[22px] font-semibold text-rs-blue-logo">The team</h1>
      <p className="text-[11px] uppercase tracking-widest text-rs-blue-fusion/60 font-semibold mt-1 mb-5">
        {loading ? 'Loading…' : `${list.length} verified ${list.length === 1 ? 'contributor' : 'contributors'}`}
      </p>

      {!loading && list.length === 0 ? (
        <div className="bg-white rounded-rs p-5 border border-rs-blue-fusion/10">
          <p className="text-[13px] text-rs-blue-fusion leading-relaxed">
            No verified talent yet. As admin verifies team members, they&apos;ll appear here
            so clients can browse and request bookings.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {list.map((m) => {
            const talent = m.talent_profiles?.[0] ?? null
            const isMe = m.id === user?.id
            return (
              <div
                key={m.id}
                className="bg-white rounded-rs p-3 border border-rs-blue-fusion/10 flex items-center gap-3"
              >
                <Avatar
                  url={m.avatar_url}
                  name={m.full_name ?? m.email ?? null}
                  size={44}
                  className="shrink-0"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-[13px] font-bold text-rs-blue-logo truncate">
                      {m.full_name || m.email}
                    </p>
                    {isMe && (
                      <span className="text-[9px] bg-rs-blue-fusion text-rs-cream px-1.5 py-0.5 rounded-full font-semibold tracking-wider uppercase">
                        You
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-rs-blue-fusion/70 font-medium truncate mt-0.5">
                    {talent?.primary_role || 'Role not set'}
                    {talent?.department && ` · ${DEPARTMENT_LABELS[talent.department as Department]}`}
                  </p>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </main>
  )
}

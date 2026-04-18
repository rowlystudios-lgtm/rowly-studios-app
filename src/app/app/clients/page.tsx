'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useAuth } from '@/lib/auth-context'
import { Avatar } from '@/components/Avatar'
import { PageShell, TEXT_MUTED, TEXT_PRIMARY } from '@/components/PageShell'

const CARD_BG = '#2E5099'
const CARD_BORDER = 'rgba(170,189,224,0.15)'

type Row = {
  id: string
  first_name: string | null
  last_name: string | null
  full_name: string | null
  email: string | null
  phone: string | null
  city: string | null
  avatar_url: string | null
  created_at: string | null
  client_profiles:
    | { company_name: string | null; industry: string | null }
    | { company_name: string | null; industry: string | null }[]
    | null
}

function unwrap<T>(v: T | T[] | null): T | null {
  if (!v) return null
  return Array.isArray(v) ? v[0] ?? null : v
}

function fullName(r: Row): string {
  return (
    [r.first_name, r.last_name].filter(Boolean).join(' ') ||
    r.full_name ||
    r.email ||
    'Unnamed'
  )
}

export default function AdminClientsPage() {
  const { supabase } = useAuth()
  const [rows, setRows] = useState<Row[]>([])
  const [counts, setCounts] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    async function load() {
      const { data, error } = await supabase
        .from('profiles')
        .select(
          `id, first_name, last_name, full_name, email, phone, city, avatar_url, created_at,
           client_profiles (company_name, industry)`
        )
        .eq('role', 'client')
        .order('last_name')

      if (cancelled) return
      if (error) {
        setError(error.message)
        setLoading(false)
        return
      }
      const list = (data ?? []) as Row[]
      setRows(list)

      // Fetch job counts per client
      const ids = list.map((r) => r.id)
      if (ids.length) {
        const { data: jobs } = await supabase
          .from('jobs')
          .select('client_id')
          .in('client_id', ids)
        if (cancelled) return
        const map: Record<string, number> = {}
        for (const j of jobs ?? []) {
          if (!j.client_id) continue
          map[j.client_id] = (map[j.client_id] ?? 0) + 1
        }
        setCounts(map)
      }
      setLoading(false)
    }
    load()
    return () => {
      cancelled = true
    }
  }, [supabase])

  return (
    <PageShell>
      <h1 style={{ fontSize: 22, fontWeight: 600, marginBottom: 4 }}>Clients</h1>
      <p style={{ fontSize: 12, color: TEXT_MUTED, marginBottom: 16 }}>
        {loading ? 'Loading…' : `${rows.length} client${rows.length === 1 ? '' : 's'}`}
      </p>

      {error && (
        <p style={{ fontSize: 13, color: '#fca5a5', marginBottom: 10 }}>{error}</p>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {rows.map((r) => {
          const cp = unwrap(r.client_profiles)
          const name = fullName(r)
          const jobCount = counts[r.id] ?? 0
          return (
            <Link
              key={r.id}
              href={`/app/clients/${r.id}`}
              style={{
                background: CARD_BG,
                border: `1px solid ${CARD_BORDER}`,
                borderRadius: 12,
                padding: '10px 12px',
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                color: TEXT_PRIMARY,
                textDecoration: 'none',
              }}
            >
              <Avatar url={r.avatar_url} name={name} size={40} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <p
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {name}
                  {cp?.company_name && (
                    <span style={{ color: TEXT_MUTED, fontWeight: 400 }}>
                      {' · '}
                      {cp.company_name}
                    </span>
                  )}
                </p>
                <p
                  style={{
                    fontSize: 11,
                    color: TEXT_MUTED,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {[r.city, r.email].filter(Boolean).join(' · ')}
                </p>
              </div>
              <span
                style={{
                  fontSize: 11,
                  color: TEXT_MUTED,
                  padding: '4px 10px',
                  borderRadius: 999,
                  background: 'rgba(170,189,224,0.1)',
                  whiteSpace: 'nowrap',
                  flexShrink: 0,
                }}
              >
                {jobCount} job{jobCount === 1 ? '' : 's'}
              </span>
            </Link>
          )
        })}
      </div>
    </PageShell>
  )
}

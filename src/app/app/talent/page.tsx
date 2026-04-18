'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useAuth } from '@/lib/auth-context'
import { Avatar } from '@/components/Avatar'
import { PageShell, TEXT_MUTED, TEXT_PRIMARY } from '@/components/PageShell'
import { DEPARTMENT_LABELS, type Department } from '@/lib/types'

const CARD_BG = '#2E5099'
const CARD_BORDER = 'rgba(170,189,224,0.15)'
const AVAILABLE_GREEN = '#4ade80'

type Row = {
  id: string
  first_name: string | null
  last_name: string | null
  full_name: string | null
  avatar_url: string | null
  city: string | null
  verified: boolean
  available: boolean
  created_at: string | null
  talent_profiles:
    | { department: Department | null; day_rate_cents: number | null }
    | { department: Department | null; day_rate_cents: number | null }[]
    | null
}

function unwrap<T>(v: T | T[] | null): T | null {
  if (!v) return null
  return Array.isArray(v) ? v[0] ?? null : v
}

function fullName(row: Row): string {
  return (
    [row.first_name, row.last_name].filter(Boolean).join(' ') ||
    row.full_name ||
    'Unnamed'
  )
}

export default function AdminTalentPage() {
  const { supabase } = useAuth()
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [toggling, setToggling] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      const { data, error } = await supabase
        .from('profiles')
        .select(
          `id, first_name, last_name, full_name, avatar_url,
           city, verified, available, created_at,
           talent_profiles (department, day_rate_cents)`
        )
        .eq('role', 'talent')
        .order('last_name')

      if (cancelled) return
      if (error) {
        setError(error.message)
        setLoading(false)
        return
      }
      setRows((data ?? []) as Row[])
      setLoading(false)
    }
    load()
    return () => {
      cancelled = true
    }
  }, [supabase])

  async function toggleVerified(row: Row) {
    if (toggling) return
    const snapshot = rows
    const next = !row.verified
    setRows((rs) =>
      rs.map((r) => (r.id === row.id ? { ...r, verified: next } : r))
    )
    setToggling(row.id)
    const { error } = await supabase
      .from('profiles')
      .update({
        verified: next,
        verified_at: next ? new Date().toISOString() : null,
      })
      .eq('id', row.id)
    if (error) {
      setRows(snapshot)
      setError(error.message)
    }
    setToggling(null)
  }

  const verifiedCount = rows.filter((r) => r.verified).length

  return (
    <PageShell>
      <h1 style={{ fontSize: 22, fontWeight: 600, marginBottom: 4 }}>Talent</h1>
      <p style={{ fontSize: 12, color: TEXT_MUTED, marginBottom: 16 }}>
        {loading
          ? 'Loading…'
          : `${rows.length} talent · ${verifiedCount} verified`}
      </p>

      {error && (
        <p style={{ fontSize: 13, color: '#fca5a5', marginBottom: 10 }}>{error}</p>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {rows.map((row) => {
          const tp = unwrap(row.talent_profiles)
          const dept = tp?.department ? DEPARTMENT_LABELS[tp.department] : null
          const name = fullName(row)
          return (
            <div
              key={row.id}
              style={{
                background: CARD_BG,
                border: `1px solid ${CARD_BORDER}`,
                borderRadius: 12,
                padding: '10px 12px',
                display: 'flex',
                alignItems: 'center',
                gap: 12,
              }}
            >
              <Link
                href={`/app/talent/${row.id}`}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  flex: 1,
                  minWidth: 0,
                  color: TEXT_PRIMARY,
                  textDecoration: 'none',
                }}
              >
                <Avatar url={row.avatar_url} name={name} size={40} />
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
                    {[dept, row.city].filter(Boolean).join(' · ') || 'No department'}
                  </p>
                </div>
              </Link>
              <span
                aria-hidden
                title={row.available ? 'Available' : 'Unavailable'}
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 999,
                  background: row.available
                    ? AVAILABLE_GREEN
                    : 'rgba(170,189,224,0.4)',
                  flexShrink: 0,
                }}
              />
              <button
                type="button"
                onClick={() => toggleVerified(row)}
                disabled={toggling === row.id}
                aria-label={row.verified ? 'Unverify' : 'Verify'}
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: 999,
                  border: 'none',
                  background: row.verified
                    ? 'rgba(74,222,128,0.2)'
                    : 'rgba(170,189,224,0.15)',
                  color: row.verified ? AVAILABLE_GREEN : TEXT_MUTED,
                  cursor: toggling === row.id ? 'wait' : 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  transition: 'background 120ms ease',
                }}
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <polyline points="4 12 10 18 20 6" />
                </svg>
              </button>
            </div>
          )
        })}
      </div>
    </PageShell>
  )
}

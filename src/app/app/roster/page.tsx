'use client'

import { Suspense, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { useAuth } from '@/lib/auth-context'
import { Avatar } from '@/components/Avatar'
import { PageShell, TEXT_MUTED, TEXT_PRIMARY } from '@/components/PageShell'
import { CREW_TO_DEPARTMENT } from '@/lib/jobs'
import { DEPARTMENT_LABELS, type Department } from '@/lib/types'

const CARD_BG = '#2E5099'
const CARD_BORDER = 'rgba(170,189,224,0.15)'
const AVAILABLE_GREEN = '#4ade80'

type TalentRow = {
  id: string
  first_name: string | null
  last_name: string | null
  full_name: string | null
  avatar_url: string | null
  city: string | null
  available: boolean
  talent_profiles:
    | {
        department: Department | null
        primary_role: string | null
        day_rate_cents: number | null
        showreel_url: string | null
        bio: string | null
      }
    | {
        department: Department | null
        primary_role: string | null
        day_rate_cents: number | null
        showreel_url: string | null
        bio: string | null
      }[]
    | null
}

type Talent = {
  id: string
  name: string
  avatar_url: string | null
  city: string | null
  available: boolean
  department: Department | null
  primary_role: string | null
  day_rate_cents: number | null
}

function unwrap<T>(v: T | T[] | null): T | null {
  if (!v) return null
  return Array.isArray(v) ? v[0] ?? null : v
}

function normalize(row: TalentRow): Talent {
  const tp = unwrap(row.talent_profiles)
  const name =
    [row.first_name, row.last_name].filter(Boolean).join(' ') ||
    row.full_name ||
    'Unnamed'
  return {
    id: row.id,
    name,
    avatar_url: row.avatar_url,
    city: row.city,
    available: row.available ?? true,
    department: tp?.department ?? null,
    primary_role: tp?.primary_role ?? null,
    day_rate_cents: tp?.day_rate_cents ?? null,
  }
}

function formatRate(cents: number | null): string {
  if (!cents) return '—'
  return `$${(cents / 100).toLocaleString()} / day`
}

const FILTER_ORDER: Department[] = [
  'camera',
  'production',
  'styling',
  'direction',
  'post',
  'glam',
  'other',
]

type JobContext = {
  id: string
  title: string
  crew_needed: string[]
} | null

export default function RosterPage() {
  return (
    <Suspense
      fallback={
        <PageShell>
          <p style={{ fontSize: 13, color: TEXT_MUTED }}>Loading…</p>
        </PageShell>
      }
    >
      <RosterInner />
    </Suspense>
  )
}

function RosterInner() {
  const { supabase } = useAuth()
  const searchParams = useSearchParams()
  const jobId = searchParams.get('jobId')

  const [talent, setTalent] = useState<Talent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [activeFilters, setActiveFilters] = useState<Set<Department>>(new Set())
  const [jobContext, setJobContext] = useState<JobContext>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      const { data, error } = await supabase
        .from('profiles')
        .select(
          `id, first_name, last_name, full_name, avatar_url, city, available,
           talent_profiles (department, primary_role, day_rate_cents, showreel_url, bio)`
        )
        .eq('role', 'talent')
        .eq('verified', true)
        .order('first_name')
      if (cancelled) return
      if (error) {
        setError(error.message)
        setLoading(false)
        return
      }
      setTalent(((data ?? []) as TalentRow[]).map(normalize))
      setLoading(false)
    }
    load()
    return () => {
      cancelled = true
    }
  }, [supabase])

  // Fetch the referenced job (if jobId present) and pre-seed filters.
  useEffect(() => {
    if (!jobId) {
      setJobContext(null)
      setActiveFilters(new Set())
      return
    }
    let cancelled = false
    async function loadJob() {
      const { data, error } = await supabase
        .from('jobs')
        .select('id, title, crew_needed')
        .eq('id', jobId)
        .maybeSingle()
      if (cancelled) return
      if (error || !data) {
        setJobContext(null)
        setActiveFilters(new Set())
        return
      }
      const crew = Array.isArray(data.crew_needed) ? (data.crew_needed as string[]) : []
      setJobContext({ id: data.id, title: data.title, crew_needed: crew })
      const deptsFromCrew = crew
        .map((key) => CREW_TO_DEPARTMENT[key])
        .filter((d): d is Department => Boolean(d))
      setActiveFilters(new Set(deptsFromCrew))
    }
    loadJob()
    return () => {
      cancelled = true
    }
  }, [jobId, supabase])

  function toggleFilter(dept: Department) {
    setActiveFilters((prev) => {
      const next = new Set(prev)
      if (next.has(dept)) next.delete(dept)
      else next.add(dept)
      return next
    })
  }

  function clearFilters() {
    setActiveFilters(new Set())
  }

  const filtered = useMemo(() => {
    if (activeFilters.size === 0) return talent
    return talent.filter((t) => t.department && activeFilters.has(t.department))
  }, [talent, activeFilters])

  const crewLabelsForBanner =
    jobContext?.crew_needed
      .map((key) => {
        const dept = CREW_TO_DEPARTMENT[key]
        return dept ? DEPARTMENT_LABELS[dept] : null
      })
      .filter((v): v is string => Boolean(v)) ?? []

  return (
    <PageShell>
      <h1 style={{ fontSize: 22, fontWeight: 600, marginBottom: 4 }}>Roster</h1>
      <p style={{ fontSize: 12, color: TEXT_MUTED, marginBottom: 16 }}>
        Browse verified talent across departments.
      </p>

      {jobContext && (
        <div
          style={{
            position: 'relative',
            background: 'rgba(212,149,10,0.15)',
            border: '1px solid rgba(212,149,10,0.35)',
            borderRadius: 12,
            padding: '12px 14px',
            marginBottom: 14,
          }}
        >
          <p
            style={{
              fontSize: 10,
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              color: '#d4950a',
            }}
          >
            Browsing for
          </p>
          <p style={{ fontSize: 14, fontWeight: 600, color: TEXT_PRIMARY, marginTop: 2 }}>
            {jobContext.title}
          </p>
          {crewLabelsForBanner.length > 0 && (
            <p style={{ fontSize: 12, color: TEXT_MUTED, marginTop: 4 }}>
              Showing crew types: {Array.from(new Set(crewLabelsForBanner)).join(', ')}
            </p>
          )}
          <Link
            href="/app/roster"
            onClick={clearFilters}
            style={{
              display: 'inline-block',
              marginTop: 8,
              fontSize: 11,
              fontWeight: 600,
              color: TEXT_MUTED,
              textDecoration: 'underline',
            }}
          >
            × Browse all
          </Link>
        </div>
      )}

      <div
        style={{
          display: 'flex',
          gap: 8,
          overflowX: 'auto',
          paddingBottom: 6,
          marginBottom: 14,
          scrollbarWidth: 'none',
        }}
      >
        <FilterChip
          label="All"
          active={activeFilters.size === 0}
          onClick={clearFilters}
        />
        {FILTER_ORDER.map((d) => (
          <FilterChip
            key={d}
            label={DEPARTMENT_LABELS[d]}
            active={activeFilters.has(d)}
            onClick={() => toggleFilter(d)}
          />
        ))}
      </div>

      {loading && <p style={{ fontSize: 13, color: TEXT_MUTED }}>Loading…</p>}
      {!loading && error && (
        <p style={{ fontSize: 13, color: '#fca5a5' }}>{error}</p>
      )}
      {!loading && !error && filtered.length === 0 && (
        <p style={{ fontSize: 13, color: TEXT_MUTED }}>No talent in this filter.</p>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {filtered.map((t) => (
          <Link
            key={t.id}
            href={`/app/roster/${t.id}`}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: 12,
              background: CARD_BG,
              border: `1px solid ${CARD_BORDER}`,
              borderRadius: 14,
              color: TEXT_PRIMARY,
              textDecoration: 'none',
            }}
          >
            <Avatar url={t.avatar_url} name={t.name} size={60} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <p
                style={{
                  fontSize: 14,
                  fontWeight: 700,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {t.name}
              </p>
              <p style={{ fontSize: 11, color: TEXT_MUTED, marginTop: 2 }}>
                {t.department
                  ? DEPARTMENT_LABELS[t.department]
                  : 'Role not set'}
                {t.city && ` · ${t.city}`}
              </p>
              <p
                style={{
                  fontSize: 12,
                  color: TEXT_PRIMARY,
                  marginTop: 4,
                  fontWeight: 600,
                }}
              >
                {formatRate(t.day_rate_cents)}
              </p>
            </div>
            <span
              aria-hidden
              title={t.available ? 'Available' : 'Unavailable'}
              style={{
                width: 10,
                height: 10,
                borderRadius: 999,
                background: t.available
                  ? AVAILABLE_GREEN
                  : 'rgba(170,189,224,0.4)',
                boxShadow: t.available
                  ? '0 0 0 3px rgba(74,222,128,0.25)'
                  : 'none',
                flexShrink: 0,
              }}
            />
          </Link>
        ))}
      </div>
    </PageShell>
  )
}

function FilterChip({
  label,
  active,
  onClick,
}: {
  label: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      style={{
        flexShrink: 0,
        padding: '7px 14px',
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 600,
        background: active ? '#fff' : 'rgba(255,255,255,0.08)',
        color: active ? '#1A3C6B' : TEXT_MUTED,
        border: active ? 'none' : '1px solid rgba(170,189,224,0.2)',
        cursor: 'pointer',
        whiteSpace: 'nowrap',
      }}
    >
      {label}
    </button>
  )
}

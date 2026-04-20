'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'
import { addTalentToJob } from '../../actions'

type TalentRow = {
  id: string
  full_name: string | null
  first_name: string | null
  last_name: string | null
  avatar_url: string | null
  talent_profiles:
    | {
        department: string | null
        primary_role: string | null
        day_rate_cents: number | null
      }
    | {
        department: string | null
        primary_role: string | null
        day_rate_cents: number | null
      }[]
    | null
}

function unwrap<T>(v: T | T[] | null | undefined): T | null {
  if (v == null) return null
  return Array.isArray(v) ? v[0] ?? null : v
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).slice(0, 2)
  return parts.map((p) => p[0]?.toUpperCase() ?? '').join('') || '?'
}

function centsToUsd(cents: number | null | undefined): string {
  if (!cents && cents !== 0) return ''
  return `$${(cents / 100).toLocaleString('en-US', { maximumFractionDigits: 0 })}`
}

export default function AddTalentPage() {
  const params = useParams<{ id: string }>()
  const jobId = params?.id ?? ''
  const supabase = createClient()

  const [jobTitle, setJobTitle] = useState<string | null>(null)
  const [talent, setTalent] = useState<TalentRow[]>([])
  const [existingTalentIds, setExistingTalentIds] = useState<Set<string>>(
    new Set()
  )
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [addingId, setAddingId] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      const [jobRes, talentRes, bookingsRes] = await Promise.all([
        supabase.from('jobs').select('title').eq('id', jobId).maybeSingle(),
        supabase
          .from('profiles')
          .select(
            `id, full_name, first_name, last_name, avatar_url,
             talent_profiles!inner (department, primary_role, day_rate_cents)`
          )
          .eq('role', 'talent')
          .eq('verified', true)
          .order('full_name'),
        supabase
          .from('job_bookings')
          .select('talent_id')
          .eq('job_id', jobId),
      ])
      if (cancelled) return
      setJobTitle(jobRes.data?.title ?? null)
      setTalent((talentRes.data ?? []) as TalentRow[])
      setExistingTalentIds(
        new Set(
          ((bookingsRes.data ?? []) as Array<{ talent_id: string | null }>)
            .map((b) => b.talent_id)
            .filter((id): id is string => id !== null)
        )
      )
      setLoading(false)
    }
    load()
    return () => {
      cancelled = true
    }
  }, [supabase, jobId])

  const q = query.trim().toLowerCase()
  const filtered = useMemo(() => {
    if (!q) return talent
    return talent.filter((t) => {
      const tp = unwrap(t.talent_profiles)
      const name =
        [t.first_name, t.last_name].filter(Boolean).join(' ') ||
        t.full_name ||
        ''
      return (
        name.toLowerCase().includes(q) ||
        (tp?.department ?? '').toLowerCase().includes(q) ||
        (tp?.primary_role ?? '').toLowerCase().includes(q)
      )
    })
  }, [talent, q])

  async function handleAdd(talentId: string) {
    if (addingId) return
    setAddingId(talentId)
    const fd = new FormData()
    fd.set('jobId', jobId)
    fd.set('talentId', talentId)
    try {
      await addTalentToJob(fd)
      // Server action redirects back to the job detail page.
    } catch (err: unknown) {
      if (
        err &&
        typeof err === 'object' &&
        'digest' in err &&
        String((err as { digest?: string }).digest).startsWith('NEXT_REDIRECT')
      ) {
        throw err
      }
      setAddingId(null)
    }
  }

  return (
    <div
      className="mx-auto"
      style={{ maxWidth: 720, padding: '20px 18px 28px' }}
    >
      <Link
        href={`/admin/jobs/${jobId}`}
        style={{ fontSize: 13, color: '#7A90AA', textDecoration: 'none' }}
      >
        ← Back to job
      </Link>
      <h1
        className="text-white"
        style={{ fontSize: 18, fontWeight: 600, marginTop: 8 }}
      >
        Add talent{jobTitle ? ` to ${jobTitle}` : ''}
      </h1>
      <p style={{ fontSize: 12, color: '#7A90AA', marginTop: 4 }}>
        New bookings are added as <strong style={{ color: '#F0A500' }}>requested</strong>.
        Confirm from the job page.
      </p>

      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search by name, role, or department…"
        className="mt-4 w-full rounded-lg"
        style={{
          background: '#1A2E4A',
          border: '1px solid rgba(170,189,224,0.15)',
          color: '#fff',
          padding: '10px 14px',
          fontSize: 14,
          outline: 'none',
        }}
      />

      {loading ? (
        <p className="mt-4" style={{ fontSize: 13, color: '#7A90AA' }}>
          Loading talent…
        </p>
      ) : filtered.length === 0 ? (
        <p
          className="mt-4"
          style={{ fontSize: 13, color: '#7A90AA', fontStyle: 'italic' }}
        >
          {talent.length === 0
            ? 'No verified talent in the roster yet.'
            : 'No matches for that search.'}
        </p>
      ) : (
        <div className="mt-4 flex flex-col gap-2">
          {filtered.map((t) => {
            const tp = unwrap(t.talent_profiles)
            const name =
              [t.first_name, t.last_name].filter(Boolean).join(' ') ||
              t.full_name ||
              'Unnamed'
            const meta =
              [tp?.department, tp?.primary_role].filter(Boolean).join(' · ') ||
              'Talent'
            const already = existingTalentIds.has(t.id)
            const busy = addingId === t.id

            return (
              <div
                key={t.id}
                className="rounded-xl"
                style={{
                  background: '#1A2E4A',
                  border: '1px solid rgba(255,255,255,0.05)',
                  padding: 12,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  opacity: already ? 0.55 : 1,
                }}
              >
                <div
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 999,
                    background: '#1E3A6B',
                    color: '#fff',
                    fontSize: 13,
                    fontWeight: 700,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                    overflow: 'hidden',
                  }}
                >
                  {t.avatar_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={t.avatar_url}
                      alt=""
                      style={{
                        width: '100%',
                        height: '100%',
                        objectFit: 'cover',
                      }}
                    />
                  ) : (
                    initials(name)
                  )}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p
                    className="text-white"
                    style={{
                      fontSize: 14,
                      fontWeight: 500,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {name}
                  </p>
                  <p
                    style={{
                      fontSize: 12,
                      color: '#AABDE0',
                      marginTop: 1,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {meta}
                    {tp?.day_rate_cents != null &&
                      ` · ${centsToUsd(tp.day_rate_cents)}/day`}
                  </p>
                </div>
                {already ? (
                  <span
                    className="rounded-full"
                    style={{
                      padding: '4px 10px',
                      fontSize: 10,
                      fontWeight: 700,
                      letterSpacing: '0.08em',
                      textTransform: 'uppercase',
                      background: 'rgba(170,189,224,0.12)',
                      color: '#7A90AA',
                      whiteSpace: 'nowrap',
                      flexShrink: 0,
                    }}
                  >
                    Already booked
                  </span>
                ) : (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => handleAdd(t.id)}
                    className="rounded-lg bg-[#F0A500] hover:bg-[#F5B733] text-[#0F1B2E] transition-colors"
                    style={{
                      padding: '8px 14px',
                      fontSize: 11,
                      fontWeight: 700,
                      letterSpacing: '0.06em',
                      textTransform: 'uppercase',
                      border: 'none',
                      cursor: busy ? 'wait' : 'pointer',
                      whiteSpace: 'nowrap',
                      flexShrink: 0,
                      opacity: busy ? 0.7 : 1,
                    }}
                  >
                    {busy ? 'Adding…' : 'Add to job'}
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

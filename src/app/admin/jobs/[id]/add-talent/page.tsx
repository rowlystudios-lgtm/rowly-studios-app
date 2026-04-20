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
        rate_floor_cents: number | null
      }
    | {
        department: string | null
        primary_role: string | null
        day_rate_cents: number | null
        rate_floor_cents: number | null
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

function fmtUsd(c: number | null | undefined): string {
  if (!c && c !== 0) return ''
  return `$${(c / 100).toLocaleString('en-US', { maximumFractionDigits: 0 })}`
}

export default function AddTalentPage() {
  const params = useParams<{ id: string }>()
  const jobId = params?.id ?? ''
  const supabase = createClient()

  const [jobTitle, setJobTitle] = useState<string | null>(null)
  const [jobRateCents, setJobRateCents] = useState<number | null>(null)
  const [jobBudgetCents, setJobBudgetCents] = useState<number | null>(null)
  const [talent, setTalent] = useState<TalentRow[]>([])
  const [existingTalentIds, setExistingTalentIds] = useState<Set<string>>(
    new Set()
  )
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [addingId, setAddingId] = useState<string | null>(null)
  // Per-talent offered rate override, keyed by talent id (as dollar string).
  const [offerDrafts, setOfferDrafts] = useState<Record<string, string>>({})

  useEffect(() => {
    let cancelled = false
    async function load() {
      const [jobRes, talentRes, bookingsRes] = await Promise.all([
        supabase
          .from('jobs')
          .select('title, day_rate_cents, client_budget_cents')
          .eq('id', jobId)
          .maybeSingle(),
        supabase
          .from('profiles')
          .select(
            `id, full_name, first_name, last_name, avatar_url,
             talent_profiles!inner (department, primary_role,
               day_rate_cents, rate_floor_cents)`
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
      setJobRateCents(jobRes.data?.day_rate_cents ?? null)
      setJobBudgetCents(jobRes.data?.client_budget_cents ?? null)
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

  // Default offered rate per talent: min(job rate/budget, talent's day rate).
  function defaultOfferDollars(t: TalentRow): string {
    const tp = unwrap(t.talent_profiles)
    const base =
      jobBudgetCents ?? jobRateCents ?? tp?.day_rate_cents ?? null
    const talentRate = tp?.day_rate_cents ?? null
    const pick = [base, talentRate]
      .filter((x): x is number => x != null)
      .sort((a, b) => a - b)[0]
    return pick != null ? String(pick / 100) : ''
  }

  function getDraftFor(t: TalentRow): string {
    if (Object.prototype.hasOwnProperty.call(offerDrafts, t.id)) {
      return offerDrafts[t.id]
    }
    return defaultOfferDollars(t)
  }

  function setDraftFor(id: string, v: string) {
    setOfferDrafts((prev) => ({ ...prev, [id]: v }))
  }

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

  async function handleAdd(t: TalentRow) {
    if (addingId) return
    setAddingId(t.id)
    const fd = new FormData()
    fd.set('jobId', jobId)
    fd.set('talentId', t.id)
    fd.set('offered_rate', getDraftFor(t))
    try {
      await addTalentToJob(fd)
      // server action redirects — we shouldn't get here on success
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
        Each talent gets a <strong style={{ color: '#F0A500' }}>24-hour</strong>{' '}
        response window. They can accept, counter, or decline.
      </p>
      {jobBudgetCents != null && (
        <p style={{ fontSize: 12, color: '#AABDE0', marginTop: 2 }}>
          Client budget: <strong>{fmtUsd(jobBudgetCents)}/day</strong>. Default
          offers will use this.
        </p>
      )}

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
            const draft = getDraftFor(t)
            const draftCents = draft
              ? Math.round(parseFloat(draft) * 100)
              : null
            const belowFloor =
              draftCents != null &&
              tp?.rate_floor_cents != null &&
              draftCents < tp.rate_floor_cents

            return (
              <div
                key={t.id}
                className="rounded-xl"
                style={{
                  background: '#1A2E4A',
                  border: '1px solid rgba(255,255,255,0.05)',
                  padding: 14,
                  opacity: already ? 0.55 : 1,
                }}
              >
                <div className="flex items-center gap-3">
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
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
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
                        ` · ${fmtUsd(tp.day_rate_cents)}/day standard`}
                    </p>
                    {tp?.rate_floor_cents != null && (
                      <p style={{ fontSize: 11, color: '#7A90AA', marginTop: 1 }}>
                        Floor: {fmtUsd(tp.rate_floor_cents)}
                      </p>
                    )}
                  </div>
                </div>

                {!already && (
                  <div className="mt-3 flex items-end gap-2 flex-wrap">
                    <label style={{ flex: '1 1 140px' }}>
                      <span
                        style={{
                          display: 'block',
                          fontSize: 10,
                          fontWeight: 700,
                          letterSpacing: '0.12em',
                          textTransform: 'uppercase',
                          color: '#7A90AA',
                          marginBottom: 4,
                        }}
                      >
                        Offered rate
                      </span>
                      <div style={{ position: 'relative' }}>
                        <span
                          style={{
                            position: 'absolute',
                            left: 10,
                            top: '50%',
                            transform: 'translateY(-50%)',
                            color: '#7A90AA',
                            fontSize: 13,
                            pointerEvents: 'none',
                          }}
                        >
                          $
                        </span>
                        <input
                          type="number"
                          min={0}
                          step={25}
                          value={draft}
                          onChange={(e) => setDraftFor(t.id, e.target.value)}
                          style={{
                            width: '100%',
                            padding: '8px 10px 8px 22px',
                            borderRadius: 8,
                            border: '1px solid rgba(170,189,224,0.2)',
                            background: 'rgba(255,255,255,0.05)',
                            color: '#fff',
                            fontSize: 13,
                            outline: 'none',
                          }}
                        />
                      </div>
                    </label>
                    <button
                      type="button"
                      disabled={busy || !draft}
                      onClick={() => handleAdd(t)}
                      className="rounded-lg bg-[#F0A500] hover:bg-[#F5B733] text-[#0F1B2E] transition-colors"
                      style={{
                        padding: '9px 14px',
                        fontSize: 11,
                        fontWeight: 700,
                        letterSpacing: '0.06em',
                        textTransform: 'uppercase',
                        border: 'none',
                        cursor: busy ? 'wait' : 'pointer',
                        whiteSpace: 'nowrap',
                        opacity: busy || !draft ? 0.7 : 1,
                      }}
                    >
                      {busy ? 'Adding…' : 'Add to job'}
                    </button>
                  </div>
                )}
                {!already && belowFloor && (
                  <p
                    className="mt-2 rounded-lg"
                    style={{
                      fontSize: 11,
                      color: '#F0A500',
                      background: 'rgba(240,165,0,0.10)',
                      border: '1px solid rgba(240,165,0,0.3)',
                      padding: '6px 10px',
                    }}
                  >
                    ⚠ Below this talent&apos;s rate floor. They can still accept
                    but will be flagged.
                  </p>
                )}
                {already && (
                  <p
                    className="mt-2"
                    style={{ fontSize: 11, color: '#7A90AA', fontStyle: 'italic' }}
                  >
                    Already booked on this job.
                  </p>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

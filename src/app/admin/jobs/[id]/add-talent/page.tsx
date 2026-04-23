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

/** Talent net cents → client-billed cents (talent net × 1.15 markup). */
function clientRate(talentNetCents: number | null | undefined): string {
  if (!talentNetCents) return '—'
  return `$${(Math.round(talentNetCents * 1.15) / 100).toLocaleString('en-US', { maximumFractionDigits: 0 })}`
}

export default function AddTalentPage() {
  const params = useParams<{ id: string }>()
  const jobId = params?.id ?? ''
  const supabase = createClient()

  const [jobTitle, setJobTitle] = useState<string | null>(null)
  const [jobRateCents, setJobRateCents] = useState<number | null>(null)
  const [jobBudgetCents, setJobBudgetCents] = useState<number | null>(null)
  const [jobDurationHours, setJobDurationHours] = useState<number | null>(null)
  const isShortShoot = jobDurationHours != null && jobDurationHours < 4
  const hasNoRate = jobRateCents == null && jobBudgetCents == null
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
          .select(
            'title, day_rate_cents, client_budget_cents, shoot_duration_hours'
          )
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
      setJobDurationHours(
        jobRes.data?.shoot_duration_hours != null
          ? Number(jobRes.data.shoot_duration_hours)
          : null
      )
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
      {jobBudgetCents != null && !isShortShoot && (
        <p style={{ fontSize: 12, color: '#AABDE0', marginTop: 2 }}>
          Client budget: <strong>{fmtUsd(jobBudgetCents)}/day</strong>. Default
          offers will use this.
        </p>
      )}

      {isShortShoot && (
        <div
          className="rounded-xl mt-3"
          style={{
            background: 'rgba(240,165,0,0.1)',
            border: '1px solid rgba(240,165,0,0.4)',
            padding: 14,
          }}
        >
          <p
            style={{
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              color: '#F0A500',
              marginBottom: 6,
            }}
          >
            ⚡ Short shoot — under 4 hours
          </p>
          <p
            style={{ fontSize: 13, color: '#E8D9B6', lineHeight: 1.5 }}
          >
            This is a flat-fee engagement ({jobDurationHours}hrs), not a day
            rate. Client budget:{' '}
            <strong style={{ color: '#fff' }}>
              {jobBudgetCents != null ? fmtUsd(jobBudgetCents) : 'not set'}
            </strong>
            . Offered rate below is a flat fee to that talent.
          </p>
        </div>
      )}

      {hasNoRate && (
        <div
          className="rounded-xl mt-3"
          style={{
            background: 'rgba(239,68,68,0.1)',
            border: '1px solid rgba(239,68,68,0.4)',
            padding: 14,
          }}
        >
          <p
            style={{
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              color: '#F87171',
              marginBottom: 4,
            }}
          >
            ⚠ No rate set for this job
          </p>
          <p style={{ fontSize: 13, color: '#E8C5C5', lineHeight: 1.5 }}>
            Set a day rate or budget on the job before booking talent, or enter
            a per-talent offered rate below for every add.
          </p>
        </div>
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
            return (
              <TalentCard
                key={t.id}
                talent={t}
                name={name}
                meta={meta}
                already={already}
                busy={busy}
                jobBudgetCents={jobBudgetCents}
                isShortShoot={isShortShoot}
                draft={draft}
                setDraft={(v) => setDraftFor(t.id, v)}
                onAdd={() => handleAdd(t)}
              />
            )
          })}
        </div>
      )}
    </div>
  )
}

/**
 * Per-talent rate assignment card. Surfaces the three quick-choice
 * buttons (Standard / Job budget / Custom) and the silent rate-floor
 * guard: offers under the talent's floor show a red "rate too low" note
 * and disable the Add button. No technical explanation is surfaced —
 * admin just bumps the number.
 */
function TalentCard({
  talent,
  name,
  meta,
  already,
  busy,
  jobBudgetCents,
  isShortShoot,
  draft,
  setDraft,
  onAdd,
}: {
  talent: TalentRow
  name: string
  meta: string
  already: boolean
  busy: boolean
  jobBudgetCents: number | null
  isShortShoot: boolean
  draft: string
  setDraft: (v: string) => void
  onAdd: () => void
}) {
  const tp = unwrap(talent.talent_profiles)
  const dayRate = tp?.day_rate_cents ?? null
  const floor = tp?.rate_floor_cents ?? null

  // Short shoots clamp the floor to $300 flat — the per-day rate concept
  // doesn't apply. Everywhere else we respect the talent's own floor.
  const effectiveFloorCents = isShortShoot
    ? 30000
    : floor ?? 30000

  const draftNum = parseFloat(draft)
  const draftCents =
    Number.isFinite(draftNum) && draftNum > 0
      ? Math.round(draftNum * 100)
      : null

  // Three bands: below floor (blocked), between floor and day_rate
  // (informational amber), at or above day_rate (green ✓).
  const belowFloor =
    draftCents != null && draftCents < effectiveFloorCents
  const belowDayRate =
    !belowFloor &&
    draftCents != null &&
    dayRate != null &&
    draftCents < dayRate &&
    !isShortShoot
  const atOrAboveRate =
    !belowFloor &&
    !belowDayRate &&
    draftCents != null &&
    (dayRate == null || draftCents >= dayRate) &&
    !isShortShoot

  const canAdd = !busy && !already && draftCents != null && !belowFloor

  // Set the input to a specific dollar value — used by the quick-choice buttons.
  function pick(cents: number | null) {
    if (cents == null) return
    setDraft(String(Math.round(cents / 100)))
  }

  return (
    <div
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
          {talent.avatar_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={talent.avatar_url}
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
          </p>
        </div>
      </div>

      {already ? (
        <p
          className="mt-2"
          style={{ fontSize: 11, color: '#7A90AA', fontStyle: 'italic' }}
        >
          Already booked on this job.
        </p>
      ) : (
        <>
          {/* Reference rates + job context */}
          <div
            className="mt-3"
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
              gap: 8,
              fontSize: 11,
              color: '#AABDE0',
            }}
          >
            <div
              style={{
                padding: '6px 10px',
                background: 'rgba(255,255,255,0.04)',
                borderRadius: 8,
              }}
            >
              <div style={{ fontSize: 9, color: '#7A90AA', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                Client rate (incl. RS fee)
              </div>
              <div style={{ color: '#fff', fontWeight: 700, marginTop: 2 }}>
                {dayRate != null ? `${clientRate(dayRate)}/day` : '—'}
              </div>
              <div style={{ fontSize: 9, color: '#7A90AA', marginTop: 1 }}>
                Talent net: {dayRate != null ? `${fmtUsd(dayRate)}/day` : '—'}
              </div>
            </div>
            <div
              style={{
                padding: '6px 10px',
                background: 'rgba(255,255,255,0.04)',
                borderRadius: 8,
              }}
            >
              <div style={{ fontSize: 9, color: '#7A90AA', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                Rate floor
              </div>
              <div style={{ color: '#fff', fontWeight: 600, marginTop: 2 }}>
                {floor != null ? `${fmtUsd(floor)}/day` : '—'}
              </div>
            </div>
            <div
              style={{
                padding: '6px 10px',
                background: 'rgba(240,165,0,0.08)',
                border: '1px solid rgba(240,165,0,0.25)',
                borderRadius: 8,
              }}
            >
              <div style={{ fontSize: 9, color: '#F0A500', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                {isShortShoot ? 'Job flat fee' : 'Job budget'}
              </div>
              <div style={{ color: '#F0A500', fontWeight: 700, marginTop: 2 }}>
                {jobBudgetCents != null
                  ? isShortShoot
                    ? fmtUsd(jobBudgetCents)
                    : `${fmtUsd(jobBudgetCents)}/day`
                  : 'not set'}
              </div>
            </div>
          </div>

          {/* Quick-choice buttons */}
          <div className="mt-3 flex flex-wrap gap-2">
            {dayRate != null && !isShortShoot && (
              <button
                type="button"
                onClick={() => pick(dayRate)}
                style={{
                  padding: '7px 12px',
                  fontSize: 11,
                  fontWeight: 600,
                  background: 'rgba(34,197,94,0.12)',
                  color: '#86EFAC',
                  border: '1px solid rgba(34,197,94,0.3)',
                  borderRadius: 8,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                }}
              >
                Accept full rate ({clientRate(dayRate)}/day)
              </button>
            )}
            {jobBudgetCents != null && (
              <button
                type="button"
                onClick={() => pick(jobBudgetCents)}
                style={{
                  padding: '7px 12px',
                  fontSize: 11,
                  fontWeight: 600,
                  background: 'rgba(240,165,0,0.14)',
                  color: '#F0A500',
                  border: '1px solid rgba(240,165,0,0.35)',
                  borderRadius: 8,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                }}
              >
                Offer job budget ({fmtUsd(jobBudgetCents)})
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                // Clicking "Enter custom" focuses the input. We trigger a
                // rAF to let React commit the value before focusing.
                const el = document.getElementById(
                  `offer-${talent.id}`
                ) as HTMLInputElement | null
                requestAnimationFrame(() => el?.focus())
              }}
              style={{
                padding: '7px 12px',
                fontSize: 11,
                fontWeight: 600,
                background: 'rgba(170,189,224,0.1)',
                color: '#AABDE0',
                border: '1px solid rgba(170,189,224,0.25)',
                borderRadius: 8,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              Enter custom amount
            </button>
          </div>

          {/* Offer input */}
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
                {isShortShoot ? 'Flat fee $' : 'Talent net $/day (client billed +15%)'}
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
                  id={`offer-${talent.id}`}
                  type="number"
                  min={0}
                  step={25}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 10px 8px 22px',
                    borderRadius: 8,
                    border: belowFloor
                      ? '1px solid #F87171'
                      : '1px solid rgba(170,189,224,0.2)',
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
              disabled={!canAdd}
              onClick={onAdd}
              className="rounded-lg text-[#0F1B2E] transition-colors"
              style={{
                padding: '9px 14px',
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                border: 'none',
                cursor: canAdd ? 'pointer' : 'not-allowed',
                whiteSpace: 'nowrap',
                background: canAdd ? '#F0A500' : 'rgba(170,189,224,0.15)',
                color: canAdd ? '#0F1B2E' : '#7A90AA',
              }}
            >
              {busy ? 'Adding…' : 'Add to job'}
            </button>
          </div>

          {/* Silent rate-floor warning — no technical explanation */}
          {belowFloor && (
            <p
              className="mt-2 rounded-lg"
              style={{
                fontSize: 11,
                color: '#F87171',
                background: 'rgba(239,68,68,0.12)',
                border: '1px solid rgba(239,68,68,0.35)',
                padding: '6px 10px',
                fontWeight: 600,
                letterSpacing: '0.02em',
              }}
            >
              Rate too low — minimum is {fmtUsd(effectiveFloorCents)}
            </p>
          )}
          {belowDayRate && (
            <p
              className="mt-2"
              style={{
                fontSize: 11,
                color: '#F0A500',
                padding: '4px 2px',
              }}
            >
              {fmtUsd((dayRate ?? 0) - (draftCents ?? 0))} below their standard rate (client billed: {clientRate(draftCents)}/day) — talent can still accept.
            </p>
          )}
          {atOrAboveRate && (
            <p
              className="mt-2"
              style={{
                fontSize: 11,
                color: '#4ADE80',
                padding: '4px 2px',
              }}
            >
              At or above standard rate ✓ — client billed {clientRate(draftCents)}/day
            </p>
          )}
        </>
      )}
    </div>
  )
}

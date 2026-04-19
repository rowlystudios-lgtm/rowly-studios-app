'use client'

import { Suspense, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useAuth } from '@/lib/auth-context'
import { Avatar } from '@/components/Avatar'
import { PageShell, TEXT_MUTED, TEXT_PRIMARY } from '@/components/PageShell'
import { DEPARTMENT_LABELS, type Department } from '@/lib/types'

const CARD_BG = '#2E5099'
const CARD_BORDER = 'rgba(170,189,224,0.15)'
const SOFT_BORDER = 'rgba(170,189,224,0.1)'
const AVAILABLE_GREEN = '#4ade80'
const LINK_COLOR = '#AABDE0'
const BUTTON_PRIMARY = '#1A3C6B'

type Side = 'production' | 'post'

const DEPTS_BY_SIDE: Record<Side, Department[]> = {
  production: ['camera', 'styling', 'glam', 'production', 'direction', 'other'],
  post: ['post'],
}

type TalentProfileLite = {
  department: Department | null
  primary_role: string | null
  day_rate_cents: number | null
  showreel_url: string | null
  bio: string | null
  equipment: string | null
}

type TalentRow = {
  id: string
  first_name: string | null
  last_name: string | null
  full_name: string | null
  avatar_url: string | null
  city: string | null
  available: boolean
  talent_profiles:
    | TalentProfileLite
    | TalentProfileLite[]
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
  showreel_url: string | null
  bio: string | null
  equipment: string | null
}

type ClientJob = {
  id: string
  title: string
  status: string
}

type JobBookingRow = {
  id: string
  status: 'requested' | 'confirmed' | 'declined'
  talent_id: string | null
}

type JobContext = {
  id: string
  title: string
  crew_needed: string[]
}

function unwrap<T>(v: T | T[] | null): T | null {
  if (!v) return null
  return Array.isArray(v) ? v[0] ?? null : v
}

function normaliseTalent(row: TalentRow): Talent {
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
    showreel_url: tp?.showreel_url ?? null,
    bio: tp?.bio ?? null,
    equipment: tp?.equipment ?? null,
  }
}

/** 15% markup the client sees on top of the talent's day rate. */
function markedUpRate(cents: number | null | undefined): string {
  if (!cents) return '—'
  const marked = Math.round(cents * 1.15)
  return `$${(marked / 100).toLocaleString()} / day`
}

function getVimeoId(url: string): string | null {
  const m = url.match(/vimeo\.com\/(?:video\/|channels\/\w+\/)?(\d+)/)
  return m ? m[1] : null
}

function shortId(id: string): string {
  return id.slice(0, 8)
}

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
  const { user, supabase } = useAuth()
  const router = useRouter()
  const searchParams = useSearchParams()
  const jobId = searchParams.get('jobId')

  const [side, setSide] = useState<Side>('production')
  const [dept, setDept] = useState<'all' | Department>('all')
  const [search, setSearch] = useState('')
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const [talent, setTalent] = useState<Talent[]>([])
  const [loadingTalent, setLoadingTalent] = useState(true)
  const [talentError, setTalentError] = useState('')

  const [clientJobs, setClientJobs] = useState<ClientJob[]>([])

  const [jobContext, setJobContext] = useState<JobContext | null>(null)
  const [teamBookings, setTeamBookings] = useState<JobBookingRow[]>([])
  const [teamLoading, setTeamLoading] = useState(false)

  const [addingTalentId, setAddingTalentId] = useState<string | null>(null)
  const [addedTalentIds, setAddedTalentIds] = useState<Set<string>>(new Set())
  const [addError, setAddError] = useState('')

  // Reset department when side changes and current dept isn't on the new side.
  useEffect(() => {
    if (dept === 'all') return
    if (!DEPTS_BY_SIDE[side].includes(dept as Department)) setDept('all')
  }, [side, dept])

  // Load all verified talent.
  useEffect(() => {
    let cancelled = false
    async function load() {
      const { data, error } = await supabase
        .from('profiles')
        .select(
          `id, first_name, last_name, full_name, avatar_url, city, available,
           talent_profiles (department, primary_role, day_rate_cents,
             showreel_url, bio, equipment)`
        )
        .eq('role', 'talent')
        .eq('verified', true)
        .order('first_name')
      if (cancelled) return
      if (error) {
        setTalentError(error.message)
        setLoadingTalent(false)
        return
      }
      setTalent(((data ?? []) as TalentRow[]).map(normaliseTalent))
      setLoadingTalent(false)
    }
    load()
    return () => {
      cancelled = true
    }
  }, [supabase])

  // Load the current client's jobs (for job-title / id search matching).
  useEffect(() => {
    const uid = user?.id
    if (!uid) return
    let cancelled = false
    async function load() {
      const { data } = await supabase
        .from('jobs')
        .select('id, title, status')
        .eq('client_id', uid)
        .order('created_at', { ascending: false })
      if (cancelled) return
      setClientJobs((data ?? []) as ClientJob[])
    }
    load()
    return () => {
      cancelled = true
    }
  }, [user?.id, supabase])

  // When a jobId is in the URL, fetch the job context + its current team.
  useEffect(() => {
    if (!jobId) {
      setJobContext(null)
      setTeamBookings([])
      setAddedTalentIds(new Set())
      return
    }
    let cancelled = false
    async function load() {
      setTeamLoading(true)
      const [jobRes, bookingsRes] = await Promise.all([
        supabase
          .from('jobs')
          .select('id, title, crew_needed')
          .eq('id', jobId)
          .maybeSingle(),
        supabase
          .from('job_bookings')
          .select('id, status, talent_id')
          .eq('job_id', jobId),
      ])
      if (cancelled) return
      if (jobRes.data) {
        const crew = Array.isArray(jobRes.data.crew_needed)
          ? (jobRes.data.crew_needed as string[])
          : []
        setJobContext({
          id: jobRes.data.id,
          title: jobRes.data.title,
          crew_needed: crew,
        })
      } else {
        setJobContext(null)
      }
      const rows = (bookingsRes.data ?? []) as JobBookingRow[]
      setTeamBookings(rows)
      setAddedTalentIds(
        new Set(
          rows
            .filter((b) => b.status !== 'declined')
            .map((b) => b.talent_id)
            .filter((id): id is string => id !== null)
        )
      )
      setTeamLoading(false)
    }
    load()
    return () => {
      cancelled = true
    }
  }, [jobId, supabase])

  const query = search.trim().toLowerCase()

  // Jobs matching the search string (title substring OR id prefix).
  const jobMatches = useMemo(() => {
    if (!query) return []
    return clientJobs.filter(
      (j) =>
        j.title.toLowerCase().includes(query) ||
        j.id.toLowerCase().startsWith(query)
    )
  }, [clientJobs, query])

  // Main talent list
  const filtered = useMemo(() => {
    // Always filter by side + dept + name. Team mode only highlights who's
    // already added (via addedTalentIds) — it doesn't hide anyone, so the
    // client can still browse and add more.
    let list = talent.filter((t) => {
      if (!t.department) return false
      if (side === 'production') return t.department !== 'post'
      return t.department === 'post'
    })
    if (dept !== 'all') list = list.filter((t) => t.department === dept)
    if (query) list = list.filter((t) => t.name.toLowerCase().includes(query))
    return list
  }, [talent, side, dept, query])

  async function addToTeam(t: Talent) {
    if (!jobContext) return
    if (addedTalentIds.has(t.id)) return
    if (addingTalentId) return
    setAddingTalentId(t.id)
    setAddError('')

    const { error } = await supabase.from('job_bookings').insert({
      job_id: jobContext.id,
      talent_id: t.id,
      status: 'requested',
    })

    if (error) {
      setAddError(`Could not add ${t.name}: ${error.message}`)
    } else {
      setAddedTalentIds((prev) => {
        const next = new Set(prev)
        next.add(t.id)
        return next
      })
    }
    setAddingTalentId(null)
  }

  const hasJob = Boolean(jobContext)

  return (
    <PageShell>
      <h1 style={{ fontSize: 22, fontWeight: 600, marginBottom: 4 }}>Roster</h1>
      <p style={{ fontSize: 12, color: TEXT_MUTED, marginBottom: 16 }}>
        {hasJob
          ? 'Tap “Add to team” to request talent for this job.'
          : 'Browse verified talent across departments.'}
      </p>

      {jobContext && (
        <JobContextBanner
          job={jobContext}
          addedCount={addedTalentIds.size}
          teamBookings={teamBookings}
          teamLoading={teamLoading}
        />
      )}

      <SideSlider side={side} onChange={setSide} />

      <div style={{ marginBottom: 10 }}>
        <label
          htmlFor="roster-dept"
          style={{
            display: 'block',
            fontSize: 10,
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            color: TEXT_MUTED,
            marginBottom: 6,
          }}
        >
          Department
        </label>
        <select
          id="roster-dept"
          value={dept}
          onChange={(e) => setDept(e.target.value as 'all' | Department)}
          className="rs-input"
          style={{ width: '100%' }}
        >
          <option value="all">
            All {side === 'post' ? 'post-production' : 'production'}
          </option>
          {DEPTS_BY_SIDE[side].map((d) => (
            <option key={d} value={d}>
              {DEPARTMENT_LABELS[d]}
            </option>
          ))}
        </select>
      </div>

      <div style={{ marginBottom: 16, position: 'relative' }}>
        <label
          htmlFor="roster-search"
          style={{
            display: 'block',
            fontSize: 10,
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            color: TEXT_MUTED,
            marginBottom: 6,
          }}
        >
          Search
        </label>
        <input
          id="roster-search"
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name — or job name / ID"
          className="rs-input"
          autoComplete="off"
        />
        {query && jobMatches.length > 0 && (
          <div
            style={{
              background: 'rgba(255,255,255,0.06)',
              border: `1px solid ${SOFT_BORDER}`,
              borderRadius: 10,
              marginTop: 8,
              overflow: 'hidden',
            }}
          >
            <p
              style={{
                fontSize: 10,
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                color: TEXT_MUTED,
                padding: '8px 12px 4px',
              }}
            >
              Jobs matching
            </p>
            {jobMatches.map((j) => (
              <button
                key={j.id}
                type="button"
                onClick={() => {
                  setSearch('')
                  router.push(`/app/roster?jobId=${j.id}`)
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  width: '100%',
                  background: 'transparent',
                  border: 'none',
                  padding: '10px 12px',
                  color: TEXT_PRIMARY,
                  fontSize: 13,
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
              >
                <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {j.title}
                </span>
                <span style={{ fontSize: 10, color: TEXT_MUTED, marginLeft: 10, fontFamily: 'ui-monospace, Menlo, monospace' }}>
                  {shortId(j.id)}
                </span>
                <span style={{ color: LINK_COLOR, marginLeft: 10, fontSize: 12 }}>→</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {addError && (
        <p
          style={{
            fontSize: 12,
            color: '#fca5a5',
            background: 'rgba(248,113,113,0.12)',
            border: '1px solid rgba(248,113,113,0.25)',
            borderRadius: 10,
            padding: '10px 12px',
            marginBottom: 10,
          }}
        >
          {addError}
        </p>
      )}

      {loadingTalent && <p style={{ fontSize: 13, color: TEXT_MUTED }}>Loading talent…</p>}
      {!loadingTalent && talentError && (
        <p style={{ fontSize: 13, color: '#fca5a5' }}>{talentError}</p>
      )}
      {!loadingTalent && !talentError && filtered.length === 0 && (
        <p style={{ fontSize: 13, color: TEXT_MUTED }}>No talent matches these filters.</p>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {filtered.map((t) => (
          <TalentCard
            key={t.id}
            talent={t}
            expanded={expandedId === t.id}
            onToggleExpand={() =>
              setExpandedId((prev) => (prev === t.id ? null : t.id))
            }
            hasJob={hasJob}
            added={addedTalentIds.has(t.id)}
            adding={addingTalentId === t.id}
            onAdd={() => addToTeam(t)}
          />
        ))}
      </div>
    </PageShell>
  )
}

function JobContextBanner({
  job,
  addedCount,
  teamBookings,
  teamLoading,
}: {
  job: JobContext
  addedCount: number
  teamBookings: JobBookingRow[]
  teamLoading: boolean
}) {
  const requested = teamBookings.filter((b) => b.status === 'requested').length
  const confirmed = teamBookings.filter((b) => b.status === 'confirmed').length
  return (
    <div
      style={{
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
        Crewing
      </p>
      <p style={{ fontSize: 14, fontWeight: 600, color: TEXT_PRIMARY, marginTop: 2 }}>
        {job.title}
      </p>
      <p style={{ fontSize: 11, color: TEXT_MUTED, marginTop: 4 }}>
        {teamLoading
          ? 'Loading team…'
          : `${addedCount || requested + confirmed} on team` +
            (confirmed > 0 ? ` · ${confirmed} confirmed` : '')}
      </p>
      <Link
        href="/app/roster"
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
  )
}

function SideSlider({
  side,
  onChange,
}: {
  side: Side
  onChange: (s: Side) => void
}) {
  return (
    <div
      role="tablist"
      aria-label="Side"
      style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        padding: 3,
        borderRadius: 999,
        background: 'rgba(255,255,255,0.08)',
        border: `1px solid ${CARD_BORDER}`,
        marginBottom: 12,
      }}
    >
      {(['production', 'post'] as Side[]).map((s) => {
        const active = side === s
        return (
          <button
            key={s}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(s)}
            style={{
              padding: '9px 0',
              borderRadius: 999,
              border: 'none',
              background: active ? '#fff' : 'transparent',
              color: active ? '#1A3C6B' : TEXT_MUTED,
              fontSize: 11,
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              cursor: 'pointer',
              transition: 'background 150ms ease, color 150ms ease',
            }}
          >
            {s === 'production' ? 'Production' : 'Post-production'}
          </button>
        )
      })}
    </div>
  )
}

function TalentCard({
  talent,
  expanded,
  onToggleExpand,
  hasJob,
  added,
  adding,
  onAdd,
}: {
  talent: Talent
  expanded: boolean
  onToggleExpand: () => void
  hasJob: boolean
  added: boolean
  adding: boolean
  onAdd: () => void
}) {
  const vimeoId = talent.showreel_url ? getVimeoId(talent.showreel_url) : null
  const clientRate = markedUpRate(talent.day_rate_cents)
  const deptLabel = talent.department ? DEPARTMENT_LABELS[talent.department] : null

  let addButtonLabel = 'Add to team'
  if (added) addButtonLabel = '✓ Added'
  else if (adding) addButtonLabel = 'Adding…'

  return (
    <article
      style={{
        background: CARD_BG,
        border: `1px solid ${CARD_BORDER}`,
        borderRadius: 14,
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: 12,
        }}
      >
        <Avatar url={talent.avatar_url} name={talent.name} size={60} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <p
            style={{
              fontSize: 14,
              fontWeight: 700,
              color: TEXT_PRIMARY,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {talent.name}
          </p>
          <p
            style={{
              fontSize: 11,
              color: TEXT_MUTED,
              marginTop: 2,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {talent.primary_role || deptLabel || 'Role not set'}
            {talent.primary_role && deptLabel && ` · ${deptLabel}`}
            {talent.city && ` · ${talent.city}`}
          </p>
          <p
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: TEXT_PRIMARY,
              marginTop: 4,
            }}
          >
            {clientRate}
          </p>
        </div>
        <span
          aria-hidden
          title={talent.available ? 'Available' : 'Unavailable'}
          style={{
            width: 10,
            height: 10,
            borderRadius: 999,
            background: talent.available ? AVAILABLE_GREEN : 'rgba(170,189,224,0.4)',
            boxShadow: talent.available
              ? '0 0 0 3px rgba(74,222,128,0.25)'
              : 'none',
            flexShrink: 0,
          }}
        />
      </div>

      <div
        style={{
          display: 'flex',
          gap: 8,
          padding: '0 12px 12px',
        }}
      >
        <button
          type="button"
          onClick={onAdd}
          disabled={!hasJob || added || adding}
          title={!hasJob ? 'Open one of your jobs first to add talent' : undefined}
          style={{
            flex: 1,
            padding: '10px 12px',
            borderRadius: 10,
            background: added ? 'rgba(74,222,128,0.2)' : '#fff',
            color: added ? '#4ade80' : BUTTON_PRIMARY,
            border: added ? '1px solid rgba(74,222,128,0.35)' : 'none',
            fontSize: 12,
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            cursor: !hasJob || added || adding ? 'not-allowed' : 'pointer',
            opacity: !hasJob ? 0.55 : 1,
          }}
        >
          {addButtonLabel}
        </button>
        <button
          type="button"
          onClick={onToggleExpand}
          aria-expanded={expanded}
          style={{
            padding: '10px 12px',
            borderRadius: 10,
            background: 'rgba(255,255,255,0.06)',
            color: TEXT_MUTED,
            border: `1px solid ${CARD_BORDER}`,
            fontSize: 12,
            fontWeight: 600,
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          <span>{expanded ? 'Hide' : 'Details'}</span>
          <ChevronIcon expanded={expanded} />
        </button>
      </div>

      {expanded && (
        <div
          style={{
            borderTop: `1px solid ${SOFT_BORDER}`,
            padding: '12px 16px 16px',
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
          }}
        >
          {talent.bio ? (
            <div>
              <SubLabel>About</SubLabel>
              <p
                style={{
                  fontSize: 13,
                  lineHeight: 1.5,
                  whiteSpace: 'pre-wrap',
                  color: TEXT_PRIMARY,
                  marginTop: 4,
                }}
              >
                {talent.bio}
              </p>
            </div>
          ) : null}

          {talent.equipment && (
            <div>
              <SubLabel>Equipment</SubLabel>
              <p
                style={{
                  fontSize: 13,
                  lineHeight: 1.5,
                  whiteSpace: 'pre-wrap',
                  color: TEXT_PRIMARY,
                  marginTop: 4,
                }}
              >
                {talent.equipment}
              </p>
            </div>
          )}

          {vimeoId ? (
            <div>
              <SubLabel>Reel</SubLabel>
              <div
                style={{
                  marginTop: 6,
                  position: 'relative',
                  width: '100%',
                  paddingBottom: '56.25%',
                  borderRadius: 10,
                  overflow: 'hidden',
                  background: '#000',
                  border: `1px solid ${SOFT_BORDER}`,
                }}
              >
                <iframe
                  src={`https://player.vimeo.com/video/${vimeoId}?autoplay=0&title=0&byline=0&portrait=0&dnt=1`}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: '100%',
                    border: 'none',
                  }}
                  allow="autoplay; fullscreen; picture-in-picture"
                  allowFullScreen
                  loading="lazy"
                  title={`${talent.name} showreel`}
                />
              </div>
            </div>
          ) : talent.showreel_url ? (
            <div>
              <SubLabel>Reel</SubLabel>
              <a
                href={talent.showreel_url}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: 'inline-block',
                  marginTop: 6,
                  color: LINK_COLOR,
                  fontSize: 13,
                  textDecoration: 'underline',
                  wordBreak: 'break-all',
                }}
              >
                ▶ {talent.showreel_url} ↗
              </a>
            </div>
          ) : (
            <div>
              <SubLabel>Reel</SubLabel>
              <p style={{ fontSize: 12, color: TEXT_MUTED, marginTop: 4 }}>
                No reel uploaded yet.
              </p>
            </div>
          )}

          <div>
            <Link
              href={`/app/roster/${talent.id}`}
              style={{
                fontSize: 11,
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                color: LINK_COLOR,
                textDecoration: 'underline',
              }}
            >
              Open full profile →
            </Link>
          </div>
        </div>
      )}
    </article>
  )
}

function SubLabel({ children }: { children: React.ReactNode }) {
  return (
    <span
      style={{
        fontSize: 10,
        fontWeight: 600,
        textTransform: 'uppercase',
        letterSpacing: '0.08em',
        color: TEXT_MUTED,
      }}
    >
      {children}
    </span>
  )
}

function ChevronIcon({ expanded }: { expanded: boolean }) {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{
        transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
        transition: 'transform 150ms ease',
      }}
      aria-hidden
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  )
}


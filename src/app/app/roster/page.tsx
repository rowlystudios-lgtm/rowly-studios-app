'use client'

import { Suspense, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useAuth } from '@/lib/auth-context'
import { Avatar } from '@/components/Avatar'
import { PageShell, TEXT_MUTED, TEXT_PRIMARY } from '@/components/PageShell'
import { DEPARTMENT_LABELS, type Department } from '@/lib/types'
import { DEPARTMENTS } from '@/lib/crew-taxonomy'

const CARD_BG = '#2E5099'
const CARD_BORDER = 'rgba(170,189,224,0.15)'
const SOFT_BORDER = 'rgba(170,189,224,0.1)'
const AVAILABLE_GREEN = '#4ade80'
const LINK_COLOR = '#AABDE0'
const BUTTON_PRIMARY = '#1A3C6B'

// Rowly Studios take the 15% on top of the talent's net rate. Kept
// as named constants so rate-fee math is greppable and a future change
// is a one-line edit.
//   client_pays = talent_net × RS_MULTIPLIER
//   talent_net  = client_pays / RS_MULTIPLIER
//
// offered_rate_cents / confirmed_rate_cents always store the TALENT NET
// amount. The client sees the marked-up value everywhere.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const RS_FEE = 0.15
const RS_MULTIPLIER = 1.15

type Side = 'production' | 'post'

// Departments grouped by roster side. Everything except 'post' lives on the
// production side. 'other' is excluded — roster filters are craft-first.
const POST_KEYS: Department[] = ['post']
const DEPTS_BY_SIDE: Record<Side, Department[]> = {
  production: DEPARTMENTS
    .filter((d) => d.key !== 'post' && d.key !== 'other')
    .map((d) => d.key),
  post: POST_KEYS,
}

type TalentProfileLite = {
  department: Department | null
  primary_role: string | null
  day_rate_cents: number | null
  rate_floor_cents: number | null
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
  rate_floor_cents: number | null
  showreel_url: string | null
  bio: string | null
  equipment: string | null
}

type ClientJob = {
  id: string
  title: string
  status: string
  start_date: string | null
  shoot_days: Array<{ date: string; call_time: string | null }> | null
  total_budget_cents: number | null
}

type JobBookingRow = {
  id: string
  status: 'requested' | 'confirmed' | 'declined' | 'cancelled'
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
    rate_floor_cents: tp?.rate_floor_cents ?? null,
    showreel_url: tp?.showreel_url ?? null,
    bio: tp?.bio ?? null,
    equipment: tp?.equipment ?? null,
  }
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
  const [addSuccess, setAddSuccess] = useState('')
  const [pickerTalent, setPickerTalent] = useState<Talent | null>(null)
  const [pickerBusy, setPickerBusy] = useState(false)
  // Rate chosen on the talent card before the job picker opens. Null
  // means "no custom rate" — fall back to the talent's day_rate_cents.
  const [pickerRateCents, setPickerRateCents] = useState<number | null>(null)

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
           verified, role,
           talent_profiles (department, primary_role, day_rate_cents,
             rate_floor_cents, showreel_url, bio, equipment)`
        )
        .eq('role', 'talent')
        .eq('verified', true)
        .order('first_name')
      if (cancelled) return
      if (error) {
        // eslint-disable-next-line no-console
        console.error('[roster] verified talent fetch failed', error)
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
        .select(
          'id, title, status, start_date, shoot_days, total_budget_cents'
        )
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
      // Declined and cancelled bookings shouldn't mark the talent as
      // "✓ Added" on the roster — the client may want to re-offer, and
      // handleAddToJob will delete+recreate the row when they do.
      setAddedTalentIds(
        new Set(
          rows
            .filter(
              (b) => b.status !== 'declined' && b.status !== 'cancelled'
            )
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

  /**
   * Insert a booking with status='requested'. Shared by:
   *   - direct add when ?jobId= is present (jobContext mode) — uses the
   *     talent's day_rate_cents as the opening offer.
   *   - "Add to job" picker when no jobId (opens a sheet first, then a
   *     rate-choice step that passes an explicit rateCents here).
   */
  async function handleAddToJob(
    jobId: string,
    t: Talent,
    rateCents: number | null
  ): Promise<boolean> {
    setAddError('')
    setAddSuccess('')

    const { data: existing } = await supabase
      .from('job_bookings')
      .select('id, status')
      .eq('job_id', jobId)
      .eq('talent_id', t.id)
      .maybeSingle()

    if (existing) {
      if (existing.status === 'declined') {
        // Declined — clear the old row so the client can re-offer with a
        // fresh booking. Delete instead of update so the RLS + audit
        // story stays clean: the new booking_events row will mark a
        // brand-new offer_sent timeline.
        const { error: deleteError } = await supabase
          .from('job_bookings')
          .delete()
          .eq('id', existing.id)
        if (deleteError) {
          setAddError(`Could not re-offer ${t.name}: ${deleteError.message}`)
          return false
        }
        // Reset the card's "✓ Added" state so the button reads "Add to
        // job" again immediately — it'll be re-added below.
        setAddedTalentIds((prev) => {
          const next = new Set(prev)
          next.delete(t.id)
          return next
        })
        // Fall through to the insert below.
      } else {
        setAddError(`${t.name} is already on this job (${existing.status}).`)
        return false
      }
    }

    // offered_rate_cents captures the opening number; confirmed_rate_cents
    // stays null until admin/talent lock it in.
    const { error } = await supabase.from('job_bookings').insert({
      job_id: jobId,
      talent_id: t.id,
      status: 'requested',
      notes: null,
      offered_rate_cents: rateCents ?? null,
      confirmed_rate_cents: null,
    })

    if (error) {
      setAddError(`Could not add ${t.name}: ${error.message}`)
      return false
    }

    setAddSuccess(`${t.name} added — pending admin review`)
    // Dismiss success after a few seconds.
    setTimeout(() => setAddSuccess(''), 4000)
    return true
  }

  async function addToTeam(t: Talent, rateCents: number | null) {
    if (!jobContext) {
      // No ?jobId= in URL — store the rate chosen on the card and open
      // the job picker sheet so the client can pick which job this is for.
      setPickerRateCents(rateCents)
      setPickerTalent(t)
      return
    }
    if (addedTalentIds.has(t.id)) return
    if (addingTalentId) return
    setAddingTalentId(t.id)
    // With ?jobId= the rate was already chosen on the card — use it (or
    // fall back to the talent's own day rate if nothing was entered).
    const ok = await handleAddToJob(
      jobContext.id,
      t,
      rateCents ?? t.day_rate_cents ?? null
    )
    if (ok) {
      setAddedTalentIds((prev) => {
        const next = new Set(prev)
        next.add(t.id)
        return next
      })
    }
    setAddingTalentId(null)
  }

  async function onPickerConfirm(jobId: string, rateCents: number | null) {
    if (!pickerTalent) return
    setPickerBusy(true)
    // The sheet passes null now — rate was set on the card. Fall back to
    // the talent's day rate if no custom rate was entered.
    const finalRate =
      rateCents ?? pickerRateCents ?? pickerTalent.day_rate_cents ?? null
    const ok = await handleAddToJob(jobId, pickerTalent, finalRate)
    setPickerBusy(false)
    if (ok) {
      setPickerTalent(null)
      setPickerRateCents(null)
    }
  }

  const hasJob = Boolean(jobContext)
  const pickableJobs = useMemo(
    () => clientJobs.filter((j) => j.status === 'submitted' || j.status === 'crewing'),
    [clientJobs]
  )

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
      {addSuccess && (
        <p
          style={{
            fontSize: 12,
            color: '#4ade80',
            background: 'rgba(74,222,128,0.12)',
            border: '1px solid rgba(74,222,128,0.3)',
            borderRadius: 10,
            padding: '10px 12px',
            marginBottom: 10,
          }}
        >
          {addSuccess}
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
            canPickJob={pickableJobs.length > 0 || !user}
            added={addedTalentIds.has(t.id)}
            adding={addingTalentId === t.id}
            onAdd={(rateCents) => addToTeam(t, rateCents)}
          />
        ))}
      </div>

      {pickerTalent && (
        <JobPickerSheet
          talent={pickerTalent}
          jobs={pickableJobs}
          busy={pickerBusy}
          pickerRateCents={pickerRateCents}
          onConfirm={onPickerConfirm}
          onClose={() => {
            if (!pickerBusy) {
              setPickerTalent(null)
              setPickerRateCents(null)
            }
          }}
        />
      )}
    </PageShell>
  )
}

/**
 * Two-step "Add to job" sheet:
 *   Step 1 — pick the job.
 *   Step 2 — confirm the booking at the rate the client already entered
 *            on the talent card (or the talent's day rate if nothing was
 *            entered).
 *
 * Closing the sheet at any point resets back to step 1.
 */
function JobPickerSheet({
  talent,
  jobs,
  busy,
  pickerRateCents,
  onConfirm,
  onClose,
}: {
  talent: Talent
  jobs: ClientJob[]
  busy: boolean
  /** Rate set on the talent card before the sheet opened. */
  pickerRateCents: number | null
  onConfirm: (jobId: string, rateCents: number | null) => void
  onClose: () => void
}) {
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null)

  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [])

  function pickJob(id: string) {
    setSelectedJobId(id)
  }

  function backToJobs() {
    if (busy) return
    setSelectedJobId(null)
  }

  const selectedJob = jobs.find((j) => j.id === selectedJobId) ?? null

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 200,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex',
        alignItems: 'flex-end',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          background: '#1A3C6B',
          borderRadius: '20px 20px 0 0',
          maxHeight: '85dvh',
          overflowY: 'auto',
          paddingBottom: 'calc(40px + env(safe-area-inset-bottom))',
          color: '#fff',
        }}
      >
        <div style={{ padding: '12px 0 4px', display: 'flex', justifyContent: 'center' }}>
          <div
            style={{
              width: 36,
              height: 4,
              borderRadius: 2,
              background: 'rgba(170,189,224,0.3)',
            }}
          />
        </div>
        <div style={{ padding: '4px 16px 12px' }}>
          <h2 style={{ fontSize: 16, fontWeight: 600 }}>
            Add {talent.name} to a job
          </h2>
          <p style={{ fontSize: 12, color: TEXT_MUTED, marginTop: 4 }}>
            {selectedJob
              ? `Confirm booking for ${selectedJob.title}`
              : jobs.length === 0
              ? 'You don\u2019t have any active jobs yet.'
              : 'Pick the job you want to request them for.'}
          </p>

          {/* Step 1 — job selection */}
          {!selectedJob && (
            <>
              {jobs.length === 0 ? (
                <Link
                  href="/app/post-job"
                  onClick={onClose}
                  style={{
                    display: 'inline-block',
                    marginTop: 16,
                    padding: '12px 18px',
                    borderRadius: 10,
                    background: '#fff',
                    color: BUTTON_PRIMARY,
                    fontSize: 12,
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                    textDecoration: 'none',
                  }}
                >
                  Post a job →
                </Link>
              ) : (
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 8,
                    marginTop: 12,
                  }}
                >
                  {jobs.map((j) => {
                    const firstDay =
                      (Array.isArray(j.shoot_days) && j.shoot_days[0]?.date) ||
                      j.start_date ||
                      null
                    return (
                      <button
                        key={j.id}
                        type="button"
                        onClick={() => pickJob(j.id)}
                        disabled={busy}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 10,
                          padding: '12px 14px',
                          background: CARD_BG,
                          border: `1px solid ${CARD_BORDER}`,
                          borderRadius: 12,
                          textAlign: 'left',
                          color: TEXT_PRIMARY,
                          cursor: busy ? 'wait' : 'pointer',
                          opacity: busy ? 0.6 : 1,
                        }}
                      >
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p
                            style={{
                              fontSize: 14,
                              fontWeight: 600,
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {j.title}
                          </p>
                          <p
                            style={{
                              fontSize: 11,
                              color: TEXT_MUTED,
                              marginTop: 2,
                            }}
                          >
                            {firstDay ? firstDay : 'No date set'}
                            {' \u00b7 '}
                            {j.status}
                          </p>
                        </div>
                        <span
                          style={{
                            padding: '6px 12px',
                            borderRadius: 999,
                            background: '#fff',
                            color: BUTTON_PRIMARY,
                            fontSize: 11,
                            fontWeight: 700,
                            letterSpacing: '0.06em',
                            textTransform: 'uppercase',
                          }}
                        >
                          Select
                        </span>
                      </button>
                    )
                  })}
                </div>
              )}
            </>
          )}

          {/* Step 2 — simple confirmation. Rate was already chosen on the
              talent card; the picker just shows what's about to happen. */}
          {selectedJob && (
            <div style={{ padding: '16px 0' }}>
              <p
                style={{
                  fontSize: 14,
                  fontWeight: 600,
                  color: TEXT_PRIMARY,
                  marginBottom: 8,
                }}
              >
                Confirm booking request
              </p>
              <div
                style={{
                  background: CARD_BG,
                  border: `1px solid ${CARD_BORDER}`,
                  borderRadius: 10,
                  padding: '12px 14px',
                  marginBottom: 16,
                }}
              >
                <p
                  style={{
                    fontSize: 12,
                    color: TEXT_MUTED,
                    marginBottom: 4,
                  }}
                >
                  {talent.name} · {selectedJob.title}
                </p>
                {/* Resolve the effective talent-net rate from the card,
                    then mark up to show the client exactly what they'll
                    pay. pickerRateCents is always talent net. */}
                {(() => {
                  const talentNetCents =
                    pickerRateCents ?? talent.day_rate_cents ?? null
                  const clientPaysCents =
                    talentNetCents != null
                      ? Math.round(talentNetCents * RS_MULTIPLIER)
                      : null
                  const isCustom =
                    pickerRateCents != null &&
                    talent.day_rate_cents != null &&
                    pickerRateCents !== talent.day_rate_cents
                  return (
                    <>
                      <p
                        style={{
                          fontSize: 18,
                          fontWeight: 700,
                          color: TEXT_PRIMARY,
                        }}
                      >
                        {clientPaysCents
                          ? `$${(
                              clientPaysCents / 100
                            ).toLocaleString()}/day`
                          : 'Rate TBC'}
                      </p>
                      <p
                        style={{
                          fontSize: 11,
                          color: TEXT_MUTED,
                          marginTop: 2,
                        }}
                      >
                        {talentNetCents != null
                          ? isCustom
                            ? `Custom offer · talent receives $${(
                                talentNetCents / 100
                              ).toLocaleString()}/day`
                            : `Day rate · talent receives $${(
                                talentNetCents / 100
                              ).toLocaleString()}/day`
                          : 'No rate on file yet'}
                      </p>
                    </>
                  )
                })()}
              </div>
              <button
                type="button"
                // The RosterInner handler falls back to pickerRateCents /
                // talent.day_rate_cents when this arg is null, so we pass
                // null and let the single source of truth resolve it.
                onClick={() => onConfirm(selectedJob.id, null)}
                disabled={busy}
                style={{
                  width: '100%',
                  padding: '14px 0',
                  borderRadius: 12,
                  background: '#fff',
                  color: '#1A3C6B',
                  border: 'none',
                  fontSize: 14,
                  fontWeight: 700,
                  cursor: busy ? 'wait' : 'pointer',
                  opacity: busy ? 0.6 : 1,
                }}
              >
                {busy ? 'Requesting…' : 'Confirm booking request'}
              </button>
              <button
                type="button"
                onClick={backToJobs}
                disabled={busy}
                style={{
                  display: 'block',
                  margin: '12px auto 0',
                  background: 'transparent',
                  border: 'none',
                  color: TEXT_MUTED,
                  fontSize: 11,
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                  textDecoration: 'underline',
                  cursor: busy ? 'wait' : 'pointer',
                }}
              >
                ← Choose different job
              </button>
            </div>
          )}

          {!selectedJob && (
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              style={{
                display: 'block',
                margin: '16px auto 0',
                background: 'transparent',
                border: 'none',
                color: TEXT_MUTED,
                fontSize: 11,
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                textDecoration: 'underline',
                cursor: busy ? 'wait' : 'pointer',
              }}
            >
              Cancel
            </button>
          )}
        </div>
      </div>
    </div>
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
  canPickJob,
  added,
  adding,
  onAdd,
}: {
  talent: Talent
  expanded: boolean
  onToggleExpand: () => void
  hasJob: boolean
  canPickJob: boolean
  added: boolean
  adding: boolean
  onAdd: (rateCents: number | null) => void
}) {
  const vimeoId = talent.showreel_url ? getVimeoId(talent.showreel_url) : null
  const deptLabel = talent.department ? DEPARTMENT_LABELS[talent.department] : null

  // With ?jobId= → direct add. Without → open picker (allowed as long as
  // the client has at least one active job).
  const canClickAdd = hasJob || canPickJob

  // Optional custom rate — the client enters what THEY pay (inclusive
  // of the 15% RS fee). We compare against a marked-up floor and
  // convert back to talent net before sending it to the parent.
  const [customRate, setCustomRate] = useState('')
  const customRateCents = customRate
    ? Math.round(parseFloat(customRate) * 100)
    : null
  const clientFloorCents = talent.rate_floor_cents
    ? Math.round(talent.rate_floor_cents * RS_MULTIPLIER)
    : null
  const rateLow = Boolean(
    customRateCents &&
      clientFloorCents &&
      customRateCents < clientFloorCents
  )

  function handleAdd() {
    if (!canClickAdd || added || adding || rateLow) return
    // Client-entered amount → talent net (divide by 1.15). The day rate
    // is already stored as talent net so it needs no conversion.
    const talentNetCents = customRateCents
      ? Math.round(customRateCents / RS_MULTIPLIER)
      : null
    const effectiveRate =
      talentNetCents ?? talent.day_rate_cents ?? null
    onAdd(effectiveRate)
  }

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
          {/* Rate moved below into the dedicated day-rate badge + custom
              rate input row, so this slot now carries no rate copy. */}
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

      {/* Rate row — day-rate reference badge on the left, optional custom
          rate input on the right. Clients accept the day rate by leaving
          the input blank; typing a number opts into a custom offer. */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '0 12px',
          marginBottom: 6,
        }}
      >
        <div
          style={{
            flex: '0 0 auto',
            background: 'rgba(255,255,255,0.08)',
            border: '1px solid rgba(170,189,224,0.2)',
            borderRadius: 8,
            padding: '6px 10px',
          }}
        >
          <p
            style={{
              fontSize: 9,
              color: TEXT_MUTED,
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              marginBottom: 1,
            }}
          >
            Day rate
          </p>
          <p
            style={{ fontSize: 14, fontWeight: 700, color: TEXT_PRIMARY }}
          >
            {/* Shown client-facing: talent net × RS_MULTIPLIER. */}
            {talent.day_rate_cents
              ? `$${Math.round(
                  (talent.day_rate_cents * RS_MULTIPLIER) / 100
                ).toLocaleString()}`
              : '—'}
          </p>
          {talent.rate_floor_cents &&
            talent.day_rate_cents &&
            talent.rate_floor_cents < talent.day_rate_cents && (
              <p
                style={{
                  fontSize: 9,
                  color: 'rgba(170,189,224,0.5)',
                  marginTop: 1,
                }}
              >
                {/* Client-facing floor — the minimum they can offer. */}
                Min offer $
                {Math.round(
                  (talent.rate_floor_cents * RS_MULTIPLIER) / 100
                ).toLocaleString()}
                /day
              </p>
            )}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <p
            style={{
              fontSize: 9,
              color: TEXT_MUTED,
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              marginBottom: 4,
            }}
          >
            Offer (what you pay)
          </p>
          <div style={{ position: 'relative' }}>
            <span
              style={{
                position: 'absolute',
                left: 8,
                top: '50%',
                transform: 'translateY(-50%)',
                color: 'rgba(170,189,224,0.6)',
                fontSize: 13,
                pointerEvents: 'none',
              }}
            >
              $
            </span>
            <input
              type="number"
              inputMode="numeric"
              min={100}
              step={50}
              value={customRate}
              onChange={(e) => setCustomRate(e.target.value)}
              // Placeholder shows the client-facing day rate so the user
              // can gauge what a "normal" offer looks like at a glance.
              placeholder={
                talent.day_rate_cents
                  ? `e.g. ${Math.round(
                      (talent.day_rate_cents * RS_MULTIPLIER) / 100
                    )}`
                  : 'Optional'
              }
              style={{
                width: '100%',
                padding: '7px 8px 7px 20px',
                borderRadius: 8,
                background: 'rgba(255,255,255,0.08)',
                border: `1px solid ${
                  rateLow
                    ? 'rgba(252,165,165,0.5)'
                    : 'rgba(170,189,224,0.2)'
                }`,
                color: TEXT_PRIMARY,
                fontSize: 14,
                fontWeight: 500,
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />
          </div>
        </div>
      </div>

      {/* Silent rate-floor guard */}
      {rateLow && (
        <p
          style={{
            fontSize: 11,
            color: '#fca5a5',
            background: 'rgba(252,165,165,0.1)',
            border: '1px solid rgba(252,165,165,0.25)',
            borderRadius: 8,
            padding: '7px 12px',
            margin: '0 12px 6px',
            lineHeight: 1.4,
          }}
        >
          Rate is below the minimum offer
          {clientFloorCents
            ? ` ($${Math.round(
                clientFloorCents / 100
              ).toLocaleString()}/day)`
            : ''}
          . Try a higher amount.
        </p>
      )}

      {/* Action buttons row */}
      <div
        style={{
          display: 'flex',
          gap: 8,
          padding: '0 12px 12px',
        }}
      >
        <button
          type="button"
          onClick={handleAdd}
          disabled={!canClickAdd || added || adding || rateLow}
          title={
            !canClickAdd ? 'Post a job before adding talent' : undefined
          }
          style={{
            flex: 1,
            padding: '10px 12px',
            borderRadius: 10,
            background: added
              ? 'rgba(74,222,128,0.2)'
              : rateLow
              ? 'rgba(255,255,255,0.1)'
              : '#fff',
            color: added
              ? '#4ade80'
              : rateLow
              ? TEXT_MUTED
              : BUTTON_PRIMARY,
            border: added
              ? '1px solid rgba(74,222,128,0.35)'
              : 'none',
            fontSize: 12,
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            cursor:
              !canClickAdd || added || adding || rateLow
                ? 'not-allowed'
                : 'pointer',
            opacity: !canClickAdd ? 0.55 : rateLow ? 0.45 : 1,
            transition: 'all 120ms ease',
          }}
        >
          {added ? '✓ Added' : adding ? 'Adding…' : 'Add to job'}
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


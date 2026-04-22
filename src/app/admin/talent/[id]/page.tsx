import Link from 'next/link'
import { requireAdmin, centsToUsd, formatDate } from '@/lib/admin-auth'
import { StatusBadge } from '@/components/StatusBadge'
import { TalentAdminControls } from './TalentAdminControls'
import { PaymentForm, type UnpaidBooking } from './PaymentForm'
import { W9Form, Toggle1099SentButton } from './TaxControls'
import { AutoAcceptToggle } from './AutoAcceptToggle'
import { AdminDocumentsPanel } from '@/components/admin/AdminDocumentsPanel'
import { AccountManagementSection } from '@/components/AccountManagement'

export const dynamic = 'force-dynamic'

function todayIsoLA(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Los_Angeles',
  }).format(new Date())
}

function addDaysIso(base: string, n: number): string {
  const parts = base.split('-').map(Number)
  const d = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]))
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

function dateDayMonth(iso: string | null): { day: string; month: string; dow: string } {
  if (!iso) return { day: '—', month: '', dow: '' }
  const parts = iso.split('-').map(Number)
  if (parts.length !== 3 || parts.some(Number.isNaN))
    return { day: '—', month: '', dow: '' }
  const d = new Date(parts[0], parts[1] - 1, parts[2])
  return {
    day: String(d.getDate()),
    month: d.toLocaleString('en-US', { month: 'short' }).toUpperCase(),
    dow: d.toLocaleString('en-US', { weekday: 'short' }),
  }
}

function formatShort(iso: string | null): string {
  if (!iso) return ''
  const parts = iso.split('-').map(Number)
  if (parts.length !== 3 || parts.some(Number.isNaN)) return ''
  const d = new Date(parts[0], parts[1] - 1, parts[2])
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function formatRange(start: string | null, end: string | null): string {
  if (!start) return ''
  if (!end || end === start) return formatShort(start)
  return `${formatShort(start)} – ${formatShort(end)}`
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).slice(0, 2)
  return parts.map((p) => p[0]?.toUpperCase() ?? '').join('') || '?'
}

function unwrap<T>(v: T | T[] | null | undefined): T | null {
  if (v == null) return null
  return Array.isArray(v) ? v[0] ?? null : v
}

/** Build a set of iso dates covered by a booking (start through end inclusive). */
function bookingDateSet(start: string | null, end: string | null): string[] {
  if (!start) return []
  const out: string[] = []
  const from = new Date(start + 'T00:00:00Z')
  const to = end ? new Date(end + 'T00:00:00Z') : from
  const cur = new Date(from)
  while (cur.getTime() <= to.getTime()) {
    out.push(cur.toISOString().slice(0, 10))
    cur.setUTCDate(cur.getUTCDate() + 1)
  }
  return out
}

type Profile = {
  id: string
  first_name: string | null
  last_name: string | null
  full_name: string | null
  email: string | null
  phone: string | null
  avatar_url: string | null
  city: string | null
  verified: boolean
  verified_at: string | null
  account_status: 'active' | 'paused' | 'deleted' | null
  created_at: string | null
}

type TalentProfile = {
  department: string | null
  primary_role: string | null
  secondary_roles: string[] | null
  bio: string | null
  day_rate_cents: number | null
  half_day_rate_cents: number | null
  rate_floor_cents: number | null
  showreel_url: string | null
  equipment: string | null
  union_eligible: boolean | null
  travel_radius_miles: number | null
  admin_notes: string | null
}

type ClientJoin = {
  full_name: string | null
  client_profiles:
    | { company_name: string | null }
    | { company_name: string | null }[]
    | null
}

type BookingRow = {
  id: string
  status: string
  confirmed_rate_cents: number | null
  paid: boolean | null
  paid_at: string | null
  created_at: string | null
  jobs:
    | {
        id: string
        title: string
        start_date: string | null
        end_date: string | null
        location: string | null
        status: string
        profiles: ClientJoin | ClientJoin[] | null
      }
    | {
        id: string
        title: string
        start_date: string | null
        end_date: string | null
        location: string | null
        status: string
        profiles: ClientJoin | ClientJoin[] | null
      }[]
    | null
}

export default async function AdminTalentDetailPage({
  params,
}: {
  params: { id: string }
}) {
  const { supabase } = await requireAdmin()

  const today = todayIsoLA()
  const fortyFiveOut = addDaysIso(today, 45)

  const currentYear = new Date().getFullYear()
  const [
    profileRes,
    talentRes,
    availabilityRes,
    bookingsRes,
    paymentsRes,
    taxRes,
    relationshipsRes,
  ] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', params.id).maybeSingle(),
    supabase.from('talent_profiles').select('*').eq('id', params.id).maybeSingle(),
    supabase
      .from('availability')
      .select('date, status')
      .eq('talent_id', params.id)
      .gte('date', today)
      .lte('date', fortyFiveOut)
      .order('date'),
    supabase
      .from('job_bookings')
      .select(
        `id, status, confirmed_rate_cents, paid, paid_at, created_at,
         jobs (id, title, start_date, end_date, location, status,
           profiles!jobs_client_id_fkey (full_name,
             client_profiles (company_name)))`
      )
      .eq('talent_id', params.id)
      .order('created_at', { ascending: false }),
    supabase
      .from('talent_payments')
      .select(
        `id, amount_cents, payment_date, payment_method, reference, notes,
         booking_id, job_id, created_at,
         jobs (title)`
      )
      .eq('talent_id', params.id)
      .order('payment_date', { ascending: false }),
    supabase
      .from('talent_tax_records')
      .select('*')
      .eq('talent_id', params.id)
      .eq('tax_year', currentYear)
      .maybeSingle(),
    supabase
      .from('client_talent_relationships')
      .select(
        `client_id, auto_accept, auto_accept_rate, jobs_together,
         profiles!client_talent_relationships_client_id_fkey (full_name,
           client_profiles (company_name))`
      )
      .eq('talent_id', params.id)
      .order('jobs_together', { ascending: false }),
  ])

  const profile = profileRes.data as unknown as Profile | null
  if (!profile) {
    return (
      <div className="px-5 pt-5">
        <Link href="/admin/talent" style={{ color: '#7A90AA', fontSize: 13 }}>
          ← Talent
        </Link>
        <p
          className="mt-3"
          style={{ fontSize: 14, color: '#AABDE0', fontStyle: 'italic' }}
        >
          Talent not found.
        </p>
      </div>
    )
  }

  const tp = (talentRes.data ?? null) as unknown as TalentProfile | null
  const availability = (availabilityRes.data ?? []) as Array<{
    date: string
    status: string
  }>
  const bookings = (bookingsRes.data ?? []) as unknown as BookingRow[]

  // ─── Derive earnings ───
  let paidCents = 0
  let unpaidCents = 0
  let confirmedCount = 0
  let completedCount = 0
  for (const b of bookings) {
    if (b.status === 'confirmed' || b.status === 'completed') {
      confirmedCount += b.status === 'confirmed' ? 1 : 0
      completedCount += b.status === 'completed' ? 1 : 0
      if (b.paid) paidCents += b.confirmed_rate_cents ?? 0
      else if (b.status === 'confirmed')
        unpaidCents += b.confirmed_rate_cents ?? 0
    }
  }

  // ─── Build date sets for booking indicators on calendar ───
  const confirmedDates = new Set<string>()
  const requestedDates = new Set<string>()
  for (const b of bookings) {
    const j = unwrap(b.jobs)
    if (!j) continue
    const dates = bookingDateSet(j.start_date, j.end_date)
    if (b.status === 'confirmed' || b.status === 'completed') {
      for (const d of dates) confirmedDates.add(d)
    } else if (b.status === 'requested') {
      for (const d of dates) requestedDates.add(d)
    }
  }

  // ─── Build 45-day grid ───
  const availByDate = new Map<string, string>()
  for (const a of availability) availByDate.set(a.date, a.status)

  type Cell = { date: string; status: string | null; day: number; dow: string }
  const cells: Cell[] = []
  for (let i = 0; i < 45; i++) {
    const iso = addDaysIso(today, i)
    const d = new Date(iso + 'T00:00:00Z')
    cells.push({
      date: iso,
      status: availByDate.get(iso) ?? null,
      day: d.getUTCDate(),
      dow: d.toLocaleString('en-US', {
        weekday: 'short',
        timeZone: 'UTC',
      }),
    })
  }

  const displayName =
    [profile.first_name, profile.last_name].filter(Boolean).join(' ') ||
    profile.full_name ||
    'Unnamed'

  function cellColor(status: string | null) {
    switch (status) {
      case 'available':
        return {
          bg: 'rgba(34,197,94,0.22)',
          color: '#86EFAC',
          border: 'rgba(34,197,94,0.35)',
        }
      case 'hold':
        return {
          bg: 'rgba(240,165,0,0.22)',
          color: '#F0A500',
          border: 'rgba(240,165,0,0.35)',
        }
      case 'unavailable':
        return {
          bg: 'rgba(239,68,68,0.22)',
          color: '#F87171',
          border: 'rgba(239,68,68,0.35)',
        }
      default:
        return {
          bg: '#253D5E',
          color: '#7A90AA',
          border: 'transparent',
        }
    }
  }

  function clientLabel(row: ClientJoin | ClientJoin[] | null): string {
    const c = unwrap(row)
    if (!c) return 'Unknown client'
    const cp = unwrap(c.client_profiles)
    return cp?.company_name || c.full_name || 'Unknown client'
  }

  return (
    <div className="mx-auto" style={{ maxWidth: 720, padding: '20px 18px 28px' }}>
      <Link href="/admin/talent" style={{ fontSize: 13, color: '#7A90AA', textDecoration: 'none' }}>
        ← Talent
      </Link>

      {/* ─── Profile header card ─── */}
      <section
        className="mt-3 rounded-xl bg-[#1A2E4A] border border-white/5"
        style={{ padding: 20 }}
      >
        <div className="flex items-start gap-4">
          <div
            className="rounded-full overflow-hidden"
            style={{
              width: 72,
              height: 72,
              background: '#1E3A6B',
              color: '#fff',
              fontSize: 24,
              fontWeight: 700,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            {profile.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={profile.avatar_url}
                alt=""
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
            ) : (
              initials(displayName)
            )}
          </div>

          <div style={{ flex: 1, minWidth: 0 }}>
            <h1
              className="text-white"
              style={{ fontSize: 20, fontWeight: 600, lineHeight: 1.2 }}
            >
              {displayName}
            </h1>
            <p style={{ fontSize: 14, color: '#AABDE0', marginTop: 2 }}>
              {[tp?.department, tp?.primary_role].filter(Boolean).join(' · ') ||
                'No department'}
            </p>
            {profile.city && (
              <p style={{ fontSize: 13, color: '#7A90AA', marginTop: 1 }}>
                {profile.city}
              </p>
            )}

            <div className="flex flex-wrap gap-2 mt-2">
              <StatusBadge
                status={profile.verified ? 'verified' : 'pending'}
                size="sm"
                label={profile.verified ? 'Verified' : 'Unverified'}
              />
              {tp?.union_eligible && (
                <span
                  className="rounded-full"
                  style={{
                    padding: '3px 8px',
                    fontSize: 10,
                    fontWeight: 700,
                    letterSpacing: '0.06em',
                    textTransform: 'uppercase',
                    background: 'rgba(170,189,224,0.15)',
                    color: '#AABDE0',
                    border: '1px solid rgba(170,189,224,0.25)',
                  }}
                >
                  Union eligible
                </span>
              )}
              {tp?.department && (
                <span
                  className="rounded-full"
                  style={{
                    padding: '3px 8px',
                    fontSize: 10,
                    fontWeight: 700,
                    letterSpacing: '0.06em',
                    textTransform: 'uppercase',
                    background: 'rgba(59,130,246,0.18)',
                    color: '#93C5FD',
                    border: '1px solid rgba(59,130,246,0.35)',
                  }}
                >
                  {tp.department}
                </span>
              )}
            </div>
          </div>

          <div
            className="text-right"
            style={{ marginLeft: 'auto', flexShrink: 0 }}
          >
            <p
              className="text-white"
              style={{ fontSize: 24, fontWeight: 600, lineHeight: 1 }}
            >
              {tp?.day_rate_cents != null ? centsToUsd(tp.day_rate_cents) : '—'}
            </p>
            <p style={{ fontSize: 12, color: '#7A90AA', marginTop: 2 }}>
              per day
            </p>
            {tp?.rate_floor_cents != null && (
              <p style={{ fontSize: 11, color: '#AABDE0', marginTop: 6 }}>
                Floor: {centsToUsd(tp.rate_floor_cents)}
              </p>
            )}
            {tp?.half_day_rate_cents != null && (
              <p style={{ fontSize: 11, color: '#AABDE0', marginTop: 2 }}>
                Half day: {centsToUsd(tp.half_day_rate_cents)}
              </p>
            )}
          </div>
        </div>

        {(profile.email || profile.phone || tp?.showreel_url) && (
          <div
            className="flex flex-wrap gap-x-4 gap-y-2 mt-4 pt-4"
            style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }}
          >
            {profile.email && (
              <a
                href={`mailto:${profile.email}`}
                className="inline-flex items-center gap-1.5"
                style={{ fontSize: 13, color: '#AABDE0', textDecoration: 'underline' }}
              >
                <span aria-hidden>✉︎</span>
                {profile.email}
              </a>
            )}
            {profile.phone && (
              <a
                href={`tel:${profile.phone}`}
                className="inline-flex items-center gap-1.5"
                style={{ fontSize: 13, color: '#AABDE0', textDecoration: 'underline' }}
              >
                <span aria-hidden>☎</span>
                {profile.phone}
              </a>
            )}
            {tp?.showreel_url && (
              <a
                href={tp.showreel_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5"
                style={{ fontSize: 13, color: '#AABDE0', textDecoration: 'underline' }}
              >
                <span aria-hidden>▶</span>
                Showreel ↗
              </a>
            )}
          </div>
        )}
      </section>

      {/* ─── Earnings strip ─── */}
      <section className="mt-4 flex gap-3">
        <EarningsChip label="Paid" value={centsToUsd(paidCents)} tone="green" />
        <EarningsChip
          label="Outstanding"
          value={centsToUsd(unpaidCents)}
          tone={unpaidCents > 0 ? 'amber' : 'default'}
        />
        <EarningsChip
          label="Jobs"
          value={String(confirmedCount + completedCount)}
        />
        <EarningsChip
          label="Travel miles"
          value={
            tp?.travel_radius_miles != null ? String(tp.travel_radius_miles) : '—'
          }
        />
      </section>

      {/* ─── Bio ─── */}
      {tp?.bio && (
        <section
          className="mt-4 rounded-xl bg-[#1A2E4A] border border-white/5"
          style={{ padding: 16 }}
        >
          <p
            style={{
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              color: '#7A90AA',
              marginBottom: 8,
            }}
          >
            Bio
          </p>
          <p
            style={{
              fontSize: 14,
              color: '#C5D3E8',
              lineHeight: 1.55,
              whiteSpace: 'pre-wrap',
            }}
          >
            {tp.bio}
          </p>
        </section>
      )}

      {/* ─── Equipment ─── */}
      {tp?.equipment && (
        <section
          className="mt-3 rounded-xl bg-[#1A2E4A] border border-white/5"
          style={{ padding: 16 }}
        >
          <p
            style={{
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              color: '#7A90AA',
              marginBottom: 8,
            }}
          >
            Equipment
          </p>
          <p
            style={{
              fontSize: 14,
              color: '#C5D3E8',
              lineHeight: 1.55,
              whiteSpace: 'pre-wrap',
            }}
          >
            {tp.equipment}
          </p>
        </section>
      )}

      {/* ─── Availability calendar ─── */}
      <section
        className="mt-4 rounded-xl bg-[#1A2E4A] border border-white/5"
        style={{ padding: 16 }}
      >
        <p
          style={{
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            color: '#7A90AA',
            marginBottom: 10,
          }}
        >
          Availability — next 45 days
        </p>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(38px, 1fr))',
            gap: 6,
          }}
        >
          {cells.map((cell) => {
            const c = cellColor(cell.status)
            const bookingDot = confirmedDates.has(cell.date)
              ? '#4ADE80'
              : requestedDates.has(cell.date)
              ? '#F0A500'
              : null
            return (
              <div
                key={cell.date}
                title={`${cell.date} — ${cell.status ?? 'no record'}`}
                className="rounded-lg relative"
                style={{
                  background: c.bg,
                  color: c.color,
                  border: `1px solid ${c.border}`,
                  minHeight: 42,
                  padding: '4px 0',
                  textAlign: 'center',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 1,
                }}
              >
                <span style={{ fontSize: 13, fontWeight: 700, lineHeight: 1 }}>
                  {cell.day}
                </span>
                <span style={{ fontSize: 9, opacity: 0.8 }}>{cell.dow}</span>
                {bookingDot && (
                  <span
                    aria-hidden
                    style={{
                      position: 'absolute',
                      bottom: 3,
                      left: '50%',
                      transform: 'translateX(-50%)',
                      width: 5,
                      height: 5,
                      borderRadius: 999,
                      background: bookingDot,
                    }}
                  />
                )}
              </div>
            )
          })}
        </div>

        <div
          className="flex flex-wrap gap-4 mt-3"
          style={{ fontSize: 11, color: '#AABDE0' }}
        >
          <LegendDot color="#22C55E" label="Available" />
          <LegendDot color="#F0A500" label="Hold" />
          <LegendDot color="#EF4444" label="Unavailable" />
          <LegendDot color="#7A90AA" label="No data" />
        </div>
      </section>

      {/* ─── Booking history ─── */}
      <section className="mt-4">
        <div className="flex items-center justify-between mb-2">
          <p
            style={{
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              color: '#7A90AA',
            }}
          >
            Booking history
          </p>
          <span style={{ fontSize: 11, color: '#7A90AA' }}>
            {bookings.length} total
          </span>
        </div>
        {bookings.length === 0 ? (
          <div
            className="rounded-xl bg-[#1A2E4A] border border-white/5 text-center"
            style={{ padding: '22px 18px' }}
          >
            <p style={{ fontSize: 13, color: '#7A90AA' }}>No bookings yet</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {bookings.map((b) => {
              const j = unwrap(b.jobs)
              const dm = dateDayMonth(j?.start_date ?? null)
              const range = formatRange(j?.start_date ?? null, j?.end_date ?? null)
              return (
                <article
                  key={b.id}
                  className="rounded-xl"
                  style={{
                    background: '#253D5E',
                    padding: 14,
                    border: '1px solid rgba(255,255,255,0.05)',
                  }}
                >
                  <div className="flex items-start gap-3">
                    <div
                      className="flex flex-col items-center justify-center rounded-lg"
                      style={{
                        width: 48,
                        minHeight: 52,
                        background: '#0F1B2E',
                        flexShrink: 0,
                      }}
                    >
                      <span
                        className="text-white"
                        style={{ fontSize: 18, fontWeight: 700, lineHeight: 1 }}
                      >
                        {dm.day}
                      </span>
                      <span
                        style={{
                          fontSize: 10,
                          color: '#7A90AA',
                          letterSpacing: '0.12em',
                          marginTop: 2,
                        }}
                      >
                        {dm.month}
                      </span>
                    </div>

                    <div style={{ flex: 1, minWidth: 0 }}>
                      {j ? (
                        <Link
                          href={`/admin/jobs/${j.id}`}
                          style={{
                            fontSize: 14,
                            fontWeight: 500,
                            color: '#fff',
                            textDecoration: 'none',
                            display: 'inline-block',
                            maxWidth: '100%',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {j.title}
                        </Link>
                      ) : (
                        <span
                          style={{ fontSize: 14, color: '#fff', fontWeight: 500 }}
                        >
                          Untitled job
                        </span>
                      )}
                      <p
                        style={{
                          fontSize: 12,
                          color: '#AABDE0',
                          marginTop: 2,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {clientLabel(j?.profiles ?? null)}
                        {range && ` · ${range}`}
                      </p>
                      {j?.location && (
                        <p
                          style={{
                            fontSize: 12,
                            color: '#7A90AA',
                            marginTop: 1,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {j.location}
                        </p>
                      )}
                    </div>

                    <div
                      className="flex flex-col items-end gap-1"
                      style={{ flexShrink: 0 }}
                    >
                      <StatusBadge status={b.status} size="sm" />
                      {b.confirmed_rate_cents != null && (
                        <span style={{ fontSize: 12, color: '#AABDE0' }}>
                          {centsToUsd(b.confirmed_rate_cents)}/day
                        </span>
                      )}
                      {b.paid && (
                        <span
                          className="rounded-full"
                          style={{
                            padding: '2px 8px',
                            fontSize: 9,
                            fontWeight: 700,
                            letterSpacing: '0.08em',
                            textTransform: 'uppercase',
                            background: 'rgba(16,185,129,0.2)',
                            color: '#10B981',
                            border: '1px solid rgba(16,185,129,0.3)',
                          }}
                        >
                          Paid
                        </span>
                      )}
                    </div>
                  </div>
                </article>
              )
            })}
          </div>
        )}
      </section>

      {/* ─── Admin controls ─── */}
      <section
        className="mt-4 rounded-xl bg-[#1A2E4A] border border-white/5"
        style={{ padding: 16 }}
      >
        <p
          style={{
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            color: '#7A90AA',
            marginBottom: 14,
          }}
        >
          Admin controls
        </p>
        <TalentAdminControls
          talentId={profile.id}
          verified={profile.verified}
          dayRateCents={tp?.day_rate_cents ?? null}
          rateFloorCents={tp?.rate_floor_cents ?? null}
          adminNotes={tp?.admin_notes ?? null}
        />
      </section>

      {/* ─── Returning clients (auto-accept) ─── */}
      {(() => {
        type RelRow = {
          client_id: string
          auto_accept: boolean | null
          auto_accept_rate: number | null
          jobs_together: number | null
          profiles:
            | {
                full_name: string | null
                client_profiles:
                  | { company_name: string | null }
                  | { company_name: string | null }[]
                  | null
              }
            | {
                full_name: string | null
                client_profiles:
                  | { company_name: string | null }
                  | { company_name: string | null }[]
                  | null
              }[]
            | null
        }
        const rels = (relationshipsRes.data ?? []) as unknown as RelRow[]
        if (rels.length === 0) return null
        return (
          <section className="mt-4">
            <p
              style={{
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: '0.14em',
                textTransform: 'uppercase',
                color: '#7A90AA',
                marginBottom: 10,
              }}
            >
              Returning clients
            </p>
            <div className="flex flex-col gap-2">
              {rels.map((r) => {
                const clientProfile = Array.isArray(r.profiles)
                  ? r.profiles[0] ?? null
                  : r.profiles
                const cp = clientProfile
                  ? Array.isArray(clientProfile.client_profiles)
                    ? clientProfile.client_profiles[0] ?? null
                    : clientProfile.client_profiles
                  : null
                const name =
                  cp?.company_name ||
                  clientProfile?.full_name ||
                  'Unknown client'
                return (
                  <AutoAcceptToggle
                    key={r.client_id}
                    clientId={r.client_id}
                    talentId={profile.id}
                    companyName={name}
                    jobsTogether={r.jobs_together ?? 0}
                    autoAccept={Boolean(r.auto_accept)}
                    autoAcceptRateCents={r.auto_accept_rate}
                    defaultRateCents={tp?.day_rate_cents ?? null}
                  />
                )
              })}
            </div>
          </section>
        )
      })()}

      {/* ─── Payments ─── */}
      {(() => {
        type PaymentRow = {
          id: string
          amount_cents: number | null
          payment_date: string
          payment_method: string | null
          reference: string | null
          notes: string | null
          booking_id: string | null
          job_id: string | null
          created_at: string | null
          jobs: { title: string | null } | { title: string | null }[] | null
        }
        const payments = (paymentsRes.data ?? []) as unknown as PaymentRow[]
        const totalPaidOut = payments.reduce(
          (s, p) => s + (p.amount_cents ?? 0),
          0
        )

        // Bookings eligible for direct linkage: confirmed + unpaid + no booking_id already matched.
        const unpaidBookings: UnpaidBooking[] = bookings
          .filter((b) => b.status === 'confirmed' && !b.paid)
          .map((b) => {
            const j = unwrap(b.jobs)
            return {
              id: b.id,
              amountCents: b.confirmed_rate_cents,
              jobTitle: j?.title ?? null,
              jobStart: j?.start_date ?? null,
            }
          })

        return (
          <section className="mt-4">
            <div className="flex items-center justify-between mb-2">
              <p
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: '0.14em',
                  textTransform: 'uppercase',
                  color: '#7A90AA',
                }}
              >
                Payments
              </p>
              <span style={{ fontSize: 11, color: '#7A90AA' }}>
                Total paid out: {centsToUsd(totalPaidOut)}
              </span>
            </div>
            <div
              className="rounded-xl bg-[#1A2E4A] border border-white/5"
              style={{ padding: 14 }}
            >
              <PaymentForm
                talentId={profile.id}
                unpaidBookings={unpaidBookings}
              />

              {payments.length === 0 ? (
                <p
                  className="mt-3"
                  style={{ fontSize: 13, color: '#7A90AA', fontStyle: 'italic' }}
                >
                  No payments recorded yet.
                </p>
              ) : (
                <div
                  className="mt-3 flex flex-col"
                  style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}
                >
                  {payments.map((p) => {
                    const j = unwrap(p.jobs)
                    return (
                      <div
                        key={p.id}
                        className="flex items-start gap-3"
                        style={{
                          padding: '10px 0',
                          borderBottom: '1px solid rgba(255,255,255,0.04)',
                        }}
                      >
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p
                            className="text-white"
                            style={{ fontSize: 13, fontWeight: 500 }}
                          >
                            {j?.title ?? 'Payment'}
                          </p>
                          <p
                            style={{
                              fontSize: 11,
                              color: '#7A90AA',
                              marginTop: 2,
                            }}
                          >
                            {formatDate(p.payment_date)} · {p.payment_method ?? '—'}
                            {p.reference ? ` · ${p.reference}` : ''}
                          </p>
                        </div>
                        <span
                          className="text-white"
                          style={{ fontSize: 14, fontWeight: 700, whiteSpace: 'nowrap' }}
                        >
                          {centsToUsd(p.amount_cents)}
                        </span>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </section>
        )
      })()}

      {/* ─── Tax & compliance ─── */}
      {(() => {
        const tax = taxRes.data as unknown as {
          tax_year: number
          w9_received: boolean | null
          w9_drive_url: string | null
          legal_name: string | null
          tax_id_last4: string | null
          entity_type: string | null
          total_paid_cents: number | null
          requires_1099: boolean | null
          form_1099_sent: boolean | null
        } | null

        const totalPaid = tax?.total_paid_cents ?? 0
        const requires1099 = Boolean(tax?.requires_1099) || totalPaid >= 60000
        const w9 = Boolean(tax?.w9_received)
        const sent1099 = Boolean(tax?.form_1099_sent)

        return (
          <section className="mt-4">
            <p
              style={{
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: '0.14em',
                textTransform: 'uppercase',
                color: '#7A90AA',
                marginBottom: 8,
              }}
            >
              Tax &amp; compliance
            </p>
            <div
              className="rounded-xl bg-[#1A2E4A] border border-white/5"
              style={{ padding: 16 }}
            >
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      letterSpacing: '0.14em',
                      textTransform: 'uppercase',
                      color: '#7A90AA',
                    }}
                  >
                    {currentYear} tax year
                  </p>
                  <p
                    style={{
                      fontSize: 18,
                      fontWeight: 700,
                      color: totalPaid >= 60000 ? '#4ADE80' : '#C5D3E8',
                      marginTop: 2,
                    }}
                  >
                    {centsToUsd(totalPaid)}
                  </p>
                  <p style={{ fontSize: 11, color: '#7A90AA', marginTop: 2 }}>
                    Total paid this year
                  </p>
                </div>
                {requires1099 && (
                  <span
                    className="rounded-full"
                    style={{
                      padding: '3px 10px',
                      fontSize: 10,
                      fontWeight: 700,
                      letterSpacing: '0.08em',
                      textTransform: 'uppercase',
                      background: 'rgba(240,165,0,0.18)',
                      color: '#F0A500',
                      border: '1px solid rgba(240,165,0,0.35)',
                    }}
                  >
                    1099-NEC required
                  </span>
                )}
              </div>

              {/* W-9 row */}
              <div
                className="mt-4 pt-4"
                style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}
              >
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div>
                    <p
                      style={{
                        fontSize: 10,
                        fontWeight: 700,
                        letterSpacing: '0.14em',
                        textTransform: 'uppercase',
                        color: '#7A90AA',
                      }}
                    >
                      W-9
                    </p>
                    {w9 ? (
                      <p
                        style={{
                          fontSize: 13,
                          color: '#4ADE80',
                          fontWeight: 600,
                          marginTop: 2,
                        }}
                      >
                        ✓ On file
                        {tax?.legal_name ? ` — ${tax.legal_name}` : ''}
                        {tax?.tax_id_last4 ? ` (•••${tax.tax_id_last4})` : ''}
                      </p>
                    ) : (
                      <p
                        style={{
                          fontSize: 13,
                          color: '#F0A500',
                          fontWeight: 600,
                          marginTop: 2,
                        }}
                      >
                        Not received
                      </p>
                    )}
                  </div>
                  {w9 && tax?.w9_drive_url && (
                    <a
                      href={tax.w9_drive_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        fontSize: 12,
                        color: '#F0A500',
                        fontWeight: 600,
                        textDecoration: 'underline',
                      }}
                    >
                      View in Drive ↗
                    </a>
                  )}
                </div>
                {!w9 && (
                  <div className="mt-3">
                    <W9Form talentId={profile.id} />
                  </div>
                )}
              </div>

              {/* 1099 row */}
              {requires1099 && (
                <div
                  className="mt-4 pt-4"
                  style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}
                >
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div>
                      <p
                        style={{
                          fontSize: 10,
                          fontWeight: 700,
                          letterSpacing: '0.14em',
                          textTransform: 'uppercase',
                          color: '#7A90AA',
                        }}
                      >
                        1099-NEC
                      </p>
                      <p
                        style={{
                          fontSize: 13,
                          color: sent1099 ? '#4ADE80' : '#F0A500',
                          fontWeight: 600,
                          marginTop: 2,
                        }}
                      >
                        {sent1099 ? 'Sent' : 'Not yet sent'}
                      </p>
                    </div>
                    <Toggle1099SentButton
                      talentId={profile.id}
                      sent={sent1099}
                    />
                  </div>
                </div>
              )}
            </div>
          </section>
        )
      })()}

      {/* Documents on file — W-9 scans, IDs, business registrations, etc.
          Admin can upload on behalf of a talent (e.g. W-9 arrived via email). */}
      <section className="mt-4">
        <p
          style={{
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            color: '#7A90AA',
            marginBottom: 8,
          }}
        >
          Documents on file
        </p>
        <AdminDocumentsPanel ownerId={profile.id} role="talent" />
      </section>

      <AccountManagementSection
        accountId={profile.id}
        accountType="talent"
        status={
          (profile.account_status as 'active' | 'paused' | 'deleted' | null) ??
          'active'
        }
        displayName={
          [profile.first_name, profile.last_name].filter(Boolean).join(' ') ||
          profile.full_name ||
          profile.email ||
          'this account'
        }
      />

      <div className="mt-6 text-center">
        <Link
          href={`/admin/talent/${profile.id}/edit`}
          style={{
            fontSize: 12,
            color: '#7A90AA',
            textDecoration: 'underline',
          }}
        >
          Edit full profile →
        </Link>
      </div>
    </div>
  )
}

function EarningsChip({
  label,
  value,
  tone = 'default',
}: {
  label: string
  value: string
  tone?: 'default' | 'amber' | 'green'
}) {
  const color =
    tone === 'amber' ? '#F0A500' : tone === 'green' ? '#4ADE80' : '#fff'
  return (
    <div
      className="rounded-xl"
      style={{
        background: '#0F1B2E',
        padding: 12,
        flex: 1,
        textAlign: 'center',
        border: '1px solid rgba(255,255,255,0.05)',
      }}
    >
      <p style={{ fontSize: 18, fontWeight: 600, color, lineHeight: 1 }}>
        {value}
      </p>
      <p
        style={{
          fontSize: 10,
          color: '#7A90AA',
          textTransform: 'uppercase',
          letterSpacing: '0.14em',
          marginTop: 4,
          fontWeight: 700,
        }}
      >
        {label}
      </p>
    </div>
  )
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        aria-hidden
        style={{
          display: 'inline-block',
          width: 8,
          height: 8,
          borderRadius: 999,
          background: color,
        }}
      />
      {label}
    </span>
  )
}

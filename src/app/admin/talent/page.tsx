import Link from 'next/link'
import { requireAdmin, centsToUsd, formatDate } from '@/lib/admin-auth'
// formatDate used in ApplicationCard below.
import { StatusBadge } from '@/components/StatusBadge'
import { approveApplication, declineApplication } from './actions'
import { TalentFilterClient } from './TalentFilterClient'

export const dynamic = 'force-dynamic'

type TalentProfileJoin = {
  department: string | null
  primary_role: string | null
  day_rate_cents: number | null
  rate_floor_cents: number | null
  bio: string | null
}

type Row = {
  id: string
  full_name: string | null
  first_name: string | null
  last_name: string | null
  email: string | null
  city: string | null
  avatar_url: string | null
  verified: boolean
  verified_at: string | null
  created_at: string | null
  talent_profiles:
    | TalentProfileJoin
    | TalentProfileJoin[]
    | null
  job_bookings: Array<{ id: string; status: string }> | null
}

type ApplicationRow = {
  id: string
  first_name: string | null
  last_name: string | null
  email: string
  department: string | null
  instagram: string | null
  website: string | null
  message: string | null
  created_at: string | null
}

function unwrap<T>(v: T | T[] | null | undefined): T | null {
  if (v == null) return null
  return Array.isArray(v) ? v[0] ?? null : v
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).slice(0, 2)
  return parts.map((p) => p[0]?.toUpperCase() ?? '').join('') || '?'
}

function talentName(r: Row): string {
  return (
    [r.first_name, r.last_name].filter(Boolean).join(' ') ||
    r.full_name ||
    'Unnamed'
  )
}

function appName(a: ApplicationRow): string {
  return (
    [a.first_name, a.last_name].filter(Boolean).join(' ') ||
    a.email ||
    'Applicant'
  )
}

export default async function AdminTalentPage({
  searchParams,
}: {
  searchParams: { filter?: string }
}) {
  const { supabase } = await requireAdmin()

  const [talentRes, appsRes] = await Promise.all([
    supabase
      .from('profiles')
      .select(
        `id, full_name, first_name, last_name, email, city, avatar_url,
         verified, verified_at, created_at,
         talent_profiles (department, primary_role, day_rate_cents,
           rate_floor_cents, bio),
         job_bookings!job_bookings_talent_id_fkey (id, status)`
      )
      .eq('role', 'talent')
      .order('verified', { ascending: false })
      .order('last_name', { ascending: true, nullsFirst: false }),
    supabase
      .from('talent_applications')
      .select(
        `id, first_name, last_name, email, department,
         instagram, website, message, created_at`
      )
      .eq('status', 'pending')
      .order('created_at', { ascending: true }),
  ])

  const rows = (talentRes.data ?? []) as unknown as Row[]
  const apps = (appsRes.data ?? []) as ApplicationRow[]

  const filter = searchParams.filter ?? 'all'
  const filtered = rows.filter((r) => {
    if (filter === 'verified') return r.verified
    if (filter === 'unverified') return !r.verified
    return true
  })

  const verifiedCount = rows.filter((r) => r.verified).length

  return (
    <div
      className="mx-auto"
      style={{ maxWidth: 720, padding: '20px 18px 28px' }}
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-white" style={{ fontSize: 20, fontWeight: 600 }}>
            Talent
          </h1>
          <p style={{ fontSize: 12, color: '#7A90AA', marginTop: 2 }}>
            {rows.length} total · {verifiedCount} verified
          </p>
        </div>
        <Link
          href="/admin/talent/new"
          className="rounded-lg bg-[#1E3A6B] hover:bg-[#253D8A] text-white transition-colors"
          style={{
            padding: '8px 16px',
            fontSize: 13,
            fontWeight: 500,
            textDecoration: 'none',
            whiteSpace: 'nowrap',
          }}
        >
          + Add talent
        </Link>
      </div>

      {/* Pending applications */}
      {apps.length > 0 && (
        <section className="mt-6">
          <p
            style={{
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              color: '#F0A500',
              marginBottom: 8,
            }}
          >
            Applications
          </p>
          <div
            className="rounded-xl"
            style={{
              background: 'rgba(240,165,0,0.10)',
              border: '1px solid rgba(240,165,0,0.25)',
              padding: 16,
            }}
          >
            <p
              style={{
                fontSize: 13,
                color: '#F0A500',
                fontWeight: 600,
              }}
            >
              ⚠ {apps.length} application{apps.length === 1 ? '' : 's'} awaiting review
            </p>
          </div>

          <div className="mt-2 flex flex-col gap-2">
            {apps.map((a) => (
              <ApplicationCard key={a.id} app={a} />
            ))}
          </div>
        </section>
      )}

      <div className="mt-6">
        <TalentFilterClient current={filter} />
      </div>

      {filtered.length === 0 ? (
        <div
          className="mt-4 rounded-xl bg-[#1A2E4A] border border-white/5 text-center"
          style={{ padding: '22px 20px' }}
        >
          <p style={{ fontSize: 13, color: '#7A90AA' }}>
            {rows.length === 0
              ? 'No talent yet. Add your first talent member.'
              : `No ${filter} talent`}
          </p>
        </div>
      ) : (
        <div className="mt-4 flex flex-col gap-2.5">
          {filtered.map((r) => {
            const tp = unwrap(r.talent_profiles)
            const name = talentName(r)
            const bookings = Array.isArray(r.job_bookings) ? r.job_bookings : []
            const confirmedCount = bookings.filter(
              (b) => b.status === 'confirmed'
            ).length
            const pendingCount = bookings.filter(
              (b) => b.status === 'requested'
            ).length

            return (
              <Link
                key={r.id}
                href={`/admin/talent/${r.id}`}
                className="block rounded-xl bg-[#1A2E4A] border border-white/5 hover:border-white/10 transition-colors"
                style={{ padding: 16, textDecoration: 'none' }}
              >
                <div className="flex items-start gap-3">
                  {/* Avatar */}
                  <div
                    style={{
                      position: 'relative',
                      flexShrink: 0,
                      width: 52,
                      height: 52,
                    }}
                  >
                    <div
                      className="rounded-full overflow-hidden"
                      style={{
                        width: 52,
                        height: 52,
                        background: '#1E3A6B',
                        color: '#fff',
                        fontSize: 16,
                        fontWeight: 700,
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      {r.avatar_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={r.avatar_url}
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
                    {r.verified && (
                      <span
                        aria-hidden
                        style={{
                          position: 'absolute',
                          right: 0,
                          bottom: 0,
                          width: 14,
                          height: 14,
                          borderRadius: 999,
                          background: '#22C55E',
                          border: '2px solid #1A2E4A',
                        }}
                      />
                    )}
                  </div>

                  {/* Middle */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p
                      className="text-white"
                      style={{
                        fontSize: 15,
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
                        fontSize: 13,
                        color: '#AABDE0',
                        marginTop: 1,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {[tp?.department, tp?.primary_role]
                        .filter(Boolean)
                        .join(' · ') || 'No department'}
                    </p>
                    {r.city && (
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
                        {r.city}
                      </p>
                    )}
                    <p
                      style={{
                        fontSize: 12,
                        color: '#AABDE0',
                        marginTop: 6,
                      }}
                    >
                      {confirmedCount} job{confirmedCount === 1 ? '' : 's'}
                      {tp?.day_rate_cents != null &&
                        ` · ${centsToUsd(tp.day_rate_cents)}/day`}
                    </p>
                  </div>

                  {/* Right */}
                  <div
                    className="flex flex-col items-end gap-1.5"
                    style={{ flexShrink: 0 }}
                  >
                    <StatusBadge
                      status={r.verified ? 'verified' : 'pending'}
                      size="sm"
                    />
                    {pendingCount > 0 && (
                      <span
                        title={`${pendingCount} pending booking${pendingCount === 1 ? '' : 's'}`}
                        style={{
                          width: 20,
                          height: 20,
                          borderRadius: 999,
                          background: 'rgba(240,165,0,0.2)',
                          border: '1px solid rgba(240,165,0,0.4)',
                          color: '#F0A500',
                          fontSize: 11,
                          fontWeight: 700,
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        !
                      </span>
                    )}
                  </div>
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}

function ApplicationCard({ app }: { app: ApplicationRow }) {
  const name = appName(app)
  return (
    <article
      className="rounded-xl bg-[#1A2E4A] border border-white/5"
      style={{ padding: 16 }}
    >
      <div className="flex items-start justify-between gap-2">
        <p
          className="text-white"
          style={{ fontSize: 14, fontWeight: 500 }}
        >
          {name}
        </p>
        {app.department && (
          <span
            className="rounded-full"
            style={{
              padding: '3px 9px',
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              background: 'rgba(240,165,0,0.18)',
              color: '#F0A500',
              border: '1px solid rgba(240,165,0,0.35)',
              whiteSpace: 'nowrap',
            }}
          >
            {app.department}
          </span>
        )}
      </div>
      <p style={{ fontSize: 12, color: '#AABDE0', marginTop: 4 }}>
        {app.email}
      </p>
      {(app.instagram || app.website) && (
        <div className="flex gap-3 mt-1">
          {app.instagram && (
            <a
              href={
                app.instagram.startsWith('http')
                  ? app.instagram
                  : `https://instagram.com/${app.instagram.replace(/^@/, '')}`
              }
              target="_blank"
              rel="noopener noreferrer"
              style={{ fontSize: 12, color: '#AABDE0', textDecoration: 'underline' }}
            >
              Instagram ↗
            </a>
          )}
          {app.website && (
            <a
              href={app.website.startsWith('http') ? app.website : `https://${app.website}`}
              target="_blank"
              rel="noopener noreferrer"
              style={{ fontSize: 12, color: '#AABDE0', textDecoration: 'underline' }}
            >
              Website ↗
            </a>
          )}
        </div>
      )}
      {app.message && (
        <p
          style={{
            fontSize: 12,
            color: '#7A90AA',
            marginTop: 6,
            fontStyle: 'italic',
            lineHeight: 1.5,
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}
        >
          “{app.message}”
        </p>
      )}
      <div
        className="flex items-center justify-between mt-3 pt-3"
        style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}
      >
        <span style={{ fontSize: 11, color: '#7A90AA' }}>
          {app.created_at ? formatDate(app.created_at) : '—'}
        </span>
        <div className="flex gap-2">
          <form action={declineApplication}>
            <input type="hidden" name="id" value={app.id} />
            <button
              type="submit"
              className="rounded-lg"
              style={{
                padding: '6px 12px',
                fontSize: 12,
                fontWeight: 500,
                background: 'rgba(239,68,68,0.18)',
                color: '#F87171',
                border: '1px solid rgba(239,68,68,0.35)',
                cursor: 'pointer',
              }}
            >
              Decline
            </button>
          </form>
          <form action={approveApplication}>
            <input type="hidden" name="id" value={app.id} />
            <button
              type="submit"
              className="rounded-lg"
              style={{
                padding: '6px 12px',
                fontSize: 12,
                fontWeight: 500,
                background: 'rgba(34,197,94,0.18)',
                color: '#86EFAC',
                border: '1px solid rgba(34,197,94,0.35)',
                cursor: 'pointer',
              }}
            >
              Approve
            </button>
          </form>
        </div>
      </div>
    </article>
  )
}

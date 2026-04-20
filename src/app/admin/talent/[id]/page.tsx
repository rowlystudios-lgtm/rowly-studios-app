import Link from 'next/link'
import { revalidatePath } from 'next/cache'
import {
  requireAdmin,
  centsToUsd,
  formatDate,
  formatDateShort,
} from '@/lib/admin-auth'
import { StatusBadge } from '@/components/StatusBadge'

export const dynamic = 'force-dynamic'

function isoDateAfter(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate()
  ).padStart(2, '0')}`
}

export default async function AdminTalentDetailPage({
  params,
}: {
  params: { id: string }
}) {
  const { supabase } = await requireAdmin()

  const today = isoDateAfter(0)
  const thirtyOut = isoDateAfter(30)

  const [profileRes, talentRes, availabilityRes, bookingsRes] = await Promise.all([
    supabase
      .from('profiles')
      .select('*')
      .eq('id', params.id)
      .maybeSingle(),
    supabase
      .from('talent_profiles')
      .select('*')
      .eq('id', params.id)
      .maybeSingle(),
    supabase
      .from('availability')
      .select('date, status')
      .eq('talent_id', params.id)
      .gte('date', today)
      .lte('date', thirtyOut)
      .order('date'),
    supabase
      .from('job_bookings')
      .select(
        `id, status, confirmed_rate_cents,
         jobs (id, title, start_date, end_date, status)`
      )
      .eq('talent_id', params.id)
      .order('created_at', { ascending: false })
      .limit(10),
  ])

  const profile = profileRes.data as unknown as {
    id: string
    first_name: string | null
    last_name: string | null
    full_name: string | null
    email: string | null
    phone: string | null
    avatar_url: string | null
    city: string | null
    verified: boolean
    available: boolean
  } | null

  if (!profile) {
    return (
      <div style={{ padding: 20 }}>
        <p style={{ color: '#AABDE0' }}>Talent not found.</p>
        <Link href="/admin/talent" style={{ color: '#F0A500' }}>
          ← Back to talent
        </Link>
      </div>
    )
  }

  const tp = talentRes.data as unknown as {
    department: string | null
    primary_role: string | null
    day_rate_cents: number | null
    bio: string | null
  } | null

  const availability = (availabilityRes.data ?? []) as Array<{
    date: string
    status: string
  }>
  const availByDate = new Map(availability.map((a) => [a.date, a.status]))

  type BookingRow = {
    id: string
    status: string
    confirmed_rate_cents: number | null
    jobs:
      | {
          id: string
          title: string
          start_date: string | null
          end_date: string | null
          status: string
        }
      | {
          id: string
          title: string
          start_date: string | null
          end_date: string | null
          status: string
        }[]
      | null
  }
  const bookings = (bookingsRes.data ?? []) as unknown as BookingRow[]
  function bookingJob(b: BookingRow) {
    return Array.isArray(b.jobs) ? b.jobs[0] ?? null : b.jobs
  }

  const displayName =
    [profile.first_name, profile.last_name].filter(Boolean).join(' ') ||
    profile.full_name ||
    'Unnamed'

  async function toggleVerified() {
    'use server'
    const { supabase: sb } = await requireAdmin()
    const next = !profile!.verified
    await sb
      .from('profiles')
      .update({
        verified: next,
        verified_at: next ? new Date().toISOString() : null,
      })
      .eq('id', profile!.id)
    revalidatePath(`/admin/talent/${profile!.id}`)
    revalidatePath('/admin/talent')
  }

  async function updateRate(formData: FormData) {
    'use server'
    const { supabase: sb } = await requireAdmin()
    const raw = formData.get('rate') as string
    const cents = raw ? Math.round(parseFloat(raw) * 100) : null
    await sb
      .from('talent_profiles')
      .upsert(
        { id: profile!.id, day_rate_cents: cents },
        { onConflict: 'id' }
      )
    revalidatePath(`/admin/talent/${profile!.id}`)
  }

  // Next 14 days pill row
  const pills: Array<{ date: string; status: string | null; label: string }> = []
  for (let i = 0; i < 14; i++) {
    const d = new Date()
    d.setDate(d.getDate() + i)
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(
      2,
      '0'
    )}-${String(d.getDate()).padStart(2, '0')}`
    pills.push({
      date: iso,
      status: availByDate.get(iso) ?? null,
      label: String(d.getDate()),
    })
  }

  function pillColor(status: string | null) {
    switch (status) {
      case 'available':
        return { bg: 'rgba(34,197,94,0.22)', color: '#4ADE80' }
      case 'hold':
        return { bg: 'rgba(212,149,10,0.22)', color: '#F0A500' }
      case 'unavailable':
        return { bg: 'rgba(239,68,68,0.22)', color: '#F87171' }
      default:
        return { bg: 'rgba(170,189,224,0.08)', color: '#7A90AA' }
    }
  }

  return (
    <div style={{ padding: '18px 18px', maxWidth: 640, margin: '0 auto' }}>
      <Link
        href="/admin/talent"
        style={{
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: '#AABDE0',
          textDecoration: 'none',
        }}
      >
        ← Talent
      </Link>

      {/* Header */}
      <div
        style={{
          marginTop: 12,
          display: 'flex',
          alignItems: 'center',
          gap: 14,
        }}
      >
        <div
          style={{
            width: 80,
            height: 80,
            borderRadius: 999,
            background: '#1E3A6B',
            color: '#fff',
            fontSize: 28,
            fontWeight: 700,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            overflow: 'hidden',
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
            displayName.slice(0, 1).toUpperCase()
          )}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: '#fff' }}>
            {displayName}
          </h1>
          <p style={{ fontSize: 12, color: '#AABDE0', marginTop: 2 }}>
            {[tp?.department, tp?.primary_role].filter(Boolean).join(' · ') ||
              'No department'}
            {profile.city && ` · ${profile.city}`}
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
            {profile.verified ? (
              <span
                style={{
                  padding: '3px 8px',
                  borderRadius: 999,
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                  background: 'rgba(34,197,94,0.18)',
                  color: '#4ADE80',
                }}
              >
                Verified
              </span>
            ) : (
              <span
                style={{
                  padding: '3px 8px',
                  borderRadius: 999,
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                  background: 'rgba(212,149,10,0.18)',
                  color: '#F0A500',
                }}
              >
                Pending
              </span>
            )}
            <span style={{ fontSize: 12, fontWeight: 700, color: '#fff' }}>
              {tp?.day_rate_cents != null ? `${centsToUsd(tp.day_rate_cents)}/day` : 'No rate set'}
            </span>
          </div>
        </div>
      </div>

      {/* Availability */}
      <section style={{ marginTop: 18 }}>
        <SectionLabel>Availability — next 14 days</SectionLabel>
        <div
          style={{
            display: 'flex',
            gap: 4,
            overflowX: 'auto',
            paddingBottom: 4,
          }}
        >
          {pills.map((p) => {
            const c = pillColor(p.status)
            return (
              <div
                key={p.date}
                title={`${p.date} — ${p.status ?? 'no record'}`}
                style={{
                  flex: '0 0 auto',
                  width: 34,
                  height: 34,
                  borderRadius: 8,
                  background: c.bg,
                  color: c.color,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 12,
                  fontWeight: 700,
                }}
              >
                {p.label}
              </div>
            )
          })}
        </div>
      </section>

      {/* Recent bookings */}
      <section style={{ marginTop: 18 }}>
        <SectionLabel>Recent bookings</SectionLabel>
        {bookings.length === 0 ? (
          <p style={{ fontSize: 13, color: '#7A90AA', fontStyle: 'italic' }}>
            No bookings yet
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {bookings.map((b) => {
              const j = bookingJob(b)
              return (
              <Link
                key={b.id}
                href={j ? `/admin/jobs/${j.id}` : '/admin/jobs'}
                style={{
                  background: '#1A2E4A',
                  border: '1px solid rgba(170,189,224,0.15)',
                  borderRadius: 12,
                  padding: '10px 12px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 10,
                  textDecoration: 'none',
                  color: '#fff',
                }}
              >
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
                    {j?.title ?? 'Untitled job'}
                  </p>
                  <p style={{ fontSize: 11, color: '#AABDE0', marginTop: 2 }}>
                    {j?.start_date && formatDateShort(j.start_date)}
                    {b.confirmed_rate_cents != null &&
                      ` · ${centsToUsd(b.confirmed_rate_cents)}/day`}
                  </p>
                </div>
                <StatusBadge status={b.status} size="sm" />
              </Link>
              )
            })}
          </div>
        )}
      </section>

      {/* Admin actions */}
      <section style={{ marginTop: 18 }}>
        <SectionLabel>Admin actions</SectionLabel>
        <div
          style={{
            background: '#1A2E4A',
            border: '1px solid rgba(170,189,224,0.15)',
            borderRadius: 12,
            padding: 14,
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
          }}
        >
          <form action={toggleVerified}>
            <button
              type="submit"
              style={{
                width: '100%',
                padding: '10px 0',
                borderRadius: 10,
                background: profile.verified
                  ? 'rgba(239,68,68,0.15)'
                  : '#F0A500',
                color: profile.verified ? '#F87171' : '#0F1B2E',
                border: profile.verified
                  ? '1px solid rgba(239,68,68,0.35)'
                  : 'none',
                fontSize: 12,
                fontWeight: 700,
                letterSpacing: '0.04em',
                textTransform: 'uppercase',
                cursor: 'pointer',
              }}
            >
              {profile.verified ? 'Unverify talent' : 'Mark verified'}
            </button>
          </form>

          <form action={updateRate} style={{ display: 'flex', gap: 8 }}>
            <input
              type="number"
              name="rate"
              min={0}
              step={25}
              defaultValue={
                tp?.day_rate_cents != null ? tp.day_rate_cents / 100 : ''
              }
              placeholder="Day rate ($)"
              style={{
                flex: 1,
                padding: '10px 12px',
                borderRadius: 8,
                border: '1px solid rgba(170,189,224,0.2)',
                background: 'rgba(255,255,255,0.05)',
                color: '#fff',
                fontSize: 14,
              }}
            />
            <button
              type="submit"
              style={{
                padding: '10px 14px',
                borderRadius: 8,
                background: '#1E3A6B',
                color: '#fff',
                border: 'none',
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: '0.04em',
                textTransform: 'uppercase',
                cursor: 'pointer',
              }}
            >
              Save rate
            </button>
          </form>
        </div>
      </section>
    </div>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
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
      {children}
    </p>
  )
}

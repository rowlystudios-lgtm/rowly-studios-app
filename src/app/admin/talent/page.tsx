import Link from 'next/link'
import { revalidatePath } from 'next/cache'
import { requireAdmin, centsToUsd, formatDate } from '@/lib/admin-auth'
import { TalentFilterClient } from './TalentFilterClient'

export const dynamic = 'force-dynamic'

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
        `id, first_name, last_name, full_name, avatar_url, email,
         city, verified, available,
         talent_profiles (department, primary_role, day_rate_cents)`
      )
      .eq('role', 'talent')
      .order('last_name'),
    supabase
      .from('talent_applications')
      .select(
        `id, email, first_name, last_name, department, created_at`
      )
      .eq('status', 'pending')
      .order('created_at', { ascending: false }),
  ])

  type Row = {
    id: string
    first_name: string | null
    last_name: string | null
    full_name: string | null
    avatar_url: string | null
    email: string | null
    city: string | null
    verified: boolean
    available: boolean
    talent_profiles:
      | { department: string | null; primary_role: string | null; day_rate_cents: number | null }
      | { department: string | null; primary_role: string | null; day_rate_cents: number | null }[]
      | null
  }

  const rows = (talentRes.data ?? []) as Row[]
  const apps = (appsRes.data ?? []) as Array<{
    id: string
    email: string
    first_name: string | null
    last_name: string | null
    department: string | null
    created_at: string | null
  }>

  const filter = searchParams.filter ?? 'all'
  const filtered = rows.filter((r) => {
    if (filter === 'verified') return r.verified
    if (filter === 'unverified') return !r.verified
    return true
  })

  function talentName(r: Row): string {
    return (
      [r.first_name, r.last_name].filter(Boolean).join(' ') ||
      r.full_name ||
      'Unnamed'
    )
  }

  async function approveApplication(formData: FormData) {
    'use server'
    const { supabase: sb, user: u } = await requireAdmin()
    const id = formData.get('id') as string
    if (!id) return
    await sb
      .from('talent_applications')
      .update({
        status: 'approved',
        reviewed_by: u.id,
        reviewed_at: new Date().toISOString(),
      })
      .eq('id', id)
    revalidatePath('/admin/talent')
  }

  async function declineApplication(formData: FormData) {
    'use server'
    const { supabase: sb, user: u } = await requireAdmin()
    const id = formData.get('id') as string
    if (!id) return
    await sb
      .from('talent_applications')
      .update({
        status: 'rejected',
        reviewed_by: u.id,
        reviewed_at: new Date().toISOString(),
      })
      .eq('id', id)
    revalidatePath('/admin/talent')
  }

  return (
    <div style={{ padding: '18px 18px', maxWidth: 640, margin: '0 auto' }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, color: '#fff', marginBottom: 4 }}>
        Talent
      </h1>
      <p style={{ fontSize: 12, color: '#AABDE0' }}>
        {rows.length} total · {rows.filter((r) => r.verified).length} verified
      </p>

      {/* Pending applications */}
      {apps.length > 0 && (
        <section style={{ marginTop: 16 }}>
          <div
            style={{
              background: 'rgba(240,165,0,0.15)',
              border: '1px solid rgba(240,165,0,0.35)',
              borderRadius: 10,
              padding: '10px 12px',
              color: '#F0A500',
              fontSize: 12,
              fontWeight: 700,
              marginBottom: 10,
            }}
          >
            ⚠ {apps.length} new application{apps.length === 1 ? '' : 's'}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {apps.map((a) => (
              <div
                key={a.id}
                style={{
                  background: '#1A2E4A',
                  border: '1px solid rgba(170,189,224,0.15)',
                  borderRadius: 12,
                  padding: 12,
                }}
              >
                <p style={{ fontSize: 14, fontWeight: 600, color: '#fff' }}>
                  {[a.first_name, a.last_name].filter(Boolean).join(' ') || a.email}
                </p>
                <p style={{ fontSize: 11, color: '#AABDE0', marginTop: 2 }}>
                  {a.email}
                  {a.department && ` · ${a.department}`}
                  {a.created_at && ` · ${formatDate(a.created_at)}`}
                </p>
                <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                  <form action={declineApplication} style={{ flex: 1 }}>
                    <input type="hidden" name="id" value={a.id} />
                    <button
                      type="submit"
                      style={{
                        width: '100%',
                        padding: '8px 0',
                        borderRadius: 8,
                        background: 'rgba(255,255,255,0.08)',
                        color: '#AABDE0',
                        border: '1px solid rgba(170,189,224,0.2)',
                        fontSize: 11,
                        fontWeight: 600,
                        letterSpacing: '0.04em',
                        textTransform: 'uppercase',
                        cursor: 'pointer',
                      }}
                    >
                      Decline
                    </button>
                  </form>
                  <form action={approveApplication} style={{ flex: 2 }}>
                    <input type="hidden" name="id" value={a.id} />
                    <button
                      type="submit"
                      style={{
                        width: '100%',
                        padding: '8px 0',
                        borderRadius: 8,
                        background: '#F0A500',
                        color: '#0F1B2E',
                        border: 'none',
                        fontSize: 11,
                        fontWeight: 700,
                        letterSpacing: '0.04em',
                        textTransform: 'uppercase',
                        cursor: 'pointer',
                      }}
                    >
                      Approve
                    </button>
                  </form>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Roster */}
      <section style={{ marginTop: 18 }}>
        <TalentFilterClient current={filter} />

        {filtered.length === 0 ? (
          <p
            style={{
              fontSize: 13,
              color: '#7A90AA',
              fontStyle: 'italic',
              marginTop: 12,
            }}
          >
            No {filter === 'all' ? '' : filter} talent
          </p>
        ) : (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
              marginTop: 12,
            }}
          >
            {filtered.map((r) => {
              const tp = Array.isArray(r.talent_profiles)
                ? r.talent_profiles[0]
                : r.talent_profiles
              const meta = [tp?.department, tp?.primary_role]
                .filter(Boolean)
                .join(' · ')
              return (
                <Link
                  key={r.id}
                  href={`/admin/talent/${r.id}`}
                  style={{
                    background: '#1A2E4A',
                    border: '1px solid rgba(170,189,224,0.15)',
                    borderRadius: 12,
                    padding: '10px 12px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    textDecoration: 'none',
                    color: '#fff',
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
                    {r.avatar_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={r.avatar_url}
                        alt=""
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      />
                    ) : (
                      talentName(r).slice(0, 1).toUpperCase()
                    )}
                  </div>
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
                      {talentName(r)}
                    </p>
                    <p
                      style={{
                        fontSize: 11,
                        color: '#AABDE0',
                        marginTop: 2,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {meta || 'No department'}
                      {tp?.day_rate_cents != null &&
                        ` · ${centsToUsd(tp.day_rate_cents)}/day`}
                    </p>
                  </div>
                  {r.verified ? (
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
                        flexShrink: 0,
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
                        flexShrink: 0,
                      }}
                    >
                      Pending
                    </span>
                  )}
                </Link>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}

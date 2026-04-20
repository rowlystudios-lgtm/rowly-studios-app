import Link from 'next/link'
import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/admin-auth'

export const dynamic = 'force-dynamic'

export default async function AdminClientsPage() {
  const { supabase } = await requireAdmin()

  const { data } = await supabase
    .from('profiles')
    .select(
      `id, first_name, last_name, full_name, email, city, verified, avatar_url,
       client_profiles (company_name, industry, website, logo_url)`
    )
    .eq('role', 'client')
    .order('last_name')

  type Row = {
    id: string
    first_name: string | null
    last_name: string | null
    full_name: string | null
    email: string | null
    city: string | null
    verified: boolean
    avatar_url: string | null
    client_profiles:
      | {
          company_name: string | null
          industry: string | null
          website: string | null
          logo_url: string | null
        }
      | {
          company_name: string | null
          industry: string | null
          website: string | null
          logo_url: string | null
        }[]
      | null
  }

  const rows = (data ?? []) as Row[]
  const pending = rows.filter((r) => !r.verified)
  const verified = rows.filter((r) => r.verified)

  function cp(r: Row) {
    return Array.isArray(r.client_profiles) ? r.client_profiles[0] : r.client_profiles
  }

  function displayName(r: Row): string {
    const c = cp(r)
    return (
      c?.company_name ||
      [r.first_name, r.last_name].filter(Boolean).join(' ') ||
      r.full_name ||
      'Unnamed client'
    )
  }

  async function approveClient(formData: FormData) {
    'use server'
    const { supabase: sb } = await requireAdmin()
    const id = formData.get('id') as string
    if (!id) return
    await sb
      .from('profiles')
      .update({ verified: true, verified_at: new Date().toISOString() })
      .eq('id', id)
    revalidatePath('/admin/clients')
  }

  return (
    <div style={{ padding: '18px 18px', maxWidth: 640, margin: '0 auto' }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, color: '#fff', marginBottom: 4 }}>
        Clients
      </h1>
      <p style={{ fontSize: 12, color: '#AABDE0' }}>
        {rows.length} total · {verified.length} verified
      </p>

      {pending.length > 0 && (
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
            ⚠ {pending.length} pending client
            {pending.length === 1 ? '' : 's'}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {pending.map((r) => (
              <div
                key={r.id}
                style={{
                  background: '#1A2E4A',
                  border: '1px solid rgba(170,189,224,0.15)',
                  borderRadius: 12,
                  padding: 12,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 13, fontWeight: 600, color: '#fff' }}>
                    {displayName(r)}
                  </p>
                  <p style={{ fontSize: 11, color: '#AABDE0', marginTop: 2 }}>
                    {r.email}
                  </p>
                </div>
                <form action={approveClient}>
                  <input type="hidden" name="id" value={r.id} />
                  <button
                    type="submit"
                    style={{
                      padding: '8px 14px',
                      borderRadius: 8,
                      background: '#F0A500',
                      color: '#0F1B2E',
                      border: 'none',
                      fontSize: 11,
                      fontWeight: 700,
                      letterSpacing: '0.04em',
                      textTransform: 'uppercase',
                      cursor: 'pointer',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    Approve
                  </button>
                </form>
              </div>
            ))}
          </div>
        </section>
      )}

      <section style={{ marginTop: 18 }}>
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
          All clients
        </p>
        {rows.length === 0 ? (
          <p style={{ fontSize: 13, color: '#7A90AA', fontStyle: 'italic' }}>
            No clients yet
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {rows.map((r) => {
              const c = cp(r)
              return (
                <Link
                  key={r.id}
                  href={`/admin/clients/${r.id}`}
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
                    {c?.logo_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={c.logo_url}
                        alt=""
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      />
                    ) : (
                      displayName(r).slice(0, 1).toUpperCase()
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
                      {displayName(r)}
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
                      {[c?.industry, r.city].filter(Boolean).join(' · ') || '—'}
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

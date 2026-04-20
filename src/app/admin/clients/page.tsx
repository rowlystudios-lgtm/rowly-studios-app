import Link from 'next/link'
import { requireAdmin, centsToUsd } from '@/lib/admin-auth'
import { approveClient } from './actions'
import { ClientsFilterClient } from './ClientsFilterClient'

export const dynamic = 'force-dynamic'

type ClientProfileJoin = {
  company_name: string | null
  industry: string | null
  website: string | null
  billing_email: string | null
  logo_url: string | null
  entity_type: string | null
  bio: string | null
}

type JobStub = { id: string; status: string }
type InvoiceStub = { id: string; total_cents: number | null; status: string }

type Row = {
  id: string
  full_name: string | null
  email: string | null
  phone: string | null
  city: string | null
  avatar_url: string | null
  verified: boolean
  verified_at: string | null
  created_at: string | null
  client_profiles: ClientProfileJoin | ClientProfileJoin[] | null
  jobs: JobStub[] | null
  invoices: InvoiceStub[] | null
}

function unwrap<T>(v: T | T[] | null | undefined): T | null {
  if (v == null) return null
  return Array.isArray(v) ? v[0] ?? null : v
}

function initials(raw: string): string {
  const parts = raw.trim().split(/\s+/).slice(0, 2)
  return parts.map((p) => p[0]?.toUpperCase() ?? '').join('') || '?'
}

function entityLabel(type: string | null | undefined): string | null {
  if (!type) return null
  const map: Record<string, string> = {
    llc: 'LLC',
    corp: 'Corp',
    corporation: 'Corp',
    sole_prop: 'Sole prop',
    individual: 'Individual',
    other: 'Other',
  }
  return map[type.toLowerCase()] ?? type
}

export default async function AdminClientsPage({
  searchParams,
}: {
  searchParams: { filter?: string }
}) {
  const { supabase } = await requireAdmin()

  const { data } = await supabase
    .from('profiles')
    .select(
      `id, full_name, email, phone, city, avatar_url,
       verified, verified_at, created_at,
       client_profiles (company_name, industry, website, billing_email,
         logo_url, entity_type, bio),
       jobs!jobs_client_id_fkey (id, status),
       invoices!invoices_client_id_fkey (id, total_cents, status)`
    )
    .eq('role', 'client')
    .order('verified', { ascending: false })
    .order('created_at', { ascending: false })

  const rows = (data ?? []) as unknown as Row[]

  const pending = rows.filter((r) => !r.verified)
  const verifiedRows = rows.filter((r) => r.verified)

  // Per-row computed stats
  type Enhanced = Row & {
    cp: ClientProfileJoin | null
    displayName: string
    totalJobs: number
    activeJobs: number
    outstandingCents: number
  }

  function enhance(r: Row): Enhanced {
    const cp = unwrap(r.client_profiles)
    const jobs = Array.isArray(r.jobs) ? r.jobs : []
    const invoices = Array.isArray(r.invoices) ? r.invoices : []
    const active = jobs.filter((j) =>
      ['crewing', 'submitted', 'confirmed'].includes(j.status)
    ).length
    const outstanding = invoices
      .filter((i) => i.status === 'sent' || i.status === 'overdue')
      .reduce((s, i) => s + (i.total_cents ?? 0), 0)
    return {
      ...r,
      cp,
      displayName: cp?.company_name || r.full_name || 'Unnamed client',
      totalJobs: jobs.length,
      activeJobs: active,
      outstandingCents: outstanding,
    }
  }

  const all = verifiedRows.map(enhance)

  const filter = searchParams.filter ?? 'all'
  const shown = all.filter((r) => {
    if (filter === 'active') return r.activeJobs > 0
    if (filter === 'nojobs') return r.totalJobs === 0
    return true
  })

  return (
    <div className="mx-auto" style={{ maxWidth: 720, padding: '20px 18px 28px' }}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-white" style={{ fontSize: 20, fontWeight: 600 }}>
            Clients
          </h1>
          <p style={{ fontSize: 12, color: '#7A90AA', marginTop: 2 }}>
            {rows.length} total · {verifiedRows.length} verified
          </p>
        </div>
        <Link
          href="/admin/clients/new"
          className="rounded-lg bg-[#1E3A6B] hover:bg-[#253D8A] text-white transition-colors"
          style={{
            padding: '8px 16px',
            fontSize: 13,
            fontWeight: 500,
            textDecoration: 'none',
            whiteSpace: 'nowrap',
          }}
        >
          + Add client
        </Link>
      </div>

      {pending.length > 0 && (
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
            Pending approval
          </p>
          <div
            className="rounded-xl"
            style={{
              background: 'rgba(240,165,0,0.10)',
              border: '1px solid rgba(240,165,0,0.25)',
              padding: 14,
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
            }}
          >
            {pending.map((r) => {
              const cp = unwrap(r.client_profiles)
              const name = cp?.company_name || r.full_name || 'Unnamed'
              return (
                <div
                  key={r.id}
                  className="flex items-center justify-between gap-3 rounded-lg"
                  style={{
                    background: 'rgba(26,46,74,0.6)',
                    border: '1px solid rgba(255,255,255,0.05)',
                    padding: 10,
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p className="text-white" style={{ fontSize: 13, fontWeight: 600 }}>
                      {name}
                    </p>
                    <p style={{ fontSize: 11, color: '#AABDE0', marginTop: 1 }}>
                      {r.email}
                    </p>
                  </div>
                  <form action={approveClient}>
                    <input type="hidden" name="id" value={r.id} />
                    <button
                      type="submit"
                      className="rounded-lg"
                      style={{
                        padding: '6px 14px',
                        fontSize: 12,
                        fontWeight: 500,
                        background: 'rgba(34,197,94,0.18)',
                        color: '#86EFAC',
                        border: '1px solid rgba(34,197,94,0.35)',
                        cursor: 'pointer',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      Approve
                    </button>
                  </form>
                </div>
              )
            })}
          </div>
        </section>
      )}

      <div className="mt-6">
        <ClientsFilterClient current={filter} />
      </div>

      {shown.length === 0 ? (
        <div
          className="mt-4 rounded-xl bg-[#1A2E4A] border border-white/5 text-center"
          style={{ padding: '22px 20px' }}
        >
          <p style={{ fontSize: 13, color: '#7A90AA' }}>
            {all.length === 0
              ? 'No clients yet. Add your first client.'
              : filter === 'active'
              ? 'No clients with active jobs'
              : 'No clients without jobs'}
          </p>
        </div>
      ) : (
        <div className="mt-4 flex flex-col gap-2.5">
          {shown.map((r) => {
            const ent = entityLabel(r.cp?.entity_type ?? null)
            const logo = r.cp?.logo_url ?? r.avatar_url
            const industry = r.cp?.industry ?? null
            return (
              <Link
                key={r.id}
                href={`/admin/clients/${r.id}`}
                className="block rounded-xl bg-[#1A2E4A] border border-white/5 hover:border-white/10 transition-colors"
                style={{ padding: 16, textDecoration: 'none' }}
              >
                <div className="flex items-start gap-3">
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
                        fontSize: 17,
                        fontWeight: 700,
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      {logo ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={logo}
                          alt=""
                          style={{
                            width: '100%',
                            height: '100%',
                            objectFit: 'cover',
                          }}
                        />
                      ) : (
                        initials(r.displayName)
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

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="flex items-center gap-2">
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
                        {r.displayName}
                      </p>
                      {ent && (
                        <span
                          className="rounded-full"
                          style={{
                            padding: '2px 7px',
                            fontSize: 9,
                            fontWeight: 700,
                            letterSpacing: '0.1em',
                            textTransform: 'uppercase',
                            background: 'rgba(170,189,224,0.12)',
                            color: '#AABDE0',
                            border: '1px solid rgba(170,189,224,0.25)',
                            whiteSpace: 'nowrap',
                            flexShrink: 0,
                          }}
                        >
                          {ent}
                        </span>
                      )}
                    </div>
                    <p
                      style={{
                        fontSize: 13,
                        color: '#AABDE0',
                        marginTop: 2,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {industry ?? 'No industry'}
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
                  </div>

                  <div
                    className="text-right"
                    style={{ flexShrink: 0 }}
                  >
                    <p style={{ fontSize: 13, color: '#AABDE0' }}>
                      {r.totalJobs} job{r.totalJobs === 1 ? '' : 's'}
                    </p>
                    {r.activeJobs > 0 && (
                      <p style={{ fontSize: 12, color: '#4ADE80', marginTop: 1 }}>
                        {r.activeJobs} active
                      </p>
                    )}
                    {r.outstandingCents > 0 ? (
                      <p style={{ fontSize: 12, color: '#F0A500', marginTop: 1 }}>
                        {centsToUsd(r.outstandingCents)} due
                      </p>
                    ) : r.totalJobs > 0 ? (
                      <p style={{ fontSize: 12, color: '#7A90AA', marginTop: 1 }}>
                        All settled
                      </p>
                    ) : null}
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

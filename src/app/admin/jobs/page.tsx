import Link from 'next/link'
import { requireAdmin, formatDateShort } from '@/lib/admin-auth'
import { StatusBadge } from '@/components/StatusBadge'
import { JobsFilterClient } from './JobsFilterClient'

export const dynamic = 'force-dynamic'

export default async function AdminJobsPage({
  searchParams,
}: {
  searchParams: { status?: string }
}) {
  const { supabase } = await requireAdmin()

  const { data } = await supabase
    .from('jobs')
    .select(
      `id, title, status, start_date, end_date, location,
       address_city, address_state, created_at,
       profiles!jobs_client_id_fkey (id, first_name, last_name, full_name,
         client_profiles (company_name))`
    )
    .order('start_date', { ascending: false, nullsFirst: false })

  type JobRow = {
    id: string
    title: string
    status: string
    start_date: string | null
    end_date: string | null
    location: string | null
    address_city: string | null
    address_state: string | null
    created_at: string | null
    profiles:
      | {
          id: string
          first_name: string | null
          last_name: string | null
          full_name: string | null
          client_profiles:
            | { company_name: string | null }
            | { company_name: string | null }[]
            | null
        }
      | {
          id: string
          first_name: string | null
          last_name: string | null
          full_name: string | null
          client_profiles:
            | { company_name: string | null }
            | { company_name: string | null }[]
            | null
        }[]
      | null
  }
  const jobs = (data ?? []) as unknown as JobRow[]

  const filter = searchParams.status ?? 'all'
  const shown = jobs.filter((j) => {
    if (filter === 'all') return true
    // Map 'active' in the UI to DB values 'crewing' + 'submitted'
    if (filter === 'active') return j.status === 'crewing' || j.status === 'submitted'
    return j.status === filter
  })

  function clientDisplay(raw: JobRow['profiles']): string {
    const row = Array.isArray(raw) ? raw[0] : raw
    if (!row) return 'Unknown client'
    const cp = Array.isArray(row.client_profiles)
      ? row.client_profiles[0]
      : row.client_profiles
    return (
      cp?.company_name ||
      [row.first_name, row.last_name].filter(Boolean).join(' ') ||
      row.full_name ||
      'Unknown client'
    )
  }

  return (
    <div style={{ padding: '18px 18px', maxWidth: 640, margin: '0 auto' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 10,
          marginBottom: 14,
        }}
      >
        <h1 style={{ fontSize: 22, fontWeight: 700, color: '#fff' }}>Jobs</h1>
        <Link
          href="/admin/jobs/new"
          style={{
            padding: '8px 14px',
            borderRadius: 10,
            background: '#F0A500',
            color: '#0F1B2E',
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
            textDecoration: 'none',
          }}
        >
          + New job
        </Link>
      </div>

      <JobsFilterClient current={filter} />

      {shown.length === 0 ? (
        <p
          style={{
            fontSize: 13,
            color: '#7A90AA',
            fontStyle: 'italic',
            marginTop: 16,
          }}
        >
          No {filter === 'all' ? '' : filter} jobs
        </p>
      ) : (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            marginTop: 14,
          }}
        >
          {shown.map((j) => {
            const range =
              j.start_date && j.end_date && j.end_date !== j.start_date
                ? `${formatDateShort(j.start_date)} – ${formatDateShort(j.end_date)}`
                : formatDateShort(j.start_date)
            const loc =
              [j.address_city, j.address_state].filter(Boolean).join(', ') ||
              j.location ||
              ''
            return (
              <Link
                key={j.id}
                href={`/admin/jobs/${j.id}`}
                style={{
                  background: '#1A2E4A',
                  border: '1px solid rgba(170,189,224,0.15)',
                  borderRadius: 12,
                  padding: '12px 14px',
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
                      color: '#AABDE0',
                      marginTop: 2,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {clientDisplay(j.profiles)}
                    {loc && ` · ${loc}`}
                    {range && ` · ${range}`}
                  </p>
                </div>
                <StatusBadge status={j.status} size="sm" />
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}

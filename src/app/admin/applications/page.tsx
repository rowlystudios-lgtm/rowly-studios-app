import type { Metadata } from 'next'
import { requireAdmin } from '@/lib/admin-auth'
import { ApplicationCard } from './ApplicationCard'
import { FilterTabs } from './FilterTabs'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Applications — RS Admin',
}

type Filter =
  | 'all'
  | 'pending'
  | 'talent'
  | 'clients'
  | 'approved'
  | 'rejected'

type ApplicationRow = {
  id: string
  email: string
  first_name: string | null
  last_name: string | null
  phone: string | null
  type: string
  status: string
  department: string | null
  primary_role: string | null
  instagram: string | null
  website: string | null
  company_name: string | null
  industry: string | null
  message: string | null
  admin_notes: string | null
  created_at: string
  reviewed_at: string | null
  reviewed_by: string | null
}

export default async function AdminApplicationsPage({
  searchParams,
}: {
  searchParams: { filter?: string }
}) {
  const { supabase } = await requireAdmin()
  const filter: Filter =
    (searchParams.filter as Filter) ?? 'pending'

  let q = supabase
    .from('talent_applications')
    .select(
      'id, email, first_name, last_name, phone, type, status, department, primary_role, instagram, website, company_name, industry, message, admin_notes, created_at, reviewed_at, reviewed_by'
    )
    .order('created_at', { ascending: false })

  if (filter === 'pending') q = q.eq('status', 'pending')
  else if (filter === 'approved') q = q.eq('status', 'approved')
  else if (filter === 'rejected') q = q.eq('status', 'rejected')
  else if (filter === 'talent') q = q.eq('type', 'talent')
  else if (filter === 'clients') q = q.eq('type', 'client')

  const { data: rows, error } = await q
  const apps: ApplicationRow[] = (rows ?? []) as ApplicationRow[]

  // Resolve reviewer names for actioned applications in one shot.
  const reviewerIds = Array.from(
    new Set(apps.map((a) => a.reviewed_by).filter((v): v is string => !!v))
  )
  const reviewerMap: Record<string, string> = {}
  if (reviewerIds.length > 0) {
    const { data: reviewers } = await supabase
      .from('profiles')
      .select('id, first_name, last_name, full_name, email')
      .in('id', reviewerIds)
    for (const r of reviewers ?? []) {
      const name =
        [r.first_name, r.last_name].filter(Boolean).join(' ') ||
        r.full_name ||
        r.email ||
        'admin'
      reviewerMap[r.id] = name
    }
  }

  // Pending count for the sub-header (independent of filter).
  const { count: pendingCount } = await supabase
    .from('talent_applications')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'pending')
  const pending = pendingCount ?? 0

  return (
    <section style={{ padding: '20px 16px 40px' }}>
      <header style={{ marginBottom: 4 }}>
        <h1
          style={{
            margin: 0,
            fontFamily: 'Playfair Display, serif',
            fontWeight: 800,
            fontSize: 30,
            lineHeight: 1.1,
            color: '#fff',
          }}
        >
          Applications
        </h1>
        <p
          style={{
            margin: '4px 0 0',
            fontSize: 13,
            color: 'rgba(255,255,255,0.55)',
          }}
        >
          {pending} pending review
        </p>
      </header>

      <FilterTabs />

      <div style={{ marginTop: 18 }}>
        {error && (
          <div
            role="alert"
            style={{
              padding: '10px 14px',
              background: 'rgba(226,59,59,0.1)',
              border: '1px solid rgba(226,59,59,0.4)',
              borderRadius: 8,
              color: '#FF7A7A',
              fontSize: 13,
              marginBottom: 12,
            }}
          >
            Failed to load applications: {error.message}
          </div>
        )}

        {apps.length === 0 ? (
          <div
            style={{
              padding: '40px 16px',
              textAlign: 'center',
              color: 'rgba(255,255,255,0.45)',
              fontSize: 14,
              background: 'rgba(255,255,255,0.03)',
              border: '1px dashed rgba(255,255,255,0.1)',
              borderRadius: 12,
            }}
          >
            No applications for this filter.
          </div>
        ) : (
          apps.map((app) => (
            <ApplicationCard
              key={app.id}
              app={app}
              reviewerName={
                app.reviewed_by ? reviewerMap[app.reviewed_by] : null
              }
            />
          ))
        )}
      </div>
    </section>
  )
}

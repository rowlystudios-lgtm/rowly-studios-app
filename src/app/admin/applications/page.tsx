import type { Metadata } from 'next'
import { requireAdmin } from '@/lib/admin-auth'
import { ApplicationsList } from './ApplicationsList'
import type { Application } from './ApplicationCard'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Applications — RS Admin',
}

export default async function AdminApplicationsPage() {
  const { supabase } = await requireAdmin()

  const { data: rows, error } = await supabase
    .from('talent_applications')
    .select(
      'id, email, first_name, last_name, phone, type, status, department, primary_role, instagram, website, company_name, industry, message, admin_notes, created_at, reviewed_at, reviewed_by, previously_deleted, previous_deletion_reason, previous_deletion_date'
    )
    .order('created_at', { ascending: false })

  const applications: Application[] = (rows ?? []) as Application[]

  // Resolve reviewer names in one round-trip.
  const reviewerIds = Array.from(
    new Set(
      applications
        .map((a) => a.reviewed_by)
        .filter((v): v is string => !!v)
    )
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

  const pending = applications.filter((a) => a.status === 'pending').length

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

      {error && (
        <div
          role="alert"
          style={{
            marginTop: 16,
            padding: '10px 14px',
            background: 'rgba(226,59,59,0.1)',
            border: '1px solid rgba(226,59,59,0.4)',
            borderRadius: 8,
            color: '#FF7A7A',
            fontSize: 13,
          }}
        >
          Failed to load applications: {error.message}
        </div>
      )}

      <ApplicationsList
        applications={applications}
        reviewerMap={reviewerMap}
      />
    </section>
  )
}

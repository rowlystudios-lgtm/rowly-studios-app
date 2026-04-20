import Link from 'next/link'
import { requireAdmin } from '@/lib/admin-auth'
import { JobForm, type JobFormInitial } from '../../JobForm'
import { updateJob } from '../../actions'

export const dynamic = 'force-dynamic'

export default async function AdminEditJobPage({
  params,
}: {
  params: { id: string }
}) {
  const { supabase } = await requireAdmin()

  const { data } = await supabase
    .from('jobs')
    .select(
      `id, title, client_id, status, start_date, end_date, call_time,
       day_rate_cents, location, address_line, address_city, address_state,
       address_zip, num_talent, crew_needed, description, client_notes,
       admin_notes`
    )
    .eq('id', params.id)
    .maybeSingle()

  if (!data) {
    return (
      <div className="px-5 pt-5">
        <Link href="/admin/jobs" style={{ color: '#7A90AA', fontSize: 13 }}>
          ← Jobs
        </Link>
        <p
          className="mt-3"
          style={{ fontSize: 14, color: '#AABDE0', fontStyle: 'italic' }}
        >
          Job not found.
        </p>
      </div>
    )
  }

  const row = data as unknown as {
    id: string
    title: string | null
    client_id: string | null
    status: string | null
    start_date: string | null
    end_date: string | null
    call_time: string | null
    day_rate_cents: number | null
    location: string | null
    address_line: string | null
    address_city: string | null
    address_state: string | null
    address_zip: string | null
    num_talent: number | null
    crew_needed: string[] | null
    description: string | null
    client_notes: string | null
    admin_notes: string | null
  }

  const initial: JobFormInitial = {
    id: row.id,
    title: row.title ?? '',
    client_id: row.client_id,
    status: row.status ?? 'submitted',
    start_date: row.start_date,
    end_date: row.end_date,
    call_time: row.call_time,
    day_rate_cents: row.day_rate_cents,
    location: row.location,
    address_line: row.address_line,
    address_city: row.address_city,
    address_state: row.address_state,
    address_zip: row.address_zip,
    num_talent: row.num_talent,
    crew_needed: Array.isArray(row.crew_needed) ? row.crew_needed : [],
    description: row.description,
    client_notes: row.client_notes,
    admin_notes: row.admin_notes,
  }

  return <JobForm mode="edit" initial={initial} action={updateJob} />
}

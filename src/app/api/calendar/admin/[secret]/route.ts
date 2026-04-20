import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase-service'
import { buildICalendar, type ICalEvent } from '@/lib/ical'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

type ClientJoin = {
  full_name: string | null
  client_profiles:
    | { company_name: string | null }
    | { company_name: string | null }[]
    | null
}

type JobRow = {
  id: string
  title: string
  status: string
  start_date: string | null
  end_date: string | null
  call_time: string | null
  location: string | null
  address_line: string | null
  address_city: string | null
  address_state: string | null
  address_zip: string | null
  description: string | null
  client_notes: string | null
  profiles: ClientJoin | ClientJoin[] | null
}

function unwrap<T>(v: T | T[] | null | undefined): T | null {
  if (v == null) return null
  return Array.isArray(v) ? v[0] ?? null : v
}

export async function GET(
  _request: NextRequest,
  { params }: { params: { secret: string } }
) {
  const supabase = createServiceClient()

  const { data: setting } = await supabase
    .from('admin_settings')
    .select('value')
    .eq('key', 'calendar_secret')
    .maybeSingle()

  if (!setting || setting.value !== params.secret) {
    return new NextResponse('Unauthorised', { status: 401 })
  }

  const { data } = await supabase
    .from('jobs')
    .select(
      `id, title, status, start_date, end_date, call_time, location,
       address_line, address_city, address_state, address_zip,
       description, client_notes,
       profiles!jobs_client_id_fkey (full_name,
         client_profiles (company_name))`
    )
    .neq('status', 'cancelled')
    .order('start_date', { ascending: true })

  const rows = (data ?? []) as unknown as JobRow[]

  const events: ICalEvent[] = []
  for (const job of rows) {
    if (!job.start_date) continue
    const clientRow = unwrap(job.profiles)
    const cp = clientRow ? unwrap(clientRow.client_profiles) : null
    const client = cp?.company_name || clientRow?.full_name || 'Unknown client'

    const addressParts = [
      job.address_line,
      [job.address_city, job.address_state, job.address_zip]
        .filter(Boolean)
        .join(' '),
    ].filter(Boolean) as string[]
    const fullAddress = addressParts.join(', ') || job.location || ''

    const descLines: string[] = [`Status: ${job.status}`, `Client: ${client}`]
    if (job.call_time) descLines.push(`Call time: ${job.call_time.slice(0, 5)}`)
    if (job.client_notes) descLines.push(job.client_notes)
    if (job.description) descLines.push(job.description)

    events.push({
      uid: `${job.id}@rowlystudios.com`,
      start: job.start_date,
      end: job.end_date,
      summary: `${job.title} — ${client}`,
      location: fullAddress || null,
      description: descLines.join('\n\n'),
      status: job.status === 'confirmed' ? 'CONFIRMED' : 'TENTATIVE',
    })
  }

  const ics = buildICalendar({
    name: 'Rowly Studios — All Jobs',
    events,
  })

  return new NextResponse(ics, {
    status: 200,
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'attachment; filename="rowly-studios-jobs.ics"',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
    },
  })
}

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { buildICalendar, type ICalEvent } from '@/lib/ical'

export const dynamic = 'force-dynamic'

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

export async function GET() {
  const supabase = createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return new NextResponse('Unauthorized', { status: 401 })
  }
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle()
  if (profile?.role !== 'admin') {
    return new NextResponse('Forbidden', { status: 403 })
  }

  const { data } = await supabase
    .from('jobs')
    .select(
      `id, title, status, start_date, end_date, location,
       address_line, address_city, address_state, address_zip,
       description, client_notes,
       profiles!jobs_client_id_fkey (full_name,
         client_profiles (company_name))`
    )
    .neq('status', 'cancelled')
    .order('start_date', { ascending: true })

  const rows = (data ?? []) as unknown as JobRow[]
  const events: ICalEvent[] = []
  for (const j of rows) {
    if (!j.start_date) continue
    const client = unwrap(j.profiles)
    const cp = client ? unwrap(client.client_profiles) : null
    const clientName =
      cp?.company_name || client?.full_name || 'Unknown client'

    const addressParts = [
      j.address_line,
      [j.address_city, j.address_state, j.address_zip]
        .filter(Boolean)
        .join(' '),
    ].filter(Boolean) as string[]
    const fullAddress = addressParts.join(', ') || j.location || ''

    const descLines: string[] = [`Status: ${j.status}`, `Client: ${clientName}`]
    if (j.client_notes) descLines.push(j.client_notes)
    if (j.description) descLines.push(j.description)

    events.push({
      uid: `${j.id}@rowlystudios.com`,
      start: j.start_date,
      end: j.end_date,
      summary: `${j.title} — ${clientName}`,
      location: fullAddress || null,
      description: descLines.join('\n\n'),
      status: j.status === 'confirmed' ? 'CONFIRMED' : 'TENTATIVE',
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
      'Content-Disposition':
        'attachment; filename="rowly-studios-jobs.ics"',
      'Cache-Control': 'no-cache, no-store',
    },
  })
}

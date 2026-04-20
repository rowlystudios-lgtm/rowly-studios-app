import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { buildICalendar, type ICalEvent } from '@/lib/ical'

export const dynamic = 'force-dynamic'

type BookingRow = {
  confirmed_rate_cents: number | null
  status: string
  jobs:
    | {
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
        client_notes: string | null
      }
    | {
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
        client_notes: string | null
      }[]
    | null
}

function unwrap<T>(v: T | T[] | null | undefined): T | null {
  if (v == null) return null
  return Array.isArray(v) ? v[0] ?? null : v
}

export async function GET(
  _request: Request,
  { params }: { params: { talentId: string } }
) {
  const supabase = createClient()
  const talentId = params.talentId

  // The URL itself is the auth — intentionally no session check. The id is
  // a UUID which is obscure enough for a PWA calendar feed. Signed tokens
  // can be added later if this gets public-facing.
  const { data } = await supabase
    .from('job_bookings')
    .select(
      `status, confirmed_rate_cents,
       jobs (id, title, status, start_date, end_date, call_time, location,
         address_line, address_city, address_state, address_zip, client_notes)`
    )
    .eq('talent_id', talentId)
    .in('status', ['confirmed', 'requested'])

  const rows = (data ?? []) as unknown as BookingRow[]

  const events: ICalEvent[] = []
  for (const b of rows) {
    const j = unwrap(b.jobs)
    if (!j || !j.start_date) continue
    if (j.status === 'cancelled') continue

    const addressParts = [
      j.address_line,
      [j.address_city, j.address_state, j.address_zip]
        .filter(Boolean)
        .join(' '),
    ].filter(Boolean) as string[]
    const fullAddress = addressParts.join(', ') || j.location || ''
    const call = j.call_time ? j.call_time.slice(0, 5) : null
    const summary = call ? `${j.title} — Call ${call}` : j.title

    const descLines: string[] = [`Status: ${b.status}`]
    if (j.client_notes) descLines.push(j.client_notes)

    events.push({
      uid: `booking-${talentId}-${j.id}@rowlystudios.com`,
      start: j.start_date,
      end: j.end_date,
      summary,
      location: fullAddress || null,
      description: descLines.join('\n\n'),
      status: b.status === 'confirmed' ? 'CONFIRMED' : 'TENTATIVE',
    })
  }

  const ics = buildICalendar({
    name: 'Rowly Studios — My Schedule',
    events,
  })

  return new NextResponse(ics, {
    status: 200,
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'attachment; filename="rowly-studios-schedule.ics"',
      'Cache-Control': 'no-cache, no-store',
    },
  })
}

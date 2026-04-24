import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase-service'
import { generateICS } from '@/lib/calendar'

export const dynamic = 'force-dynamic'

type JobRow = {
  id: string
  title: string
  job_code: string | null
  start_date: string | null
  end_date: string | null
  call_time: string | null
  location: string | null
  client_notes: string | null
}

type BookingRow = {
  id: string
  jobs: JobRow | JobRow[] | null
}

function unwrap<T>(v: T | T[] | null | undefined): T | null {
  if (v == null) return null
  return Array.isArray(v) ? v[0] ?? null : v
}

export async function GET(
  _request: Request,
  { params }: { params: { bookingId: string } }
) {
  const supabase = createServiceClient()
  const { data } = await supabase
    .from('job_bookings')
    .select(
      `id, jobs (id, title, job_code, start_date, end_date, call_time, location, client_notes)`
    )
    .eq('id', params.bookingId)
    .maybeSingle()

  const row = data as unknown as BookingRow | null
  const job = unwrap(row?.jobs ?? null)

  if (!row || !job || !job.start_date) {
    return new NextResponse('Booking not found', { status: 404 })
  }

  const ics = generateICS({
    title: job.title,
    startDate: job.start_date,
    endDate: job.end_date ?? undefined,
    callTime: job.call_time,
    location: job.location,
    description: job.client_notes,
    jobCode: job.job_code,
  })

  const safeCode = (job.job_code ?? 'job').replace(/[^a-zA-Z0-9_-]/g, '-')

  return new NextResponse(ics, {
    status: 200,
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': `attachment; filename="rowly-${safeCode}.ics"`,
      'Cache-Control': 'no-cache, no-store',
    },
  })
}

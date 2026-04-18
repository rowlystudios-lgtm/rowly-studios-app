export type JobRow = {
  id: string
  title: string
  description: string | null
  location: string | null
  start_date: string
  end_date: string | null
  call_time: string | null
  day_rate_cents: number | null
  client_notes: string | null
}

export type BookingStatus = 'requested' | 'confirmed' | 'declined'

export type Booking = {
  id: string
  status: BookingStatus
  confirmed_rate_cents: number | null
  job: JobRow
}

type BookingRaw = {
  id: string
  status: BookingStatus
  confirmed_rate_cents: number | null
  jobs: JobRow | JobRow[] | null
}

export function normalizeBooking(raw: BookingRaw): Booking | null {
  if (!raw.jobs) return null
  const job = Array.isArray(raw.jobs) ? raw.jobs[0] : raw.jobs
  if (!job) return null
  return {
    id: raw.id,
    status: raw.status,
    confirmed_rate_cents: raw.confirmed_rate_cents,
    job,
  }
}

export function formatMoney(cents: number | null | undefined): string {
  if (!cents && cents !== 0) return '—'
  return `$${(cents / 100).toLocaleString()}`
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const DAYS_LONG = [
  'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday',
]
const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
]
const MONTHS_LONG = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

function parseLocalDate(iso: string): Date | null {
  const parts = iso.split('-').map(Number)
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) return null
  return new Date(parts[0], parts[1] - 1, parts[2])
}

function shortDate(d: Date): string {
  return `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`
}

export function formatDateRange(start: string, end: string | null): string {
  const s = parseLocalDate(start)
  if (!s) return ''
  if (!end || end === start) return shortDate(s)
  const e = parseLocalDate(end)
  if (!e) return shortDate(s)
  return `${shortDate(s)} — ${shortDate(e)}`
}

export function formatLongDate(d: Date): string {
  return `${DAYS_LONG[d.getDay()]}, ${d.getDate()} ${MONTHS_LONG[d.getMonth()]}`
}

export function formatCallTime(t: string | null): string {
  if (!t) return ''
  const [h, m] = t.split(':').map(Number)
  if (Number.isNaN(h)) return ''
  const period = h >= 12 ? 'PM' : 'AM'
  const hh = h % 12 || 12
  return `${hh}:${String(m ?? 0).padStart(2, '0')} ${period}`
}

export function greeting(now = new Date()): string {
  const h = now.getHours()
  if (h < 12) return 'Good morning'
  if (h < 18) return 'Good afternoon'
  return 'Good evening'
}

export function getMapsUrl(location: string): string {
  const q = encodeURIComponent(location)
  if (typeof navigator === 'undefined') return `https://maps.google.com/?q=${q}`
  const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent)
  return isIOS ? `maps://?q=${q}` : `https://maps.google.com/?q=${q}`
}

function icsBounds(job: JobRow): { start: Date; end: Date } {
  const start = new Date(`${job.start_date}T${job.call_time ?? '08:00:00'}`)
  const end = job.end_date
    ? new Date(`${job.end_date}T18:00:00`)
    : new Date(start.getTime() + 10 * 3600 * 1000)
  return { start, end }
}

function icsFmt(d: Date): string {
  return d.toISOString().replace(/[-:.]/g, '').slice(0, 15) + 'Z'
}

export function downloadICS(job: JobRow): void {
  const { start, end } = icsBounds(job)
  const ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Rowly Studios//RS App//EN',
    'BEGIN:VEVENT',
    `DTSTART:${icsFmt(start)}`,
    `DTEND:${icsFmt(end)}`,
    `SUMMARY:${job.title}`,
    `LOCATION:${job.location ?? ''}`,
    `DESCRIPTION:${(job.description ?? '').replace(/\n/g, '\\n')}`,
    `UID:${job.id}@rowlystudios.com`,
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n')
  const blobUrl = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' }))
  const a = document.createElement('a')
  a.href = blobUrl
  a.download = `${job.title.replace(/\s+/g, '-')}.ics`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(blobUrl), 1000)
}

export function googleCalUrl(job: JobRow): string {
  const { start, end } = icsBounds(job)
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: job.title,
    dates: `${icsFmt(start)}/${icsFmt(end)}`,
    details: job.description ?? '',
    location: job.location ?? '',
  })
  return `https://calendar.google.com/calendar/render?${params.toString()}`
}

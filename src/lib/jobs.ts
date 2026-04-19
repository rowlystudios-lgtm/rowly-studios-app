export type ShootDay = {
  date: string
  call_time: string | null
}

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
  shoot_days?: ShootDay[] | null
  crew_needed?: string[] | null
}

export const CREW_LABELS: Record<string, string> = {
  photography: 'Camera / Photography',
  video: 'Video / DP',
  production: 'Production Manager',
  styling: 'Styling',
  mua: 'Hair & Makeup',
  art_direction: 'Art Direction',
  editing: 'Edit & Post',
  sound: 'Sound',
  gaffer: 'Lighting / Gaffer',
  pa: 'Production Assistant',
}

/**
 * Map crew_needed keys (job form) to talent_profiles.department values.
 * Used to pre-seed the Roster department filter when a client browses
 * talent for a specific job.
 */
export type TalentDepartment =
  | 'camera'
  | 'styling'
  | 'glam'
  | 'post'
  | 'production'
  | 'direction'
  | 'other'

export const CREW_TO_DEPARTMENT: Record<string, TalentDepartment> = {
  photography: 'camera',
  video: 'camera',
  production: 'production',
  styling: 'styling',
  mua: 'glam',
  art_direction: 'direction',
  editing: 'post',
  sound: 'post',
  gaffer: 'camera',
  pa: 'production',
}

export const CREW_OPTIONS: Array<{ key: string; label: string }> = [
  { key: 'photography', label: CREW_LABELS.photography },
  { key: 'video', label: CREW_LABELS.video },
  { key: 'production', label: CREW_LABELS.production },
  { key: 'styling', label: CREW_LABELS.styling },
  { key: 'mua', label: CREW_LABELS.mua },
  { key: 'art_direction', label: CREW_LABELS.art_direction },
  { key: 'editing', label: CREW_LABELS.editing },
  { key: 'sound', label: CREW_LABELS.sound },
  { key: 'gaffer', label: CREW_LABELS.gaffer },
  { key: 'pa', label: CREW_LABELS.pa },
]

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

function ymd(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function addDays(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n)
}

function isShootDayArray(value: unknown): value is ShootDay[] {
  return (
    Array.isArray(value) &&
    value.every(
      (v) =>
        v &&
        typeof v === 'object' &&
        'date' in v &&
        typeof (v as { date: unknown }).date === 'string'
    )
  )
}

/**
 * Resolve a booking's shoot days, preferring the structured
 * shoot_days array when present and falling back to
 * start_date + end_date + call_time for legacy rows.
 */
export function resolveShootDays(job: {
  shoot_days?: ShootDay[] | null
  start_date?: string | null
  end_date?: string | null
  call_time?: string | null
}): ShootDay[] {
  if (isShootDayArray(job.shoot_days) && job.shoot_days.length > 0) {
    return job.shoot_days.map((d) => ({
      date: d.date,
      call_time: d.call_time ?? null,
    }))
  }
  if (!job.start_date) return []
  const start = parseLocalDate(job.start_date)
  if (!start) return []
  const end = job.end_date ? parseLocalDate(job.end_date) : start
  if (!end || end <= start) {
    return [{ date: job.start_date, call_time: job.call_time ?? null }]
  }
  const days: ShootDay[] = []
  for (let d = start; d <= end; d = addDays(d, 1)) {
    days.push({ date: ymd(d), call_time: job.call_time ?? null })
  }
  return days
}

/**
 * One-line summary used on compact job cards.
 * 1 day:  "Thu 23 Apr · Call 8:00 AM"
 * 2+ days: "Thu 23 Apr + 2 more days · Call 8:00 AM"
 */
export function summariseShootDays(
  job: {
    shoot_days?: ShootDay[] | null
    start_date?: string | null
    end_date?: string | null
    call_time?: string | null
  }
): string {
  const days = resolveShootDays(job)
  if (days.length === 0) return ''
  const first = parseLocalDate(days[0].date)
  if (!first) return ''
  const firstLabel = shortDate(first)
  const callLabel = formatCallTime(days[0].call_time)
  const extra = days.length - 1
  let label = firstLabel
  if (extra > 0) {
    label = `${firstLabel} + ${extra} more day${extra === 1 ? '' : 's'}`
  }
  if (callLabel) label = `${label} · Call ${callLabel}`
  return label
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

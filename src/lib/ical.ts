/**
 * Minimal iCal (RFC 5545) generator. We only emit all-day VEVENTs,
 * which is enough for shoot-day blocks in a PWA-shared calendar.
 */

export type ICalEvent = {
  uid: string
  start: string // YYYY-MM-DD
  end: string | null // YYYY-MM-DD (inclusive end — we roll to exclusive internally)
  summary: string
  location?: string | null
  description?: string | null
  status?: 'CONFIRMED' | 'TENTATIVE' | 'CANCELLED'
}

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

function toIcalDate(iso: string): string {
  // Accepts YYYY-MM-DD → YYYYMMDD
  return iso.replace(/-/g, '')
}

function addOneDay(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  dt.setUTCDate(dt.getUTCDate() + 1)
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`
}

function nowStamp(): string {
  const d = new Date()
  return (
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`
  )
}

/**
 * Escape iCal field text per RFC 5545: commas, semicolons, backslashes,
 * and newlines all need escaping. Newlines become literal "\n".
 */
function esc(raw: string): string {
  return raw
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\n|\r/g, '\\n')
}

/**
 * Fold lines longer than 75 octets per RFC 5545. Good clients (Google,
 * Apple) tolerate unfolded output, but folding prevents the rare parser
 * that still cares.
 */
function fold(line: string): string {
  if (line.length <= 75) return line
  const parts: string[] = []
  let rest = line
  parts.push(rest.slice(0, 75))
  rest = rest.slice(75)
  while (rest.length > 0) {
    parts.push(' ' + rest.slice(0, 74))
    rest = rest.slice(74)
  }
  return parts.join('\r\n')
}

export function buildICalendar(opts: {
  name: string
  events: ICalEvent[]
}): string {
  const lines: string[] = []
  const add = (s: string) => lines.push(fold(s))

  add('BEGIN:VCALENDAR')
  add('VERSION:2.0')
  add('PRODID:-//Rowly Studios//Admin Calendar//EN')
  add('CALSCALE:GREGORIAN')
  add('METHOD:PUBLISH')
  add(`X-WR-CALNAME:${esc(opts.name)}`)
  add('X-WR-TIMEZONE:America/Los_Angeles')

  const stamp = nowStamp()

  for (const ev of opts.events) {
    const startIcal = toIcalDate(ev.start)
    // iCal DTEND is exclusive for VALUE=DATE events. Inclusive end date → add 1 day.
    const inclusiveEnd = ev.end && ev.end >= ev.start ? ev.end : ev.start
    const exclusiveEnd = addOneDay(inclusiveEnd)
    const endIcal = toIcalDate(exclusiveEnd)

    add('BEGIN:VEVENT')
    add(`UID:${ev.uid}`)
    add(`DTSTAMP:${stamp}`)
    add(`DTSTART;VALUE=DATE:${startIcal}`)
    add(`DTEND;VALUE=DATE:${endIcal}`)
    add(`SUMMARY:${esc(ev.summary)}`)
    if (ev.location) add(`LOCATION:${esc(ev.location)}`)
    if (ev.description) add(`DESCRIPTION:${esc(ev.description)}`)
    if (ev.status) add(`STATUS:${ev.status}`)
    add('END:VEVENT')
  }

  add('END:VCALENDAR')
  return lines.join('\r\n') + '\r\n'
}

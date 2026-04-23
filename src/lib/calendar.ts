/**
 * Generates an .ics calendar file content string for a job booking.
 * Works with Apple Calendar, Google Calendar, and Outlook.
 *
 * iPhone-first: tapping the resulting download on iOS opens directly
 * in Apple Calendar with the event pre-filled.
 */
export function generateICS(params: {
  title: string
  startDate: string // ISO YYYY-MM-DD
  endDate?: string // ISO YYYY-MM-DD if multi-day
  callTime?: string | null // HH:MM
  location?: string | null
  description?: string | null
  jobCode?: string | null
}): string {
  const { title, startDate, endDate, callTime, location, description, jobCode } =
    params

  function toICSDate(dateStr: string, timeStr?: string | null): string {
    const [y, m, d] = dateStr.split('-')
    if (timeStr) {
      const [h, min] = timeStr.split(':')
      return `${y}${m}${d}T${h.padStart(2, '0')}${min.padStart(2, '0')}00`
    }
    return `${y}${m}${d}`
  }

  const uid = `${Date.now()}-rowlystudios@rowlystudios.com`
  const now =
    new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z'
  const dtStart = toICSDate(startDate, callTime)
  // End = call time + 10 hours, or full-day end-of-day if no call time
  const endDateStr = endDate ?? startDate
  let dtEnd: string
  if (callTime) {
    const [h, min] = callTime.split(':').map(Number)
    const endHour = Math.min(h + 10, 23)
    dtEnd = toICSDate(
      endDateStr,
      `${String(endHour).padStart(2, '0')}:${String(min).padStart(2, '0')}`
    )
  } else {
    const [y, m, d] = endDateStr.split('-').map(Number)
    const next = new Date(y, m - 1, d + 1)
    dtEnd = `${next.getFullYear()}${String(next.getMonth() + 1).padStart(2, '0')}${String(next.getDate()).padStart(2, '0')}`
  }

  const isAllDay = !callTime
  const dtStartLine = isAllDay
    ? `DTSTART;VALUE=DATE:${dtStart}`
    : `DTSTART:${dtStart}`
  const dtEndLine = isAllDay ? `DTEND;VALUE=DATE:${dtEnd}` : `DTEND:${dtEnd}`

  const descParts = [
    description,
    jobCode ? `Job: ${jobCode}` : null,
    'Rowly Studios · rowlystudios.com',
  ]
    .filter(Boolean)
    .join('\\n')

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Rowly Studios//RS App//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${now}`,
    dtStartLine,
    dtEndLine,
    `SUMMARY:${title}`,
    location ? `LOCATION:${location.replace(/,/g, '\\,')}` : '',
    descParts ? `DESCRIPTION:${descParts}` : '',
    'STATUS:CONFIRMED',
    'BEGIN:VALARM',
    'TRIGGER:-PT60M',
    'ACTION:DISPLAY',
    `DESCRIPTION:Reminder: ${title} in 1 hour`,
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ]
    .filter(Boolean)
    .join('\r\n')
}

/**
 * Triggers an .ics file download. On iOS this opens Apple Calendar
 * directly with the event pre-loaded.
 */
export function downloadICS(icsContent: string, filename: string) {
  const blob = new Blob([icsContent], {
    type: 'text/calendar;charset=utf-8',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

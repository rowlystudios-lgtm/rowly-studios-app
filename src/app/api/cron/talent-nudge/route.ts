import { NextResponse, type NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase-service'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

/**
 * Hourly talent-nudge cron. Wired to 0 * * * * UTC in vercel.json.
 *
 * Protected by x-cron-secret header (or Authorization: Bearer <secret>
 * for Vercel's built-in cron runner). Rejects 401 otherwise. Explicit
 * empty-secret guard so an unset env var fails closed rather than
 * matching a "Bearer " request with no secret on either side.
 *
 * Finds job_bookings still in 'requested' state (talent hasn't responded
 * — talent_reviewed_at IS NULL) for non-cancelled jobs, then decides
 * per-booking whether to fire a reminder notification:
 *
 *   Standard (shoot > 48h away):
 *     - Fires once the request is 24h+ old AND last nudge was 24h+ ago.
 *     - Caps at 3 nudges total — if nudge_count >= 3, no further nudges.
 *
 *   Urgent (shoot ≤ 48h away):
 *     - Fires every 4h — no cap. Runs until the booking flips out of
 *       'requested' or its job is cancelled.
 *
 *   Past shoot (start_date in the past):
 *     - Skip silently. Booking is stale; nudging about a finished job
 *       would just confuse the talent.
 *
 * Each fire inserts a notification + bumps nudge_count / nudged_at on
 * the booking row. Per-booking try/catch so one bad row doesn't abort
 * the run; counted under errors and surfaced in the response payload.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  const headerSecret =
    req.headers.get('x-cron-secret') ||
    req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ||
    ''
  if (!secret || headerSecret !== secret) {
    return new NextResponse('Unauthorized', { status: 401 })
  }

  const svc = createServiceClient()
  const now = new Date()
  const nowMs = now.getTime()
  const nowIso = now.toISOString()

  const { data: bookings, error } = await svc
    .from('job_bookings')
    .select(
      `id, talent_id, job_id, created_at, nudge_count, nudged_at,
       jobs!inner(title, start_date, status)`
    )
    .eq('status', 'requested')
    .is('talent_reviewed_at', null)
    .neq('jobs.status', 'cancelled')

  if (error) {
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 }
    )
  }

  type JobJoin = {
    title: string
    start_date: string | null
    status: string
  }
  type BookingRow = {
    id: string
    talent_id: string
    job_id: string
    created_at: string
    nudge_count: number | null
    nudged_at: string | null
    jobs: JobJoin | JobJoin[] | null
  }

  function unwrap<T>(v: T | T[] | null | undefined): T | null {
    if (v == null) return null
    return Array.isArray(v) ? v[0] ?? null : v
  }

  const rows = (bookings ?? []) as unknown as BookingRow[]
  const counts = {
    processed: rows.length,
    nudged: 0,
    skipped: 0,
    errors: 0,
  }

  for (const booking of rows) {
    try {
      const job = unwrap(booking.jobs)
      if (!job || !job.start_date) {
        counts.skipped += 1
        continue
      }

      const hoursOld =
        (nowMs - new Date(booking.created_at).getTime()) / 3_600_000
      const shootMs = new Date(job.start_date).getTime()
      const hoursUntilShoot = (shootMs - nowMs) / 3_600_000

      // Past-shoot bookings: skip. The job has already happened — a
      // nudge would be confusing noise. Some other process should
      // close the booking out, not this cron.
      if (hoursUntilShoot < 0) {
        counts.skipped += 1
        continue
      }

      const isUrgent = hoursUntilShoot <= 48
      const lastNudge = booking.nudged_at ? new Date(booking.nudged_at) : null
      const hoursSinceLastNudge = lastNudge
        ? (nowMs - lastNudge.getTime()) / 3_600_000
        : Infinity

      const shouldNudge = isUrgent
        ? hoursSinceLastNudge >= 4
        : hoursOld >= 24 &&
          hoursSinceLastNudge >= 24 &&
          (booking.nudge_count ?? 0) < 3

      if (!shouldNudge) {
        counts.skipped += 1
        continue
      }

      const notifBody = isUrgent
        ? `⚠️ Urgent: "${job.title}" starts soon — please respond to this booking request.`
        : `👋 Reminder: You have an unanswered booking request for "${job.title}". Please respond when you can.`

      await svc.from('notifications').insert({
        user_id: booking.talent_id,
        type: 'booking_nudge',
        title: isUrgent
          ? 'Urgent: Booking request needs your response'
          : 'Booking request reminder',
        body: notifBody,
        action_url: `/app/jobs/${booking.job_id}`,
        priority: isUrgent ? 'urgent' : 'normal',
        clearable: true,
      })

      await svc
        .from('job_bookings')
        .update({
          nudge_count: (booking.nudge_count ?? 0) + 1,
          nudged_at: nowIso,
        })
        .eq('id', booking.id)

      counts.nudged += 1
    } catch {
      counts.errors += 1
    }
  }

  return NextResponse.json({ ok: true, ...counts })
}

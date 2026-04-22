import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { createServiceClient } from '@/lib/supabase-service'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

type Body = {
  message?: string
  title?: string
  type?: 'booking' | 'job' | 'payment' | 'general'
  recipient_type?: 'all_talent' | 'all_clients' | 'all' | 'specific'
  recipient_id?: string
  link?: string
}

/**
 * POST /api/admin/send-notification
 *
 * Used by the admin notifications panel's Send button. Requires an
 * authenticated admin session. Inserts one notification row per resolved
 * recipient. Push dispatch is best-effort — if the web_push_subscriptions
 * table doesn't yet exist in this environment, push is skipped silently.
 */
export async function POST(req: NextRequest) {
  // Auth: authenticated admin only.
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return new NextResponse('Unauthorized', { status: 401 })

  const { data: actor } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle()
  if (actor?.role !== 'admin') {
    return new NextResponse('Forbidden', { status: 403 })
  }

  let body: Body
  try {
    body = (await req.json()) as Body
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const title = (body.title ?? '').trim().slice(0, 80)
  const message = (body.message ?? '').trim().slice(0, 300)
  const recipientType = body.recipient_type ?? 'all_talent'
  const specificId = (body.recipient_id ?? '').trim()
  const link = (body.link ?? '').trim() || null
  const allowedTypes = ['booking', 'job', 'payment', 'general'] as const
  const type = allowedTypes.includes(
    (body.type ?? 'general') as (typeof allowedTypes)[number]
  )
    ? (body.type as (typeof allowedTypes)[number])
    : 'general'

  if (!message) return NextResponse.json({ error: 'message required' }, { status: 400 })

  const svc = createServiceClient()

  // Resolve recipient user ids.
  let ids: string[] = []
  if (recipientType === 'specific') {
    if (!specificId) return NextResponse.json({ error: 'recipient_id required' }, { status: 400 })
    ids = [specificId]
  } else if (recipientType === 'all_talent') {
    const { data } = await svc
      .from('profiles')
      .select('id')
      .eq('role', 'talent')
      .eq('verified', true)
    ids = (data ?? []).map((r) => r.id)
  } else if (recipientType === 'all_clients') {
    const { data } = await svc
      .from('profiles')
      .select('id')
      .eq('role', 'client')
      .eq('verified', true)
    ids = (data ?? []).map((r) => r.id)
  } else if (recipientType === 'all') {
    const { data } = await svc
      .from('profiles')
      .select('id')
      .in('role', ['talent', 'client'])
      .eq('verified', true)
    ids = (data ?? []).map((r) => r.id)
  } else {
    return NextResponse.json({ error: 'invalid recipient_type' }, { status: 400 })
  }

  if (ids.length === 0) {
    return NextResponse.json({ ok: true, inserted: 0 })
  }

  const now = new Date().toISOString()
  const { error: insErr } = await svc.from('notifications').insert(
    ids.map((uid) => ({
      user_id: uid,
      type,
      title: title || 'Notice from Rowly Studios',
      body: message,
      link,
      action_url: link,
      sent_by: user.id,
      channel: 'in_app',
      created_at: now,
    }))
  )
  if (insErr) {
    return NextResponse.json({ error: insErr.message }, { status: 500 })
  }

  // Best-effort push dispatch. Silently no-op if the subscriptions table
  // or VAPID keys are missing so the in-app insert always goes through.
  const pushCount = await dispatchPush(ids, {
    title: title || 'Rowly Studios',
    body: message,
    url: link ?? '/app/notifications',
  }).catch(() => 0)

  return NextResponse.json({
    ok: true,
    inserted: ids.length,
    pushSent: pushCount,
  })
}

type PushPayload = { title: string; body: string; url: string }

/**
 * Best-effort web-push dispatch. Requires a web_push_subscriptions table
 * with user_id + subscription (jsonb) columns and VAPID_PUBLIC_KEY /
 * VAPID_PRIVATE_KEY / VAPID_SUBJECT env vars. Missing any of them → 0.
 */
async function dispatchPush(
  userIds: string[],
  payload: PushPayload
): Promise<number> {
  const publicKey = process.env.VAPID_PUBLIC_KEY
  const privateKey = process.env.VAPID_PRIVATE_KEY
  const subject = process.env.VAPID_SUBJECT ?? 'mailto:rowlystudios@gmail.com'
  if (!publicKey || !privateKey) return 0

  const svc = createServiceClient()
  let subs:
    | Array<{ user_id: string; subscription: unknown }>
    | null = null
  try {
    const { data, error } = await svc
      .from('web_push_subscriptions')
      .select('user_id, subscription')
      .in('user_id', userIds)
    if (error) return 0
    subs = (data ?? []) as Array<{ user_id: string; subscription: unknown }>
  } catch {
    return 0
  }
  if (!subs || subs.length === 0) return 0

  let webpush: typeof import('web-push')
  try {
    webpush = (await import('web-push')).default
  } catch {
    return 0
  }
  try {
    webpush.setVapidDetails(subject, publicKey, privateKey)
  } catch {
    return 0
  }

  let sent = 0
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          s.subscription as import('web-push').PushSubscription,
          JSON.stringify(payload)
        )
        sent += 1
      } catch {
        // Subscription likely expired — ignore.
      }
    })
  )
  return sent
}

'use server'

import { createClient } from '@/lib/supabase-server'
import { createServiceClient } from '@/lib/supabase-service'
import { sendNotification } from '@/lib/notifications'

export async function sendChatMessage(params: {
  jobId: string
  body: string
}): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const text = params.body.trim()
  if (!text) return { ok: false, error: 'Message cannot be empty' }
  if (text.length > 4000) {
    return { ok: false, error: 'Message too long (max 4000 chars)' }
  }

  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Not signed in' }

  // RLS on INSERT enforces window + participant membership. Use the
  // authed client so auth.uid() resolves correctly.
  const { data: inserted, error } = await supabase
    .from('job_chat_messages')
    .insert({
      job_id: params.jobId,
      author_user_id: user.id,
      body: text,
    })
    .select('id')
    .single()

  if (error || !inserted) {
    return { ok: false, error: error?.message ?? 'Could not send message' }
  }

  try {
    await notifyJobChatParticipants({
      jobId: params.jobId,
      authorUserId: user.id,
      preview: text.slice(0, 140),
    })
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('[job-chat] notify failed', e)
  }

  return { ok: true, id: inserted.id }
}

async function notifyJobChatParticipants(params: {
  jobId: string
  authorUserId: string
  preview: string
}) {
  const service = createServiceClient()

  const { data: job } = await service
    .from('jobs')
    .select('id, title, client_id')
    .eq('id', params.jobId)
    .single()
  if (!job) return

  const { data: author } = await service
    .from('profiles')
    .select('full_name, first_name')
    .eq('id', params.authorUserId)
    .single()
  const authorLabel =
    author?.first_name ?? author?.full_name ?? 'Someone'

  // Non-admin recipients: owning client + confirmed talent (excluding author).
  const recipients = new Set<string>()
  if (job.client_id && job.client_id !== params.authorUserId) {
    recipients.add(job.client_id)
  }
  const { data: confirmed } = await service
    .from('job_bookings')
    .select('talent_id')
    .eq('job_id', job.id)
    .eq('status', 'confirmed')
  ;((confirmed ?? []) as Array<{ talent_id: string | null }>).forEach(
    (row) => {
      if (row.talent_id && row.talent_id !== params.authorUserId) {
        recipients.add(row.talent_id)
      }
    }
  )

  // Admins: one in-app ping on the FIRST message only, no email, no
  // per-message chatter. The just-inserted row is counted, so
  // totalMessages <= 1 means this is the first.
  const { count: totalMessages } = await service
    .from('job_chat_messages')
    .select('id', { count: 'exact', head: true })
    .eq('job_id', job.id)

  if ((totalMessages ?? 0) <= 1) {
    const { data: admins } = await service
      .from('profiles')
      .select('id')
      .eq('role', 'admin')
    for (const a of ((admins ?? []) as Array<{ id: string }>)) {
      if (!a.id || a.id === params.authorUserId) continue
      await sendNotification({
        userId: a.id,
        type: 'job_chat_message',
        title: `Group chat started: ${job.title}`,
        body: `${authorLabel} posted the first message. You can read the thread in admin → jobs.`,
        actionUrl: `/admin/jobs/${job.id}#chat`,
        channels: ['in_app'],
      })
    }
  }

  // Per-message in-app + throttled email for talent + client. Throttle
  // on type + user + recency (notifications table has no job_id column
  // and link is plain text, not jsonb, so this is coarser than per-job
  // throttling — good enough for v1).
  const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString()

  for (const uid of recipients) {
    const { data: recent } = await service
      .from('notifications')
      .select('id')
      .eq('user_id', uid)
      .eq('type', 'job_chat_message')
      .gt('created_at', thirtyMinAgo)
      .limit(1)
    const suppressEmail = (recent?.length ?? 0) > 0

    await sendNotification({
      userId: uid,
      type: 'job_chat_message',
      title: `${authorLabel}: ${job.title}`,
      body: params.preview,
      actionUrl: `/app#job-${job.id}`,
      channels: suppressEmail ? ['in_app'] : ['in_app', 'email'],
    })
  }
}

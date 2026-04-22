'use server'

import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/admin-auth'

type NotificationType = 'booking' | 'job' | 'payment' | 'general'
const ALLOWED_TYPES: NotificationType[] = [
  'booking',
  'job',
  'payment',
  'general',
]

export async function sendNotification(formData: FormData) {
  const { supabase, user } = await requireAdmin()

  const target = ((formData.get('target') as string) ?? '').trim()
  const specificId = ((formData.get('specific_id') as string) ?? '').trim()
  const typeRaw = ((formData.get('type') as string) ?? 'general') as NotificationType
  const type = ALLOWED_TYPES.includes(typeRaw) ? typeRaw : 'general'
  const title = ((formData.get('title') as string) ?? '').trim().slice(0, 80)
  const body = ((formData.get('body') as string) ?? '').trim().slice(0, 300)
  const link = ((formData.get('link') as string) ?? '').trim() || null

  if (!title || !body || !target) return

  // Resolve recipients.
  let recipientIds: string[] = []
  if (target === 'all_talent') {
    const { data } = await supabase
      .from('profiles')
      .select('id')
      .eq('role', 'talent')
    recipientIds = (data ?? []).map((r) => r.id)
  } else if (target === 'all_clients') {
    const { data } = await supabase
      .from('profiles')
      .select('id')
      .eq('role', 'client')
    recipientIds = (data ?? []).map((r) => r.id)
  } else if (target === 'everyone') {
    const { data } = await supabase
      .from('profiles')
      .select('id')
      .in('role', ['talent', 'client'])
    recipientIds = (data ?? []).map((r) => r.id)
  } else if (target === 'specific' && specificId) {
    recipientIds = [specificId]
  }

  if (recipientIds.length === 0) return

  const now = new Date().toISOString()
  await supabase.from('notifications').insert(
    recipientIds.map((uid) => ({
      user_id: uid,
      type,
      title,
      body,
      link,
      sent_by: user.id,
      channel: 'in_app',
      created_at: now,
    }))
  )

  revalidatePath('/admin/notifications')
  revalidatePath('/admin')
}

export async function deleteNotification(formData: FormData) {
  const { supabase } = await requireAdmin()
  const id = ((formData.get('id') as string) ?? '').trim()
  if (!id) return
  await supabase.from('notifications').delete().eq('id', id)
  revalidatePath('/admin/notifications')
}

/**
 * Admin marks a clearable notification as handled. Sets cleared_at + cleared_by.
 * Removes it from the to-do queue (it stays visible in the activity log).
 */
export async function clearNotification(formData: FormData) {
  const { supabase, user } = await requireAdmin()
  const id = ((formData.get('id') as string) ?? '').trim()
  if (!id) return
  await supabase
    .from('notifications')
    .update({ cleared_at: new Date().toISOString(), cleared_by: user.id })
    .eq('id', id)
    .is('cleared_at', null)
  revalidatePath('/admin/notifications')
}

/** Clear every clearable notification in one shot. */
export async function clearAllNotifications() {
  const { supabase, user } = await requireAdmin()
  await supabase
    .from('notifications')
    .update({ cleared_at: new Date().toISOString(), cleared_by: user.id })
    .eq('clearable', true)
    .is('cleared_at', null)
  revalidatePath('/admin/notifications')
}

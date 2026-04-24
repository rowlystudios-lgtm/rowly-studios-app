'use server'

import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/admin-auth'
import { createServiceClient } from '@/lib/supabase-service'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://app.rowlystudios.com'

/**
 * Save admin notes inline. Called with formData { id, notes }.
 * Non-blocking — silent failure is tolerable (user sees it either way).
 */
export async function saveApplicationNotes(formData: FormData) {
  const { supabase } = await requireAdmin()
  const id = formData.get('id') as string
  const notes = (formData.get('notes') as string) ?? ''
  if (!id) return
  await supabase
    .from('talent_applications')
    .update({ admin_notes: notes })
    .eq('id', id)
  revalidatePath('/admin/applications')
}

/**
 * Accept flow:
 *  1) mark application approved
 *  2) insert into talent_invites (idempotent)
 *  3) invite user via Supabase auth admin API
 *  4) send formatted acceptance email via edge function
 */
export async function acceptApplication(formData: FormData) {
  const { profile } = await requireAdmin()
  const adminId = profile.id
  const id = formData.get('id') as string
  if (!id) return { ok: false, error: 'missing id' }

  const service = createServiceClient()

  // Load the application row so we have the fields we need.
  const { data: app, error: loadErr } = await service
    .from('talent_applications')
    .select('id, email, first_name, last_name, type, status')
    .eq('id', id)
    .maybeSingle()

  if (loadErr || !app) {
    return { ok: false, error: 'application_not_found' }
  }
  if (app.status === 'approved') {
    return { ok: true, note: 'already_approved' }
  }

  // 1) mark approved
  const { error: updErr } = await service
    .from('talent_applications')
    .update({
      status: 'approved',
      reviewed_by: adminId,
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', id)
  if (updErr) return { ok: false, error: updErr.message }

  // 2) create an invite row (idempotent)
  await service
    .from('talent_invites')
    .upsert(
      {
        email: app.email.toLowerCase().trim(),
        application_id: app.id,
        invited_by: adminId,
        invited_at: new Date().toISOString(),
      },
      { onConflict: 'email' }
    )

  // 3) Issue a long-lived welcome invite. We do NOT create the auth
  //    user here — the user is created when they submit the Create
  //    Account form, which is what consumes this token.
  const { createWelcomeInvite } = await import('@/lib/welcome-tokens')
  let token: string
  try {
    const result = await createWelcomeInvite({
      applicationId: app.id,
      email: app.email,
    })
    token = result.token
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    // eslint-disable-next-line no-console
    console.error('[applications.approve] createWelcomeInvite failed:', msg, { email: app.email, applicationId: app.id })
    return { ok: false, error: `Welcome invite creation failed: ${msg}` }
  }
  const roleParam = app.type === 'client' ? 'client' : 'talent'
  const actionLink = `${APP_URL}/login?mode=create&role=${roleParam}&invite=${encodeURIComponent(token)}`

  // 5) Send branded welcome email via Resend.
  const { renderWelcomeEmail } = await import('@/lib/emails/welcome-email')
  const { sendTransactionalEmail } = await import('@/lib/email')
  const { subject, html } = renderWelcomeEmail({
    firstName: app.first_name ?? '',
    applicationType: app.type ?? 'talent',
    actionLink,
  })
  const emailRes = await sendTransactionalEmail({
    to: app.email,
    subject,
    html,
    replyTo: 'hello@rowlystudios.com',
  })
  // Non-fatal: application is still approved even if email fails — admin
  // can resend from the applications list. But surface it in the return.
  if (emailRes?.error) {
    // eslint-disable-next-line no-console
    console.warn('[applications.approve] email send failed:', emailRes.error)
  }

  revalidatePath('/admin/applications')
  return { ok: true }
}

export async function rejectApplication(formData: FormData) {
  const { profile } = await requireAdmin()
  const id = formData.get('id') as string
  if (!id) return { ok: false, error: 'missing id' }

  const service = createServiceClient()
  const { error } = await service
    .from('talent_applications')
    .update({
      status: 'rejected',
      reviewed_by: profile.id,
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', id)

  if (error) return { ok: false, error: error.message }
  revalidatePath('/admin/applications')
  return { ok: true }
}

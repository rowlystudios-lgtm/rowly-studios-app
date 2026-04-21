'use server'

import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/admin-auth'
import { createServiceClient } from '@/lib/supabase-service'

const APP_REDIRECT = 'https://app.rowlystudios.com/app'
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

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

  // 3) invite via Supabase auth admin
  const { error: inviteErr } = await service.auth.admin.inviteUserByEmail(
    app.email,
    {
      redirectTo: APP_REDIRECT,
      data: {
        application_type: app.type,
        first_name: app.first_name,
      },
    }
  )
  // If the user already has an auth identity, inviteUserByEmail fails with
  // "User already registered". That's fine — they can sign in as usual.
  const alreadyRegistered =
    inviteErr && /already|registered|exists/i.test(inviteErr.message)
  if (inviteErr && !alreadyRegistered) {
    return { ok: false, error: inviteErr.message }
  }

  // 4) send acceptance email via edge function
  try {
    if (SUPABASE_URL && SUPABASE_ANON_KEY) {
      await fetch(
        `${SUPABASE_URL}/functions/v1/set-user-password?action=send-acceptance-email`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({
            email: app.email,
            first_name: app.first_name,
            type: app.type,
          }),
        }
      )
    }
  } catch {
    // Non-fatal — status is already approved.
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

'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase-server'
import { createServiceClient } from '@/lib/supabase-service'
import { appendToSheet } from '@/lib/google'

type Result = { ok?: true; error?: string }

async function requireAdminContext(): Promise<
  | { svc: ReturnType<typeof createServiceClient>; actorId: string }
  | { error: string }
> {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Not signed in' }

  const { data: actor } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle()
  if (actor?.role !== 'admin') return { error: 'Not authorised' }

  return { svc: createServiceClient(), actorId: user.id }
}

/**
 * Pause an account. Sets profiles.account_status='paused'. Resumable by
 * admin at any time via resumeAccount(). The paused user keeps their
 * session but the app layout surfaces a PausedAccountScreen and blocks
 * normal flows.
 */
export async function pauseAccount(args: {
  accountId: string
  reason?: string | null
}): Promise<Result> {
  const ctx = await requireAdminContext()
  if ('error' in ctx) return { error: ctx.error }
  const { svc, actorId } = ctx

  const { error } = await svc
    .from('profiles')
    .update({
      account_status: 'paused',
      paused_at: new Date().toISOString(),
      paused_by: actorId,
      paused_reason: args.reason?.trim() || null,
    })
    .eq('id', args.accountId)
  if (error) return { error: error.message }

  // Best-effort in-app heads-up for the affected user so they see why
  // the app has gone read-only next time they load it.
  try {
    await svc.from('notifications').insert({
      user_id: args.accountId,
      type: 'account_paused',
      title: 'Your account is paused',
      body:
        args.reason?.trim() ||
        'An admin has paused your account. Contact support to resume.',
      priority: 'high',
      clearable: false,
    })
  } catch {
    // non-fatal — status flip already landed
  }

  revalidatePath('/admin/talent')
  revalidatePath('/admin/clients')
  revalidatePath(`/admin/talent/${args.accountId}`)
  revalidatePath(`/admin/clients/${args.accountId}`)
  return { ok: true }
}

/** Resume a paused account. Flips account_status back to 'active'. */
export async function resumeAccount(args: {
  accountId: string
}): Promise<Result> {
  const ctx = await requireAdminContext()
  if ('error' in ctx) return { error: ctx.error }
  const { svc } = ctx

  const { error } = await svc
    .from('profiles')
    .update({
      account_status: 'active',
      paused_at: null,
      paused_by: null,
      paused_reason: null,
    })
    .eq('id', args.accountId)
  if (error) return { error: error.message }

  try {
    await svc.from('notifications').insert({
      user_id: args.accountId,
      type: 'account_resumed',
      title: 'Your account is active again',
      body: 'An admin has resumed access. Welcome back.',
      priority: 'normal',
      clearable: true,
    })
  } catch {
    // non-fatal
  }

  revalidatePath('/admin/talent')
  revalidatePath('/admin/clients')
  revalidatePath(`/admin/talent/${args.accountId}`)
  revalidatePath(`/admin/clients/${args.accountId}`)
  return { ok: true }
}

/**
 * Hard-delete flow:
 *  1. Soft-delete profiles (account_status='deleted')
 *  2. Ban the auth user for 10 years (87600h) so they can't re-auth
 *  3. Insert into deleted_accounts for audit
 *  4. Append a row to the RS-Deleted-Accounts sheet (Drive audit trail)
 *
 * Steps 1–3 are transactional-ish — step 4 is best-effort. If the Drive
 * append fails we still return ok:true with a drive_synced flag so the
 * UI can surface the partial outcome.
 */
export async function deleteAccount(args: {
  accountId: string
  reason: string
}): Promise<Result & { driveSynced?: boolean }> {
  const ctx = await requireAdminContext()
  if ('error' in ctx) return { error: ctx.error }
  const { svc, actorId } = ctx

  const reason = args.reason?.trim()
  if (!reason) return { error: 'A reason is required to delete an account.' }

  // Load the profile first — we need email + role + name for the audit trail.
  const { data: target } = await svc
    .from('profiles')
    .select('id, email, full_name, first_name, last_name, role, account_status')
    .eq('id', args.accountId)
    .maybeSingle()
  if (!target) return { error: 'Account not found' }
  if (target.account_status === 'deleted') {
    return { error: 'Account already deleted' }
  }

  const displayName =
    [target.first_name, target.last_name].filter(Boolean).join(' ') ||
    target.full_name ||
    target.email

  // 1. Soft-delete on profiles.
  const { error: profErr } = await svc
    .from('profiles')
    .update({ account_status: 'deleted' })
    .eq('id', args.accountId)
  if (profErr) return { error: profErr.message }

  // 2. Ban the auth user for 10 years. The Supabase admin SDK accepts
  //    ban_duration as a Postgres interval string.
  try {
    await svc.auth.admin.updateUserById(args.accountId, {
      // @ts-expect-error — ban_duration is valid on the REST API but not
      // yet in the typed UserAttributes shape.
      ban_duration: '87600h',
    })
  } catch {
    // Non-fatal — the soft-delete on profiles is the primary gate. The
    // scheduled cleanup job can re-attempt the ban.
  }

  // 3. Audit row in deleted_accounts.
  const deletedAt = new Date().toISOString()
  const accountType =
    target.role === 'client' ? 'client' : target.role === 'admin' ? 'admin' : 'talent'
  const { error: auditErr } = await svc.from('deleted_accounts').insert({
    profile_id: target.id,
    email: target.email,
    account_type: accountType,
    full_name: displayName,
    deletion_reason: reason,
    deleted_by: actorId,
    deleted_at: deletedAt,
    metadata: {
      original_role: target.role,
    },
  })
  if (auditErr) return { error: auditErr.message }

  // 4. Drive audit sheet append — best-effort.
  let driveSynced = false
  const sheetId = process.env.GOOGLE_DELETED_ACCOUNTS_SHEET_ID
  if (sheetId) {
    driveSynced = await appendToSheet(sheetId, 'A:F', [
      deletedAt,
      target.email,
      displayName,
      accountType,
      reason,
      actorId,
    ])
  }

  revalidatePath('/admin/talent')
  revalidatePath('/admin/clients')
  revalidatePath(`/admin/talent/${args.accountId}`)
  revalidatePath(`/admin/clients/${args.accountId}`)
  return { ok: true, driveSynced }
}

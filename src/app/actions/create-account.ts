'use server'

import { createServiceClient } from '@/lib/supabase-service'

type CreateAccountArgs = {
  email: string
  password: string
  firstName: string
  lastName: string
  role: 'talent' | 'client' | 'admin'
  companyName?: string
}

type CreateAccountResult =
  | { ok: true; userId: string; isInvited: boolean }
  | {
      ok: false
      error: string
      code?: 'already_registered' | 'weak_password' | 'other'
    }

/**
 * Server-side account creation for SELF-SERVE signups from /login.
 *
 * Uses the admin API to create the user with email_confirm=true so the
 * client can sign in immediately with signInWithPassword — no email
 * confirmation race, no "account created but sign-in failed" error.
 *
 * Also runs the post-signup profile setup that used to live inline in
 * handleSignUp (role, verified flag, name fields, client_profiles
 * upsert, talent invite check). Returns isInvited so the caller can
 * route appropriately for talent.
 */
export async function createAccount(
  args: CreateAccountArgs
): Promise<CreateAccountResult> {
  const service = createServiceClient()

  const email = args.email.trim().toLowerCase()
  const password = args.password
  const first = args.firstName.trim()
  const last = args.lastName.trim()
  const fullName = `${first} ${last}`.trim()

  if (!email || !password || !first || !last) {
    return { ok: false, error: 'Missing required fields.', code: 'other' }
  }
  if (password.length < 8) {
    return {
      ok: false,
      error: 'Password must be at least 8 characters.',
      code: 'weak_password',
    }
  }

  const { data: created, error } = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      first_name: first,
      last_name: last,
      full_name: fullName,
      role: args.role,
      company_name: args.companyName ?? null,
    },
  })

  if (error) {
    const lower = error.message.toLowerCase()
    if (
      lower.includes('already') ||
      lower.includes('registered') ||
      lower.includes('exists')
    ) {
      return {
        ok: false,
        error: 'An account already exists with this email. Sign in instead.',
        code: 'already_registered',
      }
    }
    if (lower.includes('password should be at least')) {
      return {
        ok: false,
        error: 'Password must be at least 8 characters.',
        code: 'weak_password',
      }
    }
    return { ok: false, error: error.message, code: 'other' }
  }

  const userId = created?.user?.id
  if (!userId) {
    return {
      ok: false,
      error: 'Account created but no user id returned.',
      code: 'other',
    }
  }

  // Talent invite check: pre-approved talent are invited via an entry
  // in talent_invites; that pre-approval flips them to verified=true on
  // first signup. Uninvited talent stay unverified until admin approves
  // their separate application.
  let isInvited = false
  if (args.role === 'talent') {
    const { data: invite } = await service
      .from('talent_invites')
      .select('email')
      .eq('email', email)
      .maybeSingle()
    isInvited = Boolean(invite)
  }

  // Populate the profile row created by the handle_new_user trigger
  // (which only sets full_name from metadata). Clients are auto-verified;
  // talent verification follows the invite gate.
  await service
    .from('profiles')
    .update({
      first_name: first,
      last_name: last,
      full_name: fullName,
      role: args.role,
      verified: args.role === 'client' ? true : isInvited,
    })
    .eq('id', userId)

  // Clients need a client_profiles row with their company name.
  if (args.role === 'client' && args.companyName?.trim()) {
    await service
      .from('client_profiles')
      .upsert(
        { id: userId, company_name: args.companyName.trim() },
        { onConflict: 'id' }
      )
  }

  // Mark the invite as signed-up so admin can see the talent has come
  // through. Best-effort — ignored if the column / row doesn't exist.
  if (args.role === 'talent' && isInvited) {
    try {
      await service
        .from('talent_invites')
        .update({ signed_up_at: new Date().toISOString(), profile_id: userId })
        .eq('email', email)
    } catch {
      // non-fatal
    }
  }

  return { ok: true, userId, isInvited }
}

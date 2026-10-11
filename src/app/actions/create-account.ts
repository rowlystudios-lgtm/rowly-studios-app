'use server'

import { createServiceClient } from '@/lib/supabase-service'
import { lookupWelcomeInvite } from '@/lib/welcome-tokens'

type CreateAccountArgs = {
  email: string
  password: string
  firstName: string
  lastName: string
  role: 'talent' | 'client'
  companyName?: string
  /** Welcome-invite token from the invite email (?invite=…). Required for talent. */
  inviteToken?: string
}

type CreateAccountResult =
  | { ok: true; userId: string }
  | { ok: false; error: string; code?: 'weak_password' | 'other' }

export type { CreateAccountResult }

/**
 * Server-side account creation. Used by:
 *   - /login Create-account form when a welcome invite is in the URL
 *   - /login Create-account form for client self-serve signup
 *
 * Security model (Phase A hardening):
 *   - 'admin' can never be created or assigned through this action.
 *   - Talent accounts REQUIRE a valid, unconsumed welcome invite whose
 *     email matches — the website application + invite email is the gate.
 *   - When an invite is present, the role comes from the invite, never
 *     from the caller.
 *   - An existing account is only ever updated (password + metadata) when
 *     a valid invite for that exact email is presented AND the existing
 *     account is not an admin. This keeps the invite flow recoverable
 *     after a half-created signup without allowing account takeover.
 */
export async function createAccount(
  args: CreateAccountArgs
): Promise<CreateAccountResult> {
  const service = createServiceClient()

  const email = args.email.trim().toLowerCase()
  const password = args.password
  const first = args.firstName.trim()
  const last = args.lastName.trim()

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

  // Hard guard: this action can never mint or touch an admin, even if the
  // type signature is bypassed by a hand-crafted request.
  if ((args.role as string) === 'admin') {
    return { ok: false, error: 'This account type cannot be created here.', code: 'other' }
  }

  // Resolve the welcome invite, if one was presented.
  let invite: Awaited<ReturnType<typeof lookupWelcomeInvite>> | null = null
  if (args.inviteToken) {
    invite = await lookupWelcomeInvite(args.inviteToken)
    if (invite.state !== 'valid') {
      const why =
        invite.state === 'consumed'
          ? 'This invite has already been used. Sign in instead.'
          : invite.state === 'expired'
            ? 'This invite has expired. Contact Rowly Studios for a new one.'
            : 'This invite link is not valid.'
      return { ok: false, error: why, code: 'other' }
    }
    if (invite.email.trim().toLowerCase() !== email) {
      return {
        ok: false,
        error: 'This invite was issued for a different email address.',
        code: 'other',
      }
    }
  }

  // The role is the invite's role when an invite is present. Talent can
  // only ever arrive through an invite.
  const role: 'talent' | 'client' =
    invite && invite.state === 'valid' ? invite.type : args.role

  if (role === 'talent' && !(invite && invite.state === 'valid')) {
    return {
      ok: false,
      error:
        'Talent accounts are created from your invite email. Apply on the Rowly Studios website to get one.',
      code: 'other',
    }
  }

  const metadata = {
    first_name: first,
    last_name: last,
    full_name: `${first} ${last}`,
    role,
    company_name: args.companyName ?? null,
  }

  const { data: createData, error: createErr } =
    await service.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: metadata,
    })

  if (createErr) {
    const msg = createErr.message.toLowerCase()
    const alreadyRegistered =
      msg.includes('already') ||
      msg.includes('registered') ||
      msg.includes('exists')

    if (!alreadyRegistered) {
      if (msg.includes('password should be at least')) {
        return {
          ok: false,
          error: 'Password must be at least 8 characters.',
          code: 'weak_password',
        }
      }
      return { ok: false, error: createErr.message, code: 'other' }
    }

    // User exists. Recovery (password + metadata overwrite) is allowed
    // ONLY with a valid invite for this exact email, and never against an
    // admin account. Without an invite this is a plain duplicate signup.
    if (!(invite && invite.state === 'valid')) {
      return {
        ok: false,
        error:
          'An account with this email already exists. Sign in instead, or use "Forgot password".',
        code: 'other',
      }
    }

    const { data: prof } = await service
      .from('profiles')
      .select('id, role')
      .eq('email', email)
      .maybeSingle()

    const existingId = prof?.id
    if (!existingId) {
      return {
        ok: false,
        error: 'Account exists but could not be located. Contact support.',
        code: 'other',
      }
    }
    if (prof?.role === 'admin') {
      return {
        ok: false,
        error: 'An account with this email already exists. Sign in instead.',
        code: 'other',
      }
    }

    const { error: updateErr } = await service.auth.admin.updateUserById(
      existingId,
      { password, user_metadata: metadata, email_confirm: true }
    )
    if (updateErr) {
      return { ok: false, error: updateErr.message, code: 'other' }
    }

    return { ok: true, userId: existingId }
  }

  const newId = createData?.user?.id
  if (!newId) {
    return { ok: false, error: 'Could not retrieve new user id.', code: 'other' }
  }
  return { ok: true, userId: newId }
}

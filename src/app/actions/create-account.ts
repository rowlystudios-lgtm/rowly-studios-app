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
  | { ok: true; userId: string }
  | { ok: false; error: string; code?: 'weak_password' | 'other' }

export type { CreateAccountResult }

/**
 * Server-side account creation. Used by:
 *   - /login Create-account form (self-serve signup)
 *   - /login Create-account form when a welcome invite is in the URL
 *
 * If the user already exists (pre-existing partial account from earlier
 * broken flows, or a re-application), we OVERWRITE the password +
 * metadata via auth.admin.updateUserById rather than failing — this
 * makes the welcome-invite flow recoverable.
 *
 * Profile/client_profiles/invite-acknowledgement work no longer happens
 * here. The handle_new_user trigger seeds full_name from metadata; any
 * additional row setup is the caller's responsibility (or relies on a
 * richer DB trigger that reads role/first_name/etc from metadata).
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

  const metadata = {
    first_name: first,
    last_name: last,
    full_name: `${first} ${last}`,
    role: args.role,
    company_name: args.companyName ?? null,
  }

  // Try to create the user. If they already exist, update their
  // password instead so welcome invites are robust to retries.
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

    // User exists — look them up and overwrite password + metadata.
    const { data: prof } = await service
      .from('profiles')
      .select('id')
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

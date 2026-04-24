import crypto from 'crypto'
import { createServiceClient } from '@/lib/supabase-service'

const TOKEN_TTL_DAYS = 30

export type WelcomeTokenLookup =
  | {
      state: 'valid'
      token: string
      userId: string
      email: string
      firstName: string | null
      expiresAt: Date
    }
  | { state: 'consumed'; email: string }
  | { state: 'expired' }
  | { state: 'not_found' }

export async function createWelcomeToken(params: {
  userId: string
  email: string
  applicationId?: string | null
}): Promise<{ token: string; expiresAt: Date }> {
  const service = createServiceClient()
  const token = crypto.randomBytes(32).toString('base64url')
  const expiresAt = new Date(Date.now() + TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000)

  const { error } = await service.from('welcome_tokens').insert({
    user_id: params.userId,
    email: params.email,
    token,
    application_id: params.applicationId ?? null,
    expires_at: expiresAt.toISOString(),
  })
  if (error) throw new Error(`createWelcomeToken: ${error.message}`)

  return { token, expiresAt }
}

export async function lookupWelcomeToken(
  token: string
): Promise<WelcomeTokenLookup> {
  if (!token || typeof token !== 'string') return { state: 'not_found' }
  const service = createServiceClient()

  const { data, error } = await service
    .from('welcome_tokens')
    .select('id, user_id, email, expires_at, consumed_at')
    .eq('token', token)
    .maybeSingle()

  if (error || !data) return { state: 'not_found' }
  if (data.consumed_at) return { state: 'consumed', email: data.email }
  if (new Date(data.expires_at) < new Date()) return { state: 'expired' }

  // Pull first_name from user metadata for friendly greeting.
  const { data: userRes } = await service.auth.admin.getUserById(data.user_id)
  const meta = userRes?.user?.user_metadata as Record<string, unknown> | null
  const firstName =
    (meta?.first_name as string | undefined) ??
    (meta?.firstName as string | undefined) ??
    null

  return {
    state: 'valid',
    token,
    userId: data.user_id,
    email: data.email,
    firstName,
    expiresAt: new Date(data.expires_at),
  }
}

/**
 * Consumes the token AND sets the user's password in one atomic-ish flow.
 * If the DB update races with a second consumer, the second one gets
 * "already consumed" back.
 */
export async function consumeWelcomeToken(params: {
  token: string
  password: string
}): Promise<
  | { ok: true; email: string }
  | {
      ok: false
      error: string
      code: 'not_found' | 'expired' | 'consumed' | 'weak_password' | 'other'
    }
> {
  if (!params.password || params.password.length < 8) {
    return {
      ok: false,
      error: 'Password must be at least 8 characters.',
      code: 'weak_password',
    }
  }

  const service = createServiceClient()

  // Mark consumed_at with a conditional update so only ONE caller wins.
  // Returns the row if and only if it was not previously consumed and
  // not expired.
  const { data: claimed, error: claimErr } = await service
    .from('welcome_tokens')
    .update({ consumed_at: new Date().toISOString() })
    .eq('token', params.token)
    .is('consumed_at', null)
    .gt('expires_at', new Date().toISOString())
    .select('user_id, email')
    .maybeSingle()

  if (claimErr) return { ok: false, error: claimErr.message, code: 'other' }
  if (!claimed) {
    // Figure out the specific failure for a helpful message.
    const status = await lookupWelcomeToken(params.token)
    if (status.state === 'consumed')
      return {
        ok: false,
        error: 'This link has already been used.',
        code: 'consumed',
      }
    if (status.state === 'expired')
      return { ok: false, error: 'This link has expired.', code: 'expired' }
    return { ok: false, error: 'Invalid link.', code: 'not_found' }
  }

  const { error: pwErr } = await service.auth.admin.updateUserById(
    claimed.user_id,
    { password: params.password }
  )
  if (pwErr) {
    // Rollback the consumption so the user can retry.
    await service
      .from('welcome_tokens')
      .update({ consumed_at: null })
      .eq('token', params.token)
    const isPasswordIssue = pwErr.message.toLowerCase().includes('password')
    return {
      ok: false,
      error: isPasswordIssue
        ? 'Password must be at least 8 characters.'
        : pwErr.message,
      code: isPasswordIssue ? 'weak_password' : 'other',
    }
  }

  return { ok: true, email: claimed.email }
}

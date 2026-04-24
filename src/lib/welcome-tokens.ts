import crypto from 'crypto'
import { createServiceClient } from '@/lib/supabase-service'

const TOKEN_TTL_DAYS = 30

export type WelcomeInviteLookup =
  | {
      state: 'valid'
      token: string
      email: string
      firstName: string
      lastName: string
      type: 'talent' | 'client'
      companyName: string | null
      expiresAt: Date
    }
  | { state: 'consumed'; email: string }
  | { state: 'expired' }
  | { state: 'not_found' }

export async function createWelcomeInvite(params: {
  applicationId: string
  email: string
}): Promise<{ token: string; expiresAt: Date }> {
  const service = createServiceClient()
  const token = crypto.randomBytes(32).toString('base64url')
  const expiresAt = new Date(Date.now() + TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000)

  const { error } = await service.from('welcome_tokens').insert({
    application_id: params.applicationId,
    email: params.email,
    token,
    expires_at: expiresAt.toISOString(),
  })
  if (error) throw new Error(`createWelcomeInvite: ${error.message}`)

  return { token, expiresAt }
}

export async function lookupWelcomeInvite(
  token: string
): Promise<WelcomeInviteLookup> {
  if (!token || typeof token !== 'string') return { state: 'not_found' }
  const service = createServiceClient()

  const { data, error } = await service
    .from('welcome_tokens')
    .select('id, email, application_id, expires_at, consumed_at')
    .eq('token', token)
    .maybeSingle()

  if (error || !data) return { state: 'not_found' }
  if (data.consumed_at) return { state: 'consumed', email: data.email }
  if (new Date(data.expires_at) < new Date()) return { state: 'expired' }

  // Resolve the application to pull first/last/type/company.
  const { data: app } = await service
    .from('talent_applications')
    .select('first_name, last_name, type, company_name')
    .eq('id', data.application_id)
    .maybeSingle()

  if (!app) return { state: 'not_found' }

  return {
    state: 'valid',
    token,
    email: data.email,
    firstName: (app.first_name ?? '').trim(),
    lastName: (app.last_name ?? '').trim(),
    type: app.type === 'client' ? 'client' : 'talent',
    companyName: app.company_name ?? null,
    expiresAt: new Date(data.expires_at),
  }
}

/**
 * Claim the token atomically (only one caller wins) and link it to the
 * newly-created auth user. Must be called AFTER createAccount has
 * successfully created or updated the auth user.
 */
export async function consumeWelcomeInvite(params: {
  token: string
  userId: string
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const service = createServiceClient()

  const { data: claimed, error } = await service
    .from('welcome_tokens')
    .update({
      consumed_at: new Date().toISOString(),
      user_id: params.userId,
    })
    .eq('token', params.token)
    .is('consumed_at', null)
    .gt('expires_at', new Date().toISOString())
    .select('id')
    .maybeSingle()

  if (error) return { ok: false, error: error.message }
  if (!claimed) return { ok: false, error: 'Invite already used or expired' }
  return { ok: true }
}

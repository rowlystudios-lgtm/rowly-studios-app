import type { SupabaseClient } from '@supabase/supabase-js';
import { refreshAccessToken } from './oauth';

/**
 * Token store — wraps gmail_oauth_tokens table for read/write/refresh.
 *
 * Every function here MUST be called with a service-role Supabase client.
 * Authenticated client cannot read tokens (RLS lockdown).
 */

export type StoredTokens = {
  user_id: string;
  google_email: string;
  google_sub: string | null;
  refresh_token: string;
  access_token: string;
  token_type: string;
  scope: string;
  expires_at: string; // ISO timestamp
  connected_at: string;
  last_refreshed_at: string | null;
  last_used_at: string | null;
};

export async function loadTokens(
  supabase: SupabaseClient,
  userId: string,
): Promise<StoredTokens | null> {
  const { data, error } = await supabase
    .from('gmail_oauth_tokens')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw new Error(`loadTokens failed: ${error.message}`);
  return (data ?? null) as StoredTokens | null;
}

export async function saveTokens(
  supabase: SupabaseClient,
  params: {
    userId: string;
    googleEmail: string;
    googleSub: string | null;
    refreshToken: string;
    accessToken: string;
    expiresIn: number; // seconds from now
    scope: string;
    tokenType: string;
  },
): Promise<void> {
  const expiresAt = new Date(Date.now() + params.expiresIn * 1000).toISOString();

  const { error } = await supabase
    .from('gmail_oauth_tokens')
    .upsert(
      {
        user_id: params.userId,
        google_email: params.googleEmail,
        google_sub: params.googleSub,
        refresh_token: params.refreshToken,
        access_token: params.accessToken,
        token_type: params.tokenType,
        scope: params.scope,
        expires_at: expiresAt,
        connected_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' },
    );

  if (error) throw new Error(`saveTokens failed: ${error.message}`);
}

/**
 * Get a valid access token for the given admin. If the cached token is
 * expired or about to expire (60s buffer), refresh it first.
 */
export async function getValidAccessToken(
  supabase: SupabaseClient,
  userId: string,
): Promise<{ accessToken: string; googleEmail: string }> {
  const tokens = await loadTokens(supabase, userId);
  if (!tokens) {
    throw new Error('No Gmail tokens for this user. Connect Gmail first.');
  }

  const expiresAt = new Date(tokens.expires_at).getTime();
  const now = Date.now();
  const bufferMs = 60_000; // refresh if <60s of validity left

  if (expiresAt - now > bufferMs) {
    // Still valid
    await markUsed(supabase, userId);
    return { accessToken: tokens.access_token, googleEmail: tokens.google_email };
  }

  // Refresh
  const refreshed = await refreshAccessToken(tokens.refresh_token);
  const newExpiresAt = new Date(Date.now() + refreshed.expires_in * 1000).toISOString();

  const { error } = await supabase
    .from('gmail_oauth_tokens')
    .update({
      access_token: refreshed.access_token,
      expires_at: newExpiresAt,
      last_refreshed_at: new Date().toISOString(),
      last_used_at: new Date().toISOString(),
    })
    .eq('user_id', userId);

  if (error) throw new Error(`Token refresh save failed: ${error.message}`);

  return { accessToken: refreshed.access_token, googleEmail: tokens.google_email };
}

async function markUsed(supabase: SupabaseClient, userId: string): Promise<void> {
  await supabase
    .from('gmail_oauth_tokens')
    .update({ last_used_at: new Date().toISOString() })
    .eq('user_id', userId);
}

export async function deleteTokens(
  supabase: SupabaseClient,
  userId: string,
): Promise<void> {
  const { error } = await supabase
    .from('gmail_oauth_tokens')
    .delete()
    .eq('user_id', userId);
  if (error) throw new Error(`deleteTokens failed: ${error.message}`);
}

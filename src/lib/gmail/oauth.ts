/**
 * Gmail OAuth library — config, token exchange, refresh.
 *
 * This module is service-role only. Never imported into client components.
 *
 * Token lifecycle:
 *   1. Admin clicks "Connect Gmail" → browser redirected to Google consent
 *   2. Google redirects back to /api/auth/google/callback with ?code=...
 *   3. We exchange code for { access_token, refresh_token, expires_in }
 *   4. Tokens are persisted in public.gmail_oauth_tokens (one row per admin)
 *   5. On every Gmail API call, we check if access_token is expired; if so,
 *      we refresh using the long-lived refresh_token
 */

const GOOGLE_OAUTH_BASE = 'https://oauth2.googleapis.com';
const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';

// Scope needed to create draft emails on the user's behalf
export const GMAIL_COMPOSE_SCOPE = 'https://www.googleapis.com/auth/gmail.compose';

// Also request userinfo so we can record which Google account they connected
export const ALL_SCOPES = [
  GMAIL_COMPOSE_SCOPE,
  'https://www.googleapis.com/auth/userinfo.email',
  'openid',
].join(' ');

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

export function getGoogleClientId(): string {
  return requireEnv('GOOGLE_CLIENT_ID');
}

export function getGoogleClientSecret(): string {
  return requireEnv('GOOGLE_CLIENT_SECRET');
}

export function getRedirectUri(baseUrl: string): string {
  return `${baseUrl}/api/auth/google/callback`;
}

/**
 * Build the consent screen URL the admin's browser is redirected to.
 *
 * Important params:
 *   access_type=offline → required to get a refresh_token
 *   prompt=consent → forces the consent screen even if previously approved,
 *     so we always get a fresh refresh_token. Without this, returning users
 *     get a response with NO refresh_token (Google assumes you already have
 *     it from the first consent).
 */
export function buildAuthorizationUrl(params: {
  baseUrl: string;
  state: string;
}): string {
  const url = new URL(GOOGLE_AUTH_URL);
  url.searchParams.set('client_id', getGoogleClientId());
  url.searchParams.set('redirect_uri', getRedirectUri(params.baseUrl));
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', ALL_SCOPES);
  url.searchParams.set('access_type', 'offline');
  url.searchParams.set('prompt', 'consent');
  url.searchParams.set('state', params.state);
  return url.toString();
}

/**
 * Exchange the authorization code (received in the callback) for tokens.
 *
 * Returns:
 *   access_token    — short-lived (1h), used in Authorization headers
 *   refresh_token   — long-lived, used to mint new access tokens
 *   expires_in      — seconds until access_token expires
 *   id_token        — JWT containing user identity (email, sub)
 */
export async function exchangeCodeForTokens(params: {
  code: string;
  baseUrl: string;
}): Promise<{
  access_token: string;
  refresh_token: string;
  expires_in: number;
  scope: string;
  token_type: string;
  id_token?: string;
}> {
  const body = new URLSearchParams({
    code: params.code,
    client_id: getGoogleClientId(),
    client_secret: getGoogleClientSecret(),
    redirect_uri: getRedirectUri(params.baseUrl),
    grant_type: 'authorization_code',
  });

  const res = await fetch(`${GOOGLE_OAUTH_BASE}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Google token exchange failed: ${res.status} ${text}`);
  }

  return await res.json();
}

/**
 * Refresh the access token using the stored refresh_token. Called when a
 * Gmail API call would otherwise fail with 401.
 *
 * NOTE: refresh_token is NOT returned in this response — it stays the same
 * for the lifetime of the connection (until the admin disconnects or
 * Google invalidates it).
 */
export async function refreshAccessToken(refreshToken: string): Promise<{
  access_token: string;
  expires_in: number;
  scope: string;
  token_type: string;
}> {
  const body = new URLSearchParams({
    refresh_token: refreshToken,
    client_id: getGoogleClientId(),
    client_secret: getGoogleClientSecret(),
    grant_type: 'refresh_token',
  });

  const res = await fetch(`${GOOGLE_OAUTH_BASE}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Google token refresh failed: ${res.status} ${text}`);
  }

  return await res.json();
}

/**
 * Decode a Google id_token (JWT) without verifying the signature. We only
 * need the email + sub claim, and we trust the source (just came from
 * Google's token endpoint over TLS). Skipping signature verification keeps
 * the dependency footprint minimal.
 */
export function decodeIdToken(idToken: string): { email?: string; sub?: string } {
  try {
    const parts = idToken.split('.');
    if (parts.length !== 3) return {};
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf-8'));
    return { email: payload.email, sub: payload.sub };
  } catch {
    return {};
  }
}

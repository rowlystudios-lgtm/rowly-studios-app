import { NextRequest, NextResponse } from 'next/server';
import { headers, cookies } from 'next/headers';
import { getServiceSupabase } from '@/lib/stripe/auth';
import { exchangeCodeForTokens, decodeIdToken } from '@/lib/gmail/oauth';
import { saveTokens } from '@/lib/gmail/tokens';

/**
 * GET /api/auth/google/callback
 *
 * Public route (Google redirects here). Validates CSRF state from cookie,
 * exchanges the auth code for tokens, persists them under the admin user
 * who initiated the flow.
 *
 * Errors redirect to /admin/profile?gmail_error=<message>.
 * Success redirects to /admin/profile?gmail_connected=1.
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const errorParam = url.searchParams.get('error');

  // Build the redirect base from request headers
  const h = headers();
  const proto = h.get('x-forwarded-proto') ?? 'https';
  const host = h.get('host');
  const baseUrl = `${proto}://${host}`;
  const profileUrl = `${baseUrl}/admin/settings`;

  // Pull cookies set by /start
  const cookieStore = await cookies();
  const expectedState = cookieStore.get('google_oauth_state')?.value;
  const userId = cookieStore.get('google_oauth_user')?.value;

  // Always clear the OAuth cookies regardless of outcome
  const clearCookies = (res: NextResponse) => {
    res.cookies.delete('google_oauth_state');
    res.cookies.delete('google_oauth_user');
    return res;
  };

  if (errorParam) {
    return clearCookies(
      NextResponse.redirect(`${profileUrl}?gmail_error=${encodeURIComponent(errorParam)}`),
    );
  }

  if (!code || !state) {
    return clearCookies(
      NextResponse.redirect(`${profileUrl}?gmail_error=missing_code_or_state`),
    );
  }

  if (!expectedState || state !== expectedState) {
    return clearCookies(
      NextResponse.redirect(`${profileUrl}?gmail_error=state_mismatch`),
    );
  }

  if (!userId) {
    return clearCookies(
      NextResponse.redirect(`${profileUrl}?gmail_error=no_user_in_cookie`),
    );
  }

  try {
    const tokens = await exchangeCodeForTokens({ code, baseUrl });
    const idClaims = tokens.id_token ? decodeIdToken(tokens.id_token) : {};

    if (!tokens.refresh_token) {
      // This happens when the user has previously consented and prompt=consent
      // wasn't honored. Our auth URL forces prompt=consent, so this should be
      // rare — but if it happens, surface a helpful error.
      return clearCookies(
        NextResponse.redirect(
          `${profileUrl}?gmail_error=${encodeURIComponent('Google did not return a refresh_token. Try revoking access at https://myaccount.google.com/permissions and reconnecting.')}`,
        ),
      );
    }

    const supabase = getServiceSupabase();
    await saveTokens(supabase, {
      userId,
      googleEmail: idClaims.email ?? '(unknown)',
      googleSub: idClaims.sub ?? null,
      refreshToken: tokens.refresh_token,
      accessToken: tokens.access_token,
      expiresIn: tokens.expires_in,
      scope: tokens.scope,
      tokenType: tokens.token_type,
    });

    return clearCookies(NextResponse.redirect(`${profileUrl}?gmail_connected=1`));
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return clearCookies(
      NextResponse.redirect(`${profileUrl}?gmail_error=${encodeURIComponent(msg)}`),
    );
  }
}

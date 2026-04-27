import { NextRequest, NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { requireAuth } from '@/lib/stripe/auth';
import { buildAuthorizationUrl } from '@/lib/gmail/oauth';
import { randomBytes } from 'crypto';

/**
 * GET /api/auth/google/start
 *
 * Admin-only. Generates a CSRF state token, stashes it in an HTTP-only
 * cookie, then redirects the admin to Google's consent screen.
 *
 * On success, Google will redirect back to /api/auth/google/callback.
 */
export async function GET(_req: NextRequest) {
  try {
    const { profile } = await requireAuth(['admin']);

    const h = headers();
    const proto = h.get('x-forwarded-proto') ?? 'https';
    const host = h.get('host');
    if (!host) throw new Error('Missing host header');
    const baseUrl = `${proto}://${host}`;

    // CSRF protection — random state, stored in cookie, verified on callback
    const state = randomBytes(32).toString('hex');

    const authUrl = buildAuthorizationUrl({ baseUrl, state });

    const res = NextResponse.redirect(authUrl);
    res.cookies.set('google_oauth_state', state, {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      maxAge: 600, // 10 minutes
      path: '/',
    });
    res.cookies.set('google_oauth_user', profile.id, {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      maxAge: 600,
      path: '/',
    });

    return res;
  } catch (e) {
    if (e instanceof NextResponse) return e;
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

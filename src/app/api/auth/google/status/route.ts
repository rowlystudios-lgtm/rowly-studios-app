import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/stripe/auth';
import { loadTokens, deleteTokens } from '@/lib/gmail/tokens';
import { getServiceSupabase } from '@/lib/stripe/auth';

/**
 * GET /api/auth/google/status
 *
 * Admin-only. Returns whether Gmail is connected for the current admin
 * user, and if so, which Google account.
 *
 * Response: { ok: true, connected: boolean, googleEmail?: string, lastUsedAt?: string }
 */
export async function GET(_req: NextRequest) {
  try {
    const { profile } = await requireAuth(['admin']);
    const supabase = getServiceSupabase();
    const tokens = await loadTokens(supabase, profile.id);

    if (!tokens) {
      return NextResponse.json({ ok: true, connected: false });
    }

    return NextResponse.json({
      ok: true,
      connected: true,
      googleEmail: tokens.google_email,
      connectedAt: tokens.connected_at,
      lastUsedAt: tokens.last_used_at,
    });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

/**
 * DELETE /api/auth/google/status
 *
 * Admin-only. Disconnects Gmail by deleting the stored tokens. The admin
 * can re-connect by clicking "Connect Gmail" again.
 *
 * NOTE: this does NOT revoke the token at Google's end. To fully revoke
 * the app's access, the admin must visit https://myaccount.google.com/permissions.
 */
export async function DELETE(_req: NextRequest) {
  try {
    const { profile } = await requireAuth(['admin']);
    const supabase = getServiceSupabase();
    await deleteTokens(supabase, profile.id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

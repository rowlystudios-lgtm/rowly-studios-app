/**
 * Tiny auth helper for the Stripe API routes.
 *
 * IMPORTANT — adapt to your existing pattern:
 * Your RS APP already has a server-side Supabase client somewhere (likely
 * `lib/supabase/server.ts` using `@supabase/ssr` + cookies()). Replace the
 * import below with whatever you currently use elsewhere in the app.
 *
 * The helper returns:
 *   { profile, supabase }       — authenticated user + their Supabase client
 *   throws Response (401/403)   — bounce if not signed in or wrong role
 */

import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import type { SupabaseClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

export type AuthedProfile = {
  id: string;
  email: string;
  full_name: string | null;
  role: 'talent' | 'client' | 'admin';
};

export async function requireAuth(
  allowedRoles?: Array<'talent' | 'client' | 'admin'>,
): Promise<{ profile: AuthedProfile; supabase: SupabaseClient }> {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll(cookiesToSet: { name: string; value: string; options?: CookieOptions }[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch { /* noop in route handler */ }
        },
      },
    },
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    throw NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  }

  const { data: profile, error } = await supabase
    .from('profiles')
    .select('id, email, full_name, role')
    .eq('id', user.id)
    .single();

  if (error || !profile) {
    throw NextResponse.json({ error: 'Profile not found' }, { status: 404 });
  }

  if (allowedRoles && !allowedRoles.includes(profile.role)) {
    throw NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  return { profile: profile as AuthedProfile, supabase };
}

/**
 * Service-role Supabase client for operations that need to bypass RLS
 * (e.g. cross-user reads in webhooks). Never expose this to the browser.
 */
export function getServiceSupabase(): SupabaseClient {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { createClient } = require('@supabase/supabase-js');
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

import { createClient } from '@supabase/supabase-js'

/**
 * Server-only Supabase client using the service-role key. Bypasses RLS.
 * NEVER import from a client component. Used by API routes (iCal feed,
 * search, calendar public URLs) and server actions that need to read
 * beyond the caller's RLS scope.
 */
export function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error(
      'Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY'
    )
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

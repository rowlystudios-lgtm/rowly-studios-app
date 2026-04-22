import { createBrowserClient } from '@supabase/ssr'

/**
 * Browser-side Supabase client.
 *
 * Intentionally uses the default options. `createBrowserClient` from
 * @supabase/ssr writes the session to cookies (not localStorage) under
 * the default key `sb-<project-ref>-auth-token`, which is also what the
 * server client in `src/middleware.ts` and `src/lib/supabase-server.ts`
 * reads by default. Overriding `auth.storageKey` here decouples the two
 * — the browser writes `rs-app-auth-*` cookies, the server looks for
 * `sb-…` cookies, the session looks missing to middleware, and every
 * /admin request gets bounced back to /login.
 *
 * Under the hood `createBrowserClient` is a singleton per module — all
 * calls return the same instance on the client side.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

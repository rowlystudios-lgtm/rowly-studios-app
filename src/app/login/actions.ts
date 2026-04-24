'use server'

import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'

/**
 * Server Action for the admin sign-in form.
 *
 * Why a Server Action rather than a browser-side signInWithPassword:
 * the browser client writes auth cookies via document.cookie
 * asynchronously. A subsequent window.location.assign('/admin') can
 * race that write — the request arrives at the middleware with no
 * session cookie, the middleware sees !user, and bounces the user back
 * to /login.
 *
 * Here, createServerClient writes the session cookies into the Next.js
 * response synchronously (via the setAll hook on cookieStore). The
 * redirect() call Next returns to the browser carries those cookies in
 * its Set-Cookie headers, so the follow-up GET /admin always includes
 * a valid session.
 */
export async function adminSignIn(email: string, password: string) {
  const cookieStore = cookies()

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(
          cookiesToSet: {
            name: string
            value: string
            options?: CookieOptions
          }[]
        ) {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options)
          })
        },
      },
    }
  )

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  })

  if (error || !data.user) {
    return { error: 'Incorrect email or password' }
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', data.user.id)
    .maybeSingle()

  if (!profile || profile.role !== 'admin') {
    await supabase.auth.signOut()
    return { error: "This account doesn't have admin access." }
  }

  redirect('/admin')
}

/* ─── Welcome-invite helpers ─── */

import {
  lookupWelcomeInvite,
  consumeWelcomeInvite,
} from '@/lib/welcome-tokens'

export async function lookupInviteAction(token: string) {
  return lookupWelcomeInvite(token)
}

export async function consumeInviteAction(params: {
  token: string
  userId: string
}) {
  return consumeWelcomeInvite(params)
}

import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

/**
 * Auth + role-based routing:
 *  - Unauthenticated requests are left alone (individual routes handle their own gating).
 *  - Authenticated admins inside /app get redirected to /admin (and vice-versa
 *    non-admins inside /admin get redirected to /app).
 *
 * Role is read from the profiles table. Missing profile or errors are treated
 * as non-admin to fail safe.
 */
export async function middleware(request: NextRequest) {
  // Auth route handlers (/auth/callback, /auth/signout, …) must run
  // without middleware touching cookies or calling getUser. The callback
  // consumes a single-use recovery/invite code via exchangeCodeForSession;
  // if the middleware touches the session first the response cookies
  // can race the handler's Set-Cookie headers and the user ends up on
  // /login?message=Reset+link+expired…
  if (request.nextUrl.pathname.startsWith('/auth/')) {
    return NextResponse.next()
  }

  let response = NextResponse.next({
    request: { headers: request.headers },
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet: { name: string; value: string; options?: CookieOptions }[]) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request: { headers: request.headers } })
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { pathname } = request.nextUrl
  const isAdminRoute = pathname === '/admin' || pathname.startsWith('/admin/')
  const isAppRoute = pathname === '/app' || pathname.startsWith('/app/')

  if (isAdminRoute && !user) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    url.search = ''
    return NextResponse.redirect(url)
  }

  if (user && (isAdminRoute || isAppRoute)) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .maybeSingle()

    const role = profile?.role ?? null

    if (isAdminRoute && role !== 'admin') {
      return NextResponse.redirect(new URL('/', request.url))
    }

    if (isAppRoute && role === 'admin') {
      const url = request.nextUrl.clone()
      url.pathname = '/admin'
      url.search = ''
      return NextResponse.redirect(url)
    }
  }

  return response
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|icon-.*\\.png|manifest.json|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}

import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')
  const type = requestUrl.searchParams.get('type')
  const origin = requestUrl.origin

  if (!code) {
    return NextResponse.redirect(
      `${origin}/login?message=Reset+link+expired.+Please+try+again.`
    )
  }

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

  const { error } = await supabase.auth.exchangeCodeForSession(code)

  if (error) {
    console.error('Auth callback error:', error.message)
    return NextResponse.redirect(
      `${origin}/login?message=Reset+link+expired.+Please+request+a+new+one.`
    )
  }

  // Recovery = password reset; invite = new user setting first password.
  if (type === 'recovery' || type === 'invite') {
    return NextResponse.redirect(`${origin}/login?mode=reset`)
  }

  // Magic link or OAuth — straight to app.
  return NextResponse.redirect(`${origin}/app`)
}

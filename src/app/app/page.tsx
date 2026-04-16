import { createClient } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import { RSLogo } from '@/components/RSLogo'

export default async function AppHome() {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  return (
    <main className="min-h-[100dvh] rs-bg-fusion">
      <header className="flex items-center justify-between px-5 py-4">
        <div className="flex items-center gap-2">
          <RSLogo size={28} />
          <span className="text-[11px] font-semibold tracking-[1.5px] text-rs-cream uppercase">
            Rowly Studios
          </span>
        </div>
        <form action="/auth/signout" method="post">
          <button
            type="submit"
            className="text-[10px] uppercase tracking-wider text-rs-cream/60"
          >
            Sign out
          </button>
        </form>
      </header>

      <div className="rs-surface min-h-[calc(100dvh-64px)] rounded-t-rs-lg px-5 py-8">
        <div className="max-w-md mx-auto">
          <p className="text-[11px] uppercase tracking-wider text-rs-blue-fusion font-semibold">
            Signed in as
          </p>
          <p className="text-[15px] font-semibold text-rs-blue-logo mt-1">
            {user.email}
          </p>

          <div className="mt-8 rs-card p-5 space-y-2">
            <p className="text-sm font-semibold text-rs-blue-logo">
              Welcome to the beta
            </p>
            <p className="text-[13px] text-rs-blue-fusion leading-relaxed">
              Your account is active. More features are rolling out over the coming
              weeks — calendar, jobs, and team roster land next.
            </p>
          </div>

          <p className="text-[10px] tracking-widest uppercase text-rs-blue-fusion/40 text-center mt-12">
            v0.1 · Week 1 · Day 1
          </p>
        </div>
      </div>
    </main>
  )
}

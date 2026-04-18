import Link from 'next/link'
import { redirect } from 'next/navigation'
import { RSLogo } from '@/components/RSLogo'
import { InstallBanner } from '@/components/InstallBanner'
import { createClient } from '@/lib/supabase-server'

export default async function Home() {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (user) {
    redirect('/app')
  }

  return (
    <>
      <InstallBanner />
      <main className="min-h-[100dvh] flex flex-col items-center justify-center px-6 py-12 rs-bg-fusion">
      <div className="flex flex-col items-center gap-5 mb-10">
        <RSLogo size={88} />
        <div className="text-center">
          <h1 className="text-xl font-semibold tracking-wide text-rs-cream uppercase">
            Rowly Studios
          </h1>
          <p className="text-xs tracking-[2px] text-rs-cream/60 uppercase mt-1">
            Talent · Clients · Productions
          </p>
        </div>
      </div>

      <div className="w-full max-w-sm rs-surface rounded-rs-lg p-6 space-y-3">
        <p className="text-xs uppercase tracking-wider text-rs-blue-fusion font-semibold text-center mb-2">
          Beta access
        </p>
        <Link
          href="/login"
          className="rs-btn w-full text-center block"
        >
          Sign in
        </Link>
        <p className="text-[11px] text-rs-blue-fusion/70 text-center leading-relaxed pt-2">
          Invitation-only during beta. If you&apos;re verified talent or a Rowly Studios client,
          check your email for your invite link.
        </p>
      </div>

      <p className="text-[10px] tracking-widest uppercase text-rs-cream/40 mt-10">
        v0.1 · Beta · {new Date().getFullYear()}
      </p>
      </main>
    </>
  )
}

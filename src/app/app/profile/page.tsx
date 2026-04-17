import { createClient } from '@/lib/supabase-server'
import Link from 'next/link'
import { DEPARTMENT_LABELS, type Department } from '@/lib/types'

function formatRate(cents: number | null) {
  if (!cents) return '—'
  return `$${(cents / 100).toLocaleString()}`
}

function initials(name: string | null) {
  if (!name) return '?'
  return name
    .split(' ')
    .map((n) => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()
}

export default async function ProfilePage() {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user!.id)
    .maybeSingle()

  const { data: talent } = await supabase
    .from('talent_profiles')
    .select('*')
    .eq('id', user!.id)
    .maybeSingle()

  return (
    <main className="px-5 py-6 max-w-md mx-auto">
      <div className="flex items-center gap-4 mb-5">
        <div
          className="w-20 h-20 rounded-full bg-[#E8EAED] flex items-center justify-center text-xl font-bold text-rs-blue-logo"
          style={{ boxShadow: '0 0 0 2px #1E3A6B, 0 0 0 4px #FBF5E4' }}
        >
          {initials(profile?.full_name ?? profile?.email ?? null)}
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-[22px] font-semibold text-rs-blue-logo leading-tight">
            {profile?.full_name || 'Your name'}
          </h1>
          <p className="text-[12px] text-rs-blue-fusion font-medium mt-1">
            {talent?.primary_role || 'Add your role'}
          {talent?.department && ` · ${DEPARTMENT_LABELS[talent.department as Department]}`}
          </p>
          <p className="text-[11px] text-rs-blue-fusion/60 mt-1">{profile?.email}</p>
          {profile?.verified && (
            <span className="inline-block mt-2 text-[10px] uppercase tracking-wider font-semibold bg-rs-blue-fusion text-rs-cream px-2 py-0.5 rounded-full">
              ✓ Verified
            </span>
          )}
        </div>
      </div>

      <Link href="/app/profile/edit" className="rs-btn w-full text-center block mb-6">
        Edit profile
      </Link>

      <p className="text-[10px] uppercase tracking-wider text-rs-blue-fusion/60 font-semibold mb-2">
        Bio
      </p>
      <div className="bg-white rounded-rs p-4 border border-rs-blue-fusion/10 mb-5">
        <p className="text-[13px] text-rs-blue-fusion leading-relaxed">
          {talent?.bio || (
            <span className="text-rs-blue-fusion/40 italic">
              Tell clients a bit about yourself — your background, style, what sets you apart.
            </span>
          )}
        </p>
      </div>

      <p className="text-[10px] uppercase tracking-wider text-rs-blue-fusion/60 font-semibold mb-2">
        Rates
      </p>
      <div className="bg-white rounded-rs p-4 border border-rs-blue-fusion/10 mb-5 space-y-2">
        <div className="flex justify-between text-[12px]">
          <span className="text-rs-blue-fusion/60 font-medium">Day rate</span>
          <span className="font-bold text-rs-blue-logo">{formatRate(talent?.day_rate_cents ?? null)}</span>
        </div>
        <div className="flex justify-between text-[12px]">
          <span className="text-rs-blue-fusion/60 font-medium">Half day</span>
          <span className="font-bold text-rs-blue-logo">
            {formatRate(talent?.half_day_rate_cents ?? null)}
          </span>
        </div>
      </div>

      <p className="text-[10px] uppercase tracking-wider text-rs-blue-fusion/60 font-semibold mb-2">
        Equipment
      </p>
      <div className="bg-white rounded-rs p-4 border border-rs-blue-fusion/10 mb-5">
        <p className="text-[13px] text-rs-blue-fusion leading-relaxed">
          {talent?.equipment || (
            <span className="text-rs-blue-fusion/40 italic">
              List the gear you own and bring to jobs.
            </span>
          )}
        </p>
      </div>

      {talent?.showreel_url && (
        <>
          <p className="text-[10px] uppercase tracking-wider text-rs-blue-fusion/60 font-semibold mb-2">
            Showreel
          </p>
          <a
            href={talent.showreel_url}
            target="_blank"
            rel="noopener noreferrer"
            className="block bg-rs-blue-logo rounded-rs p-6 text-center text-rs-cream"
          >
            <p className="text-[11px] uppercase tracking-wider font-semibold">▶ Watch showreel</p>
            <p className="text-[10px] opacity-60 mt-1 break-all">{talent.showreel_url}</p>
          </a>
        </>
      )}
    </main>
  )
}

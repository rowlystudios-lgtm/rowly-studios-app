'use client'

import Link from 'next/link'
import { useAuth } from '@/lib/auth-context'

export default function AppHome() {
  const { profile } = useAuth()

  const firstName =
    profile?.first_name ??
    profile?.full_name?.split(' ')[0] ??
    'there'
  const talent = profile?.talent_profiles?.[0] ?? null

  const missing: string[] = []
  if (!profile?.first_name) missing.push('Add your first name')
  if (!profile?.last_name) missing.push('Add your last name')
  if (!talent?.department) missing.push('Choose your department')
  if (!talent?.bio) missing.push('Write a short bio')

  const profileComplete = missing.length === 0

  return (
    <main className="px-5 py-6 max-w-md mx-auto">
      <h1 className="text-[22px] font-semibold text-rs-blue-logo">Morning, {firstName}</h1>
      <p className="text-[11px] uppercase tracking-widest text-rs-blue-fusion/60 font-semibold mt-1 mb-6">
        0 upcoming jobs
      </p>

      {!profileComplete && (
        <div className="bg-[#F6EBC8] border border-[#8a6f1a]/20 rounded-rs p-4 mb-5">
          <p className="text-[10px] uppercase tracking-wider text-[#8a6f1a] font-semibold">
            Finish setting up your profile
          </p>
          <p className="text-[13px] text-rs-blue-fusion mt-1 leading-relaxed">
            A few more details and clients can start requesting you.
          </p>
          <ul className="mt-3 space-y-1">
            {missing.map((m) => (
              <li key={m} className="flex items-start gap-2 text-[12px] text-rs-blue-fusion">
                <span className="mt-[6px] w-1.5 h-1.5 rounded-full bg-[#8a6f1a] flex-shrink-0" />
                <span>{m}</span>
              </li>
            ))}
          </ul>
          <Link href="/app/profile/edit" className="rs-btn mt-4 inline-block">
            Continue
          </Link>
        </div>
      )}

      <div className="bg-white rounded-rs p-5 border border-rs-blue-fusion/10">
        <p className="text-[13px] text-rs-blue-fusion leading-relaxed">
          Your jobs dashboard is ready. Once clients request you, or admin confirms a booking,
          those jobs will appear here.
        </p>
      </div>

      <p className="text-[10px] uppercase tracking-wider text-rs-blue-fusion/50 font-semibold mt-6 mb-2">
        Next steps
      </p>
      <div className="space-y-2">
        <Link
          href="/app/profile"
          className="block bg-white rounded-rs p-3 border border-rs-blue-fusion/10 hover:border-rs-blue-fusion/30"
        >
          <p className="text-[13px] font-semibold text-rs-blue-logo">View your profile</p>
          <p className="text-[11px] text-rs-blue-fusion/60 mt-0.5">See what clients see</p>
        </Link>
        <Link
          href="/app/calendar"
          className="block bg-white rounded-rs p-3 border border-rs-blue-fusion/10 hover:border-rs-blue-fusion/30"
        >
          <p className="text-[13px] font-semibold text-rs-blue-logo">Mark availability</p>
          <p className="text-[11px] text-rs-blue-fusion/60 mt-0.5">Tell clients which days you&apos;re free</p>
        </Link>
      </div>
    </main>
  )
}

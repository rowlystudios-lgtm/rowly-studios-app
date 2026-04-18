'use client'

import Link from 'next/link'
import { useAuth } from '@/lib/auth-context'

export default function AppHome() {
  const { profile } = useAuth()

  const firstName = profile?.full_name?.split(' ')[0] ?? 'there'
  const talent = profile?.talent_profiles?.[0] ?? null
  const profileComplete = Boolean(
    talent?.department && talent?.primary_role && talent?.day_rate_cents
  )

  return (
    <main className="px-5 py-6 max-w-md mx-auto">
      <h1 className="text-[22px] font-semibold text-rs-blue-logo">Morning, {firstName}</h1>
      <p className="text-[11px] uppercase tracking-widest text-rs-blue-fusion/60 font-semibold mt-1 mb-6">
        0 upcoming jobs
      </p>

      {!profileComplete && (
        <div className="bg-[#F6EBC8] border border-[#8a6f1a]/20 rounded-rs p-4 mb-5">
          <p className="text-[10px] uppercase tracking-wider text-[#8a6f1a] font-semibold">
            Complete your profile
          </p>
          <p className="text-[13px] text-rs-blue-fusion mt-1 leading-relaxed">
            Add your role, rate, and showreel so clients can see you and request bookings.
          </p>
          <Link href="/app/profile/edit" className="rs-btn mt-3 inline-block">
            Set up profile
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

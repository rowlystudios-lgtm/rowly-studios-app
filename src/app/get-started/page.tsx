'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { RSLogo } from '@/components/RSLogo'

type Platform = 'ios' | 'android'

type Step = { title: string; body: string }

const IOS_STEPS: Step[] = [
  {
    title: 'Open this page in Safari',
    body: 'If you\'re reading this in Chrome or another browser, copy the link and paste it into Safari. Install only works from Safari on iPhone.',
  },
  {
    title: 'Tap the Share button',
    body: 'At the bottom of Safari, tap the square icon with the arrow pointing up.',
  },
  {
    title: 'Scroll down and tap "Add to Home Screen"',
    body: 'You may need to scroll past the top row of options to find it.',
  },
  {
    title: 'Tap Add',
    body: 'The RS app icon appears on your home screen. Open it from there — it runs full-screen like a real app.',
  },
]

const ANDROID_STEPS: Step[] = [
  {
    title: 'Open this page in Chrome',
    body: 'Chrome is the most reliable for installing web apps on Android.',
  },
  {
    title: 'Tap the three-dot menu',
    body: 'Top-right corner of Chrome.',
  },
  {
    title: 'Tap "Add to Home screen" or "Install app"',
    body: 'Wording varies by Android version — either option works.',
  },
  {
    title: 'Tap Install',
    body: 'You\'re done. The RS app icon appears on your home screen.',
  },
]

export default function GetStartedPage() {
  const [isMounted, setIsMounted] = useState(false)
  const [platform, setPlatform] = useState<Platform>('ios')
  const [standalone, setStandalone] = useState(false)

  useEffect(() => {
    const ua = navigator.userAgent || ''
    setPlatform(/Android/i.test(ua) ? 'android' : 'ios')

    const standaloneMatch =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(display-mode: standalone)').matches
    const iosStandalone =
      (navigator as unknown as { standalone?: boolean }).standalone === true
    setStandalone(standaloneMatch || iosStandalone)

    setIsMounted(true)
  }, [])

  if (!isMounted) {
    return (
      <main className="min-h-[100dvh] bg-[#0a0a0a] text-white">
        <div className="mx-auto max-w-md px-6 py-10">
          <div className="flex items-center gap-3 mb-10">
            <RSLogo size={40} />
            <span className="text-[11px] tracking-[2px] uppercase font-semibold text-white/80">
              Rowly Studios
            </span>
          </div>
        </div>
      </main>
    )
  }

  const steps = platform === 'ios' ? IOS_STEPS : ANDROID_STEPS

  return (
    <main className="min-h-[100dvh] bg-[#0a0a0a] text-white">
      <div className="mx-auto max-w-md px-6 py-10">
        <Link href="/" className="flex items-center gap-3 mb-10">
          <RSLogo size={40} />
          <span className="text-[11px] tracking-[2px] uppercase font-semibold text-white/80">
            Rowly Studios
          </span>
        </Link>

        {standalone ? (
          <section className="space-y-4">
            <h1 className="text-[22px] font-semibold leading-tight">You&apos;re all set.</h1>
            <p className="text-[14px] text-white/70 leading-relaxed">
              The RS app is installed on your home screen and running in standalone mode.
              Sign in once and it stays signed in.
            </p>
            <Link href="/login" className="inline-block mt-4 px-5 py-3 rounded-[10px] bg-white text-black text-[12px] uppercase tracking-wider font-semibold">
              Go to sign in
            </Link>
          </section>
        ) : (
          <>
            <h1 className="text-[22px] font-semibold leading-tight">
              Add RS to your home screen
            </h1>
            <p className="text-[13px] text-white/60 leading-relaxed mt-2">
              Four quick steps. No App Store, no download.
            </p>

            <div
              role="tablist"
              aria-label="Platform"
              className="mt-6 inline-flex rounded-full border border-white/15 p-1 text-[11px] uppercase tracking-wider"
            >
              <button
                role="tab"
                aria-selected={platform === 'ios'}
                onClick={() => setPlatform('ios')}
                className={`px-4 py-2 rounded-full transition-colors ${
                  platform === 'ios' ? 'bg-white text-black' : 'text-white/70 hover:text-white'
                }`}
              >
                iPhone
              </button>
              <button
                role="tab"
                aria-selected={platform === 'android'}
                onClick={() => setPlatform('android')}
                className={`px-4 py-2 rounded-full transition-colors ${
                  platform === 'android' ? 'bg-white text-black' : 'text-white/70 hover:text-white'
                }`}
              >
                Android
              </button>
            </div>

            <ol className="mt-8 space-y-6">
              {steps.map((step, i) => (
                <li key={i} className="flex gap-4">
                  <span
                    aria-hidden
                    className="flex-shrink-0 w-7 h-7 rounded-full border border-white/25 flex items-center justify-center text-[12px] font-semibold"
                  >
                    {i + 1}
                  </span>
                  <div className="flex-1 pt-0.5">
                    <h2 className="text-[15px] font-semibold leading-snug">{step.title}</h2>
                    <p className="text-[13px] text-white/60 leading-relaxed mt-1">{step.body}</p>
                  </div>
                </li>
              ))}
            </ol>

            <p className="mt-10 text-[12px] text-white/50 leading-relaxed border-t border-white/10 pt-6">
              No App Store needed. The app runs from your home screen like any other app
              and keeps you logged in.
            </p>

            <div className="mt-8">
              <Link
                href="/login"
                className="text-[11px] uppercase tracking-wider text-white/60 underline"
              >
                ← Back to sign in
              </Link>
            </div>
          </>
        )}
      </div>
    </main>
  )
}

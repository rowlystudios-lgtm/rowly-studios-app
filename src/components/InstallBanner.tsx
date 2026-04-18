'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

const STORAGE_KEY = 'rs-app-install-banner-dismissed'

function isMobile(): boolean {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent || ''
  return /android|iphone|ipad|ipod/i.test(ua)
}

function isStandalone(): boolean {
  if (typeof window === 'undefined') return false
  if (window.matchMedia('(display-mode: standalone)').matches) return true
  // @ts-expect-error — iOS Safari exposes navigator.standalone
  return window.navigator.standalone === true
}

export function InstallBanner() {
  const [show, setShow] = useState(false)

  useEffect(() => {
    if (!isMobile()) return
    if (isStandalone()) return
    try {
      if (window.localStorage.getItem(STORAGE_KEY) === '1') return
    } catch {
      // localStorage blocked — show anyway
    }
    setShow(true)
  }, [])

  function dismiss() {
    setShow(false)
    try {
      window.localStorage.setItem(STORAGE_KEY, '1')
    } catch {
      // ignore
    }
  }

  if (!show) return null

  return (
    <div className="w-full bg-[#0a0a0a] text-white text-[12px] px-4 py-3 flex items-center gap-3">
      <span className="flex-1 leading-snug">
        Add to your home screen for the best experience →{' '}
        <Link href="/get-started" className="underline font-semibold">
          How to
        </Link>
      </span>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss"
        className="flex-shrink-0 w-7 h-7 -mr-1 flex items-center justify-center text-white/70 hover:text-white text-[18px] leading-none"
      >
        ×
      </button>
    </div>
  )
}

'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

const STORAGE_KEY = 'rs-app-install-banner-dismissed'

export function InstallBanner() {
  const [isMounted, setIsMounted] = useState(false)
  const [show, setShow] = useState(false)

  useEffect(() => {
    setIsMounted(true)

    let dismissed: string | null = null
    try {
      dismissed = window.localStorage.getItem(STORAGE_KEY)
    } catch {
      // localStorage blocked — treat as not dismissed
    }

    const standaloneMatch =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(display-mode: standalone)').matches
    // iOS Safari exposes navigator.standalone
    const iosStandalone =
      typeof navigator !== 'undefined' &&
      (navigator as unknown as { standalone?: boolean }).standalone === true
    const isStandalone = standaloneMatch || iosStandalone

    const ua = typeof navigator !== 'undefined' ? navigator.userAgent : ''
    const isMobile = /iPhone|iPad|iPod|Android/i.test(ua)

    setShow(!dismissed && !isStandalone && isMobile)
  }, [])

  function dismiss() {
    setShow(false)
    try {
      window.localStorage.setItem(STORAGE_KEY, '1')
    } catch {
      // ignore
    }
  }

  if (!isMounted || !show) return null

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

'use client'

import { Suspense, useEffect, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'

const MESSAGES: Record<string, string> = {
  'password-updated': 'Password updated',
}

export function Toast() {
  return (
    <Suspense fallback={null}>
      <ToastInner />
    </Suspense>
  )
}

function ToastInner() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  const key = searchParams.get('toast')
  const [visible, setVisible] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    if (!key) return
    const msg = MESSAGES[key]
    if (!msg) return
    setMessage(msg)
    setVisible(true)

    const params = new URLSearchParams(Array.from(searchParams.entries()))
    params.delete('toast')
    const qs = params.toString()
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })

    const hide = setTimeout(() => setVisible(false), 3200)
    return () => clearTimeout(hide)
  }, [key, pathname, router, searchParams])

  if (!visible) return null

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed top-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-[10px] text-white text-[13px] font-semibold shadow-lg"
      style={{ backgroundColor: '#1A3C6B' }}
    >
      {message}
    </div>
  )
}

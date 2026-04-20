'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'

export function DashboardRefreshButton() {
  const router = useRouter()
  const [spinning, setSpinning] = useState(false)
  const [pending, startTransition] = useTransition()

  function handleRefresh() {
    setSpinning(true)
    startTransition(() => {
      router.refresh()
    })
    // Let the spin animation play for at least one revolution so the
    // click feels acknowledged even when the refresh is nearly instant.
    setTimeout(() => setSpinning(false), 700)
  }

  const active = spinning || pending

  return (
    <button
      type="button"
      onClick={handleRefresh}
      disabled={active}
      className="inline-flex items-center gap-1.5 text-[12px] text-[#7A90AA] hover:text-white transition-colors disabled:opacity-70"
      style={{ background: 'transparent', border: 'none', cursor: active ? 'wait' : 'pointer' }}
      aria-label="Refresh dashboard"
    >
      <span
        aria-hidden
        style={{
          display: 'inline-block',
          transformOrigin: 'center',
          animation: active ? 'rs-spin 0.9s linear infinite' : 'none',
          fontSize: 14,
          lineHeight: 1,
        }}
      >
        ↻
      </span>
      <span className="uppercase tracking-widest" style={{ fontSize: 10, fontWeight: 600 }}>
        Refresh
      </span>
      <style>{`@keyframes rs-spin { to { transform: rotate(360deg) } }`}</style>
    </button>
  )
}

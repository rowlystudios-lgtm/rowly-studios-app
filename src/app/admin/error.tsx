'use client'

import { useEffect } from 'react'

export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // Surface for Vercel logs / client console.
    // eslint-disable-next-line no-console
    console.error('[admin error]', error)
  }, [error])

  return (
    <div
      className="mx-auto"
      style={{ maxWidth: 560, padding: '40px 18px' }}
    >
      <div
        className="rounded-xl bg-[#1A2E4A] border border-white/5 text-center"
        style={{ padding: 28 }}
      >
        <p
          className="text-white"
          style={{ fontSize: 18, fontWeight: 600, lineHeight: 1.2 }}
        >
          Something went wrong
        </p>
        <p
          style={{
            fontSize: 13,
            color: '#AABDE0',
            marginTop: 6,
            lineHeight: 1.5,
          }}
        >
          The admin area hit an unexpected error. You can retry the request
          below, or try a different tab.
        </p>
        {error.digest && (
          <p
            style={{
              fontSize: 11,
              color: '#7A90AA',
              marginTop: 8,
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
            }}
          >
            ref {error.digest}
          </p>
        )}
        <button
          type="button"
          onClick={() => reset()}
          className="mt-4 rounded-lg bg-[#F0A500] hover:bg-[#F5B733] text-[#0F1B2E] transition-colors"
          style={{
            padding: '9px 16px',
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            border: 'none',
            cursor: 'pointer',
          }}
        >
          Try again
        </button>
      </div>
    </div>
  )
}

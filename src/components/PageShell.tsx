'use client'

export const PAGE_BG = '#1A3C6B'
export const CARD_BG = '#2E5099'
export const CARD_BORDER = 'rgba(170,189,224,0.15)'
export const TEXT_PRIMARY = '#FFFFFF'
export const TEXT_MUTED = '#AABDE0'
export const LINK_COLOR = '#AABDE0'
export const BUTTON_PRIMARY = '#1A3C6B'

export function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <main
      className="rounded-t-rs-lg"
      style={{
        background: PAGE_BG,
        color: TEXT_PRIMARY,
        minHeight: 'calc(100dvh - 64px)',
      }}
    >
      <div className="max-w-md mx-auto px-5 pt-6 pb-10">{children}</div>
    </main>
  )
}

export function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <p
      style={{
        fontSize: 10,
        fontWeight: 600,
        textTransform: 'uppercase',
        letterSpacing: '0.1em',
        color: TEXT_MUTED,
        marginBottom: 8,
      }}
    >
      {children}
    </p>
  )
}

export function Card({
  children,
  onClick,
  className = '',
}: {
  children: React.ReactNode
  onClick?: () => void
  className?: string
}) {
  return (
    <div
      onClick={onClick}
      className={className}
      style={{
        background: CARD_BG,
        border: `1px solid ${CARD_BORDER}`,
        borderRadius: 14,
        padding: '14px 16px',
        marginBottom: 10,
        color: TEXT_PRIMARY,
        cursor: onClick ? 'pointer' : 'default',
      }}
    >
      {children}
    </div>
  )
}

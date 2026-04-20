import Link from 'next/link'

type Props = {
  displayName: string | null
  avatarUrl: string | null
}

function initials(name: string | null): string {
  if (!name) return 'RS'
  const parts = name.trim().split(/\s+/).slice(0, 2)
  return parts.map((p) => p[0]?.toUpperCase() ?? '').join('') || 'RS'
}

export function AdminHeader({ displayName, avatarUrl }: Props) {
  return (
    <header
      style={{
        flexShrink: 0,
        background: '#0F1B2E',
        height: 64,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 20px',
        color: '#fff',
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span
          style={{
            fontFamily: 'Georgia, "Playfair Display", serif',
            fontStyle: 'italic',
            fontSize: 20,
            fontWeight: 400,
            letterSpacing: '0.01em',
            lineHeight: 1,
          }}
        >
          Rowly Studios
        </span>
        <span
          style={{
            fontSize: 9,
            fontWeight: 700,
            letterSpacing: '0.2em',
            textTransform: 'uppercase',
            color: '#F0A500',
          }}
        >
          Admin
        </span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <Link
          href="/admin"
          aria-label="Notifications"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 36,
            height: 36,
            borderRadius: 999,
            color: 'rgba(255,255,255,0.7)',
            background: 'rgba(255,255,255,0.04)',
          }}
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
            <path d="M13.73 21a2 2 0 0 1-3.46 0" />
          </svg>
        </Link>

        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: 999,
            background: '#1E3A6B',
            color: '#fff',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: '0.04em',
            overflow: 'hidden',
          }}
        >
          {avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={avatarUrl}
              alt=""
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          ) : (
            <span>{initials(displayName)}</span>
          )}
        </div>
      </div>
    </header>
  )
}

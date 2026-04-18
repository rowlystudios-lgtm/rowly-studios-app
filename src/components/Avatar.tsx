'use client'

function initialsOf(name: string | null | undefined): string {
  if (!name) return '?'
  return name
    .split(' ')
    .map((n) => n[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase()
}

export function Avatar({
  url,
  name,
  size = 44,
  ring = false,
  className = '',
}: {
  url?: string | null
  name?: string | null
  size?: number
  ring?: boolean
  className?: string
}) {
  const initials = initialsOf(name)
  const fontSize = Math.max(10, Math.round(size * 0.32))
  const ringStyle: React.CSSProperties = ring
    ? { boxShadow: '0 0 0 2px #1E3A6B, 0 0 0 4px #FBF5E4' }
    : {}

  if (url) {
    return (
      <span
        className={`inline-block overflow-hidden rounded-full bg-[#E8EAED] ${className}`}
        style={{ width: size, height: size, ...ringStyle }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={url}
          alt={name ?? 'Avatar'}
          width={size}
          height={size}
          style={{ width: size, height: size, objectFit: 'cover', display: 'block' }}
        />
      </span>
    )
  }

  return (
    <span
      className={`inline-flex items-center justify-center rounded-full bg-[#E8EAED] font-bold text-rs-blue-logo ${className}`}
      style={{ width: size, height: size, fontSize, ...ringStyle }}
      aria-label={name ?? 'Avatar'}
    >
      {initials}
    </span>
  )
}

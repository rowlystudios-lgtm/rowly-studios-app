'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { markNotificationRead } from '@/app/actions/bookings'

type Props = {
  id: string
  title: string
  body: string
  actionUrl: string | null
  read: boolean
  relative: string
}

export function NotificationRow({
  id,
  title,
  body,
  actionUrl,
  read,
  relative,
}: Props) {
  const router = useRouter()
  const [marking, setMarking] = useState(false)

  async function handleClick() {
    if (!read && !marking) {
      setMarking(true)
      const fd = new FormData()
      fd.set('id', id)
      await markNotificationRead(fd).catch(() => undefined)
      setMarking(false)
    }
    if (actionUrl) router.push(actionUrl)
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className="rounded-xl text-left w-full"
      style={{
        background: read ? 'rgba(255,255,255,0.06)' : '#2E5099',
        border: read
          ? '1px solid rgba(170,189,224,0.12)'
          : '1px solid rgba(170,189,224,0.3)',
        borderLeft: read
          ? '1px solid rgba(170,189,224,0.12)'
          : '3px solid #6EB5FF',
        padding: 14,
        color: '#fff',
        cursor: actionUrl ? 'pointer' : 'default',
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <p
          style={{
            fontSize: 14,
            fontWeight: read ? 500 : 700,
            color: '#fff',
            lineHeight: 1.3,
          }}
        >
          {title}
        </p>
        <span style={{ fontSize: 11, color: '#AABDE0', flexShrink: 0 }}>
          {relative}
        </span>
      </div>
      {body && (
        <p
          style={{
            fontSize: 13,
            color: '#AABDE0',
            marginTop: 4,
            lineHeight: 1.45,
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}
        >
          {body}
        </p>
      )}
    </button>
  )
}

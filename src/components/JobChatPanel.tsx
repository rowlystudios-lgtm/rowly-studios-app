'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { sendChatMessage } from '@/app/actions/job-chat'

type ChatMessage = {
  id: string
  job_id: string
  author_user_id: string
  body: string
  created_at: string
}

export default function JobChatPanel({
  jobId,
  currentUserId,
  canPost,
  participants,
}: {
  jobId: string
  currentUserId: string
  canPost: boolean
  participants: Record<string, { name: string; role: string }>
}) {
  const supabase = createClient()
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let alive = true
    ;(async () => {
      const { data, error } = await supabase
        .from('job_chat_messages')
        .select('*')
        .eq('job_id', jobId)
        .order('created_at', { ascending: true })
        .limit(500)
      if (!alive) return
      if (!error && data) setMessages(data as ChatMessage[])
    })()

    const channel = supabase
      .channel(`job_chat:${jobId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'job_chat_messages',
          filter: `job_id=eq.${jobId}`,
        },
        (payload) => {
          setMessages((prev) => {
            const next = payload.new as ChatMessage
            if (prev.some((m) => m.id === next.id)) return prev
            return [...prev, next]
          })
        }
      )
      .subscribe()

    return () => {
      alive = false
      supabase.removeChannel(channel)
    }
  }, [jobId, supabase])

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: 'smooth',
    })
  }, [messages.length])

  async function onSend(e: React.FormEvent) {
    e.preventDefault()
    const text = draft.trim()
    if (!text || sending) return
    setSending(true)
    setError('')
    const res = await sendChatMessage({ jobId, body: text })
    if (!res.ok) {
      setError(res.error)
    } else {
      setDraft('')
    }
    setSending(false)
  }

  return (
    <div
      style={{
        border: '1px solid #E8EDF5',
        borderRadius: 10,
        background: '#FFFFFF',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        maxHeight: 520,
      }}
    >
      <div
        style={{
          padding: '14px 18px',
          background: '#0F1B2E',
          color: '#FFFFFF',
          fontFamily: "'brandon-grotesque','Helvetica Neue',Arial,sans-serif",
          fontSize: 12,
          fontWeight: 700,
          letterSpacing: '0.14em',
          textTransform: 'uppercase',
        }}
      >
        Job chat
      </div>

      <div
        ref={scrollRef}
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '14px 18px',
          background: '#F4F7FC',
          minHeight: 240,
        }}
      >
        {messages.length === 0 ? (
          <div
            style={{
              textAlign: 'center',
              color: '#8A96AA',
              fontSize: 13,
              padding: '24px 0',
              fontFamily: "'DM Sans',sans-serif",
            }}
          >
            No messages yet. Say hi 👋
          </div>
        ) : (
          messages.map((m) => {
            const isMe = m.author_user_id === currentUserId
            const p = participants[m.author_user_id]
            const name = p?.name ?? 'Someone'
            const role =
              p?.role === 'admin'
                ? ' · Admin'
                : p?.role === 'client'
                ? ' · Client'
                : ''
            return (
              <div
                key={m.id}
                style={{
                  marginBottom: 10,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: isMe ? 'flex-end' : 'flex-start',
                }}
              >
                <div
                  style={{
                    fontFamily: "'DM Sans',sans-serif",
                    fontSize: 11,
                    color: '#8A96AA',
                    marginBottom: 3,
                  }}
                >
                  {name}
                  {role} ·{' '}
                  {new Date(m.created_at).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </div>
                <div
                  style={{
                    maxWidth: '80%',
                    background: isMe ? '#2B4780' : '#FFFFFF',
                    color: isMe ? '#FFFFFF' : '#1A2030',
                    border: isMe ? 'none' : '1px solid #E8EDF5',
                    borderRadius: 10,
                    padding: '9px 13px',
                    fontFamily: "'DM Sans',sans-serif",
                    fontSize: 14,
                    lineHeight: 1.4,
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                  }}
                >
                  {m.body}
                </div>
              </div>
            )
          })
        )}
      </div>

      {canPost ? (
        <form
          onSubmit={onSend}
          style={{
            display: 'flex',
            gap: 8,
            padding: '12px 14px',
            borderTop: '1px solid #E8EDF5',
            background: '#FFFFFF',
          }}
        >
          <input
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Type a message…"
            disabled={sending}
            maxLength={4000}
            style={{
              flex: 1,
              padding: '10px 14px',
              border: '1px solid #D0D3DC',
              borderRadius: 8,
              fontFamily: "'DM Sans',sans-serif",
              fontSize: 14,
              color: '#1A2030',
              outline: 'none',
            }}
          />
          <button
            type="submit"
            disabled={sending || !draft.trim()}
            style={{
              padding: '10px 20px',
              background: sending || !draft.trim() ? '#8A96AA' : '#2B4780',
              color: '#FFFFFF',
              border: 'none',
              borderRadius: 8,
              fontFamily: "'brandon-grotesque','Helvetica Neue',Arial,sans-serif",
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              cursor: sending || !draft.trim() ? 'not-allowed' : 'pointer',
            }}
          >
            Send
          </button>
        </form>
      ) : (
        <div
          style={{
            padding: '12px 14px',
            borderTop: '1px solid #E8EDF5',
            fontSize: 12,
            color: '#8A96AA',
            fontFamily: "'DM Sans',sans-serif",
            textAlign: 'center',
          }}
        >
          Chat is closed (outside the job window).
        </div>
      )}

      {error && (
        <div
          style={{
            padding: '8px 14px',
            borderTop: '1px solid #F3B8B8',
            background: '#FFEBEB',
            color: '#C23B22',
            fontSize: 12,
            fontFamily: "'DM Sans',sans-serif",
          }}
        >
          {error}
        </div>
      )}
    </div>
  )
}

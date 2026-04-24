'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { sendChatMessage } from '@/app/actions/job-chat'

type ChatMessage = {
  id: string
  job_id: string
  author_user_id: string
  body: string
  created_at: string
}

type Author = {
  name: string
  avatarUrl: string | null
  role: 'admin' | 'client' | 'talent' | null
}

type Variant = 'full' | 'embedded'

export default function JobChatPanel({
  jobId,
  currentUserId,
  canPost,
  variant = 'full',
}: {
  jobId: string
  currentUserId: string
  canPost: boolean
  variant?: Variant
}) {
  const supabase = createClient()
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [authors, setAuthors] = useState<Record<string, Author>>({})
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)

  const enrichAuthors = useCallback(
    async (userIds: string[]) => {
      const fresh = userIds.filter((id) => !authors[id])
      if (fresh.length === 0) return
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, first_name, role, avatar_url')
        .in('id', fresh)
      if (error) {
        // eslint-disable-next-line no-console
        console.error('[JobChatPanel] enrichAuthors failed:', error.message)
        return
      }
      const next: Record<string, Author> = {}
      ;((data ?? []) as Array<{
        id: string
        full_name: string | null
        first_name: string | null
        role: string | null
        avatar_url: string | null
      }>).forEach((p) => {
        const name = p.first_name || p.full_name || 'Member'
        next[p.id] = {
          name,
          avatarUrl: p.avatar_url,
          role: (p.role as Author['role']) ?? null,
        }
      })
      if (Object.keys(next).length) {
        setAuthors((prev) => ({ ...prev, ...next }))
      }
    },
    [authors, supabase]
  )

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
      if (!error && data) {
        setMessages(data as ChatMessage[])
        const uniqueAuthors = [
          ...new Set((data as ChatMessage[]).map((m) => m.author_user_id)),
        ]
        void enrichAuthors(uniqueAuthors)
      }
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
          const msg = payload.new as ChatMessage
          setMessages((prev) => {
            if (prev.some((m) => m.id === msg.id)) return prev
            return [...prev, msg]
          })
          void enrichAuthors([msg.author_user_id])
        }
      )
      .subscribe()

    return () => {
      alive = false
      supabase.removeChannel(channel)
    }
  }, [jobId, supabase, enrichAuthors])

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

  const embedded = variant === 'embedded'
  const maxHeight = embedded ? 360 : 520
  // currentUserId is available for future "is me" styling if we want it.
  void currentUserId

  return (
    <div
      style={{
        border: '1px solid #E8EDF5',
        borderRadius: embedded ? 8 : 10,
        background: '#FFFFFF',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        maxHeight,
      }}
    >
      {!embedded && (
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
      )}

      <div
        ref={scrollRef}
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: embedded ? '10px 12px' : '14px 18px',
          background: '#F4F7FC',
          minHeight: embedded ? 160 : 240,
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
            const a = authors[m.author_user_id]
            const name = a?.name ?? '…'
            const roleTag =
              a?.role === 'admin'
                ? 'Admin'
                : a?.role === 'client'
                ? 'Client'
                : null
            const time = new Date(m.created_at).toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
            })
            return (
              <div
                key={m.id}
                style={{
                  display: 'flex',
                  gap: 10,
                  marginBottom: 12,
                  alignItems: 'flex-start',
                }}
              >
                <Avatar name={name} src={a?.avatarUrl ?? null} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'baseline',
                      gap: 8,
                      flexWrap: 'wrap',
                      marginBottom: 2,
                    }}
                  >
                    <span
                      style={{
                        fontFamily: "'DM Sans',sans-serif",
                        fontSize: 13,
                        fontWeight: 600,
                        color: '#1A2030',
                      }}
                    >
                      {name}
                    </span>
                    {roleTag && (
                      <span
                        style={{
                          fontSize: 10,
                          fontWeight: 700,
                          color: '#8A96AA',
                          letterSpacing: '0.08em',
                          textTransform: 'uppercase',
                        }}
                      >
                        {roleTag}
                      </span>
                    )}
                    <span
                      style={{
                        fontFamily: "'DM Sans',sans-serif",
                        fontSize: 11,
                        color: '#8A96AA',
                      }}
                    >
                      {time}
                    </span>
                  </div>
                  <div
                    style={{
                      fontFamily: "'DM Sans',sans-serif",
                      fontSize: 14,
                      lineHeight: 1.45,
                      color: '#1A2030',
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                    }}
                  >
                    {m.body}
                  </div>
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
            padding: embedded ? '10px 12px' : '12px 14px',
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
              padding: '10px 18px',
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
            padding: '10px 12px',
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

function Avatar({ name, src }: { name: string; src: string | null }) {
  const initial = (name || 'U').trim().charAt(0).toUpperCase()
  return (
    <div
      style={{
        width: 32,
        height: 32,
        borderRadius: '50%',
        flexShrink: 0,
        background: '#E8EDF5',
        color: '#4A5368',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: "'DM Sans',sans-serif",
        fontWeight: 700,
        fontSize: 13,
        overflow: 'hidden',
      }}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={name}
          width={32}
          height={32}
          style={{ width: 32, height: 32, objectFit: 'cover' }}
        />
      ) : (
        initial
      )}
    </div>
  )
}

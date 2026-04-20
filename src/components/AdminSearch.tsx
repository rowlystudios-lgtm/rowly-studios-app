'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

type JobResult = {
  id: string
  title: string
  status: string
  start_date: string | null
  location: string | null
}

type TalentResult = {
  id: string
  name: string
  avatar_url: string | null
  primary_role: string | null
  department: string | null
  byCode?: boolean
}

type ClientResult = {
  id: string
  name: string
  industry: string | null
  byCode?: boolean
}

type SearchResults = {
  jobs: JobResult[]
  talent: TalentResult[]
  clients: ClientResult[]
}

function formatShort(iso: string | null): string {
  if (!iso) return ''
  const parts = iso.split('-').map(Number)
  if (parts.length !== 3 || parts.some(Number.isNaN)) return ''
  const d = new Date(parts[0], parts[1] - 1, parts[2])
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function initials(raw: string): string {
  const parts = raw.trim().split(/\s+/).slice(0, 2)
  return parts.map((p) => p[0]?.toUpperCase() ?? '').join('') || '?'
}

export function AdminSearch() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResults | null>(null)
  const [loading, setLoading] = useState(false)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    if (!open) return
    inputRef.current?.focus()
  }, [open])

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!containerRef.current) return
      if (!containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    if (open) {
      document.addEventListener('mousedown', onDocClick)
      document.addEventListener('keydown', onEsc)
      return () => {
        document.removeEventListener('mousedown', onDocClick)
        document.removeEventListener('keydown', onEsc)
      }
    }
  }, [open])

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (abortRef.current) abortRef.current.abort()

    const raw = query.trim()
    if (!raw) {
      setResults(null)
      setLoading(false)
      return
    }

    setLoading(true)
    const ac = new AbortController()
    abortRef.current = ac
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch('/api/admin/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: raw }),
          signal: ac.signal,
        })
        if (!res.ok) throw new Error('search failed')
        const data = (await res.json()) as SearchResults
        setResults(data)
      } catch (err) {
        if ((err as { name?: string }).name === 'AbortError') return
        setResults({ jobs: [], talent: [], clients: [] })
      } finally {
        setLoading(false)
      }
    }, 300)

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [query])

  function go(path: string) {
    setOpen(false)
    setQuery('')
    setResults(null)
    router.push(path)
  }

  const totalCount = results
    ? results.jobs.length + results.talent.length + results.clients.length
    : 0

  return (
    <div
      ref={containerRef}
      style={{ position: 'relative', flex: '1 1 auto', maxWidth: 360, minWidth: 0 }}
    >
      {!open ? (
        <button
          type="button"
          aria-label="Search"
          onClick={() => setOpen(true)}
          className="inline-flex items-center justify-center rounded-full transition-colors"
          style={{
            width: 36,
            height: 36,
            color: 'rgba(255,255,255,0.7)',
            background: 'rgba(255,255,255,0.04)',
            border: 'none',
            cursor: 'pointer',
          }}
        >
          <SearchIcon />
        </button>
      ) : (
        <div style={{ position: 'relative' }}>
          <span
            aria-hidden
            style={{
              position: 'absolute',
              left: 12,
              top: '50%',
              transform: 'translateY(-50%)',
              color: '#7A90AA',
              pointerEvents: 'none',
              display: 'inline-flex',
            }}
          >
            <SearchIcon />
          </span>
          <input
            ref={inputRef}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search jobs, talent, clients…"
            className="w-full"
            style={{
              padding: '8px 12px 8px 38px',
              borderRadius: 999,
              background: '#1A2E4A',
              border: '1px solid rgba(255,255,255,0.12)',
              color: '#fff',
              fontSize: 13,
              outline: 'none',
            }}
          />
        </div>
      )}

      {open && query.trim() && (
        <div
          className="rounded-xl"
          style={{
            position: 'absolute',
            top: 'calc(100% + 8px)',
            left: 0,
            right: 0,
            maxHeight: 400,
            overflowY: 'auto',
            background: '#1A2E4A',
            border: '1px solid rgba(255,255,255,0.1)',
            boxShadow: '0 20px 40px rgba(0,0,0,0.35)',
            zIndex: 50,
          }}
        >
          {loading ? (
            <p
              style={{
                padding: 16,
                fontSize: 12,
                color: '#7A90AA',
                textAlign: 'center',
              }}
            >
              Searching…
            </p>
          ) : totalCount === 0 ? (
            <p
              style={{
                padding: 16,
                fontSize: 13,
                color: '#7A90AA',
                textAlign: 'center',
              }}
            >
              No results for &ldquo;{query}&rdquo;
            </p>
          ) : (
            <>
              {results && results.jobs.length > 0 && (
                <Group label="Jobs">
                  {results.jobs.map((j) => (
                    <ResultRow
                      key={j.id}
                      onClick={() => go(`/admin/jobs/${j.id}`)}
                    >
                      <StatusPill status={j.status} />
                      <span
                        className="text-white"
                        style={{
                          flex: 1,
                          minWidth: 0,
                          fontSize: 13,
                          fontWeight: 500,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {j.title}
                      </span>
                      {j.start_date && (
                        <span
                          style={{
                            fontSize: 11,
                            color: '#7A90AA',
                            flexShrink: 0,
                          }}
                        >
                          {formatShort(j.start_date)}
                        </span>
                      )}
                    </ResultRow>
                  ))}
                </Group>
              )}
              {results && results.talent.length > 0 && (
                <Group label="Talent">
                  {results.talent.map((t) => (
                    <ResultRow
                      key={t.id}
                      onClick={() => go(`/admin/talent/${t.id}`)}
                    >
                      <Avatar src={t.avatar_url} label={initials(t.name)} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p
                          className="text-white"
                          style={{
                            fontSize: 13,
                            fontWeight: 500,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {t.name}
                        </p>
                        <p
                          style={{
                            fontSize: 11,
                            color: '#7A90AA',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {[t.department, t.primary_role]
                            .filter(Boolean)
                            .join(' · ') || 'Talent'}
                        </p>
                      </div>
                      {t.byCode && <IdMatchPill />}
                    </ResultRow>
                  ))}
                </Group>
              )}
              {results && results.clients.length > 0 && (
                <Group label="Clients">
                  {results.clients.map((c) => (
                    <ResultRow
                      key={c.id}
                      onClick={() => go(`/admin/clients/${c.id}`)}
                    >
                      <Avatar src={null} label={initials(c.name)} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p
                          className="text-white"
                          style={{
                            fontSize: 13,
                            fontWeight: 500,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {c.name}
                        </p>
                        {c.industry && (
                          <p
                            style={{
                              fontSize: 11,
                              color: '#7A90AA',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {c.industry}
                          </p>
                        )}
                      </div>
                      {c.byCode && <IdMatchPill />}
                    </ResultRow>
                  ))}
                </Group>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}

function Group({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div>
      <p
        style={{
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: '0.14em',
          textTransform: 'uppercase',
          color: '#7A90AA',
          padding: '10px 14px 4px',
        }}
      >
        {label}
      </p>
      {children}
    </div>
  )
}

function ResultRow({
  children,
  onClick,
}: {
  children: React.ReactNode
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="hover:bg-[#253D5E] w-full"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '10px 14px',
        background: 'transparent',
        border: 'none',
        cursor: 'pointer',
        textAlign: 'left',
        color: '#fff',
      }}
    >
      {children}
    </button>
  )
}

function Avatar({ src, label }: { src: string | null; label: string }) {
  return (
    <div
      style={{
        width: 32,
        height: 32,
        borderRadius: 999,
        background: '#1E3A6B',
        color: '#fff',
        fontSize: 11,
        fontWeight: 700,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        flexShrink: 0,
      }}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt=""
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        />
      ) : (
        label
      )}
    </div>
  )
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, { bg: string; color: string }> = {
    crewing: { bg: 'rgba(59,130,246,0.25)', color: '#93C5FD' },
    submitted: { bg: 'rgba(240,165,0,0.25)', color: '#F0A500' },
    confirmed: { bg: 'rgba(34,197,94,0.25)', color: '#86EFAC' },
    wrapped: { bg: 'rgba(168,85,247,0.25)', color: '#C084FC' },
    cancelled: { bg: 'rgba(239,68,68,0.25)', color: '#F87171' },
    draft: { bg: 'rgba(170,189,224,0.15)', color: '#AABDE0' },
  }
  const s = map[status] ?? map.draft
  return (
    <span
      style={{
        padding: '2px 7px',
        borderRadius: 999,
        fontSize: 9,
        fontWeight: 700,
        letterSpacing: '0.06em',
        textTransform: 'uppercase',
        background: s.bg,
        color: s.color,
        whiteSpace: 'nowrap',
        flexShrink: 0,
      }}
    >
      {status}
    </span>
  )
}

function IdMatchPill() {
  return (
    <span
      style={{
        padding: '2px 7px',
        borderRadius: 999,
        fontSize: 9,
        fontWeight: 700,
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        background: 'rgba(170,189,224,0.14)',
        color: '#AABDE0',
        border: '1px solid rgba(170,189,224,0.25)',
        whiteSpace: 'nowrap',
        flexShrink: 0,
      }}
    >
      ID match
    </span>
  )
}

function SearchIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  )
}

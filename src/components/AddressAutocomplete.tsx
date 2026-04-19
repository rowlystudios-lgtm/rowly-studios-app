'use client'

// Uses OpenStreetMap Nominatim API (free, no API key required)
// Rate limit: max 1 request/second — the 350ms debounce handles this
// Usage policy: https://operations.osmfoundation.org/policies/nominatim/

import { useEffect, useRef, useState } from 'react'

export type AddressResult = {
  display: string
  address_line: string
  address_city: string
  address_state: string
  address_zip: string
}

type Props = {
  value: string
  onChange: (value: string) => void
  onSelect: (result: AddressResult) => void
  placeholder?: string
}

const STORAGE_KEY = 'rs-recent-addresses'
const MIN_QUERY_LEN = 4
const MAX_RECENT = 5
const DEBOUNCE_MS = 350
const BLUR_CLOSE_MS = 150

function loadRecent(): AddressResult[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as AddressResult[]) : []
  } catch {
    return []
  }
}

function saveRecent(result: AddressResult) {
  if (typeof window === 'undefined') return
  try {
    const existing = loadRecent()
    const filtered = existing.filter(
      (r) => r.address_line.toLowerCase() !== result.address_line.toLowerCase()
    )
    const updated = [result, ...filtered].slice(0, MAX_RECENT)
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(updated))
  } catch {
    // localStorage blocked / quota — ignore
  }
}

type NominatimAddress = {
  house_number?: string
  road?: string
  pedestrian?: string
  footway?: string
  city?: string
  town?: string
  village?: string
  county?: string
  state_code?: string
  state?: string
  postcode?: string
  ISO3166_2_lvl4?: string
}

type NominatimItem = {
  display_name?: string
  address?: NominatimAddress
}

async function searchAddress(query: string, signal?: AbortSignal): Promise<AddressResult[]> {
  if (query.length < MIN_QUERY_LEN) return []

  const params = new URLSearchParams({
    q: query,
    format: 'json',
    addressdetails: '1',
    countrycodes: 'us',
    limit: '5',
  })

  const res = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
    headers: {
      'Accept-Language': 'en',
    },
    signal,
  })

  if (!res.ok) return []
  const data = (await res.json()) as NominatimItem[]

  const results: AddressResult[] = []
  for (const item of data) {
    const a = item.address ?? {}
    const houseNumber = a.house_number ?? ''
    const road = a.road ?? a.pedestrian ?? a.footway ?? ''
    const streetLine = [houseNumber, road].filter(Boolean).join(' ').trim()
    if (!streetLine) continue

    const stateRaw = a.state_code ?? a.ISO3166_2_lvl4 ?? a.state ?? ''
    const state = stateRaw.replace(/^US-/, '').toUpperCase().slice(0, 2)

    const city = a.city ?? a.town ?? a.village ?? a.county ?? ''
    const zip = a.postcode ?? ''

    results.push({
      display: item.display_name ?? streetLine,
      address_line: streetLine,
      address_city: city,
      address_state: state,
      address_zip: zip,
    })
  }
  return results
}

export function AddressAutocomplete({
  value,
  onChange,
  onSelect,
  placeholder,
}: Props) {
  const [query, setQuery] = useState(value)
  const [suggestions, setSuggestions] = useState<AddressResult[]>([])
  const [recent, setRecent] = useState<AddressResult[]>([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [hoverIndex, setHoverIndex] = useState<number | null>(null)

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const blurRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const requestId = useRef(0)

  // Keep local query synced with external value changes (e.g. form reset).
  useEffect(() => {
    setQuery(value)
  }, [value])

  // Load recents on mount (refreshed again on focus).
  useEffect(() => {
    setRecent(loadRecent())
  }, [])

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
      if (blurRef.current) clearTimeout(blurRef.current)
      abortRef.current?.abort()
    }
  }, [])

  function scheduleSearch(q: string) {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (q.trim().length < MIN_QUERY_LEN) {
      setSuggestions([])
      setLoading(false)
      return
    }
    setLoading(true)
    debounceRef.current = setTimeout(async () => {
      const reqId = ++requestId.current
      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller
      try {
        const results = await searchAddress(q.trim(), controller.signal)
        if (reqId !== requestId.current) return
        setSuggestions(results)
      } catch (err) {
        if ((err as { name?: string })?.name === 'AbortError') return
        if (reqId !== requestId.current) return
        setSuggestions([])
      } finally {
        if (reqId === requestId.current) setLoading(false)
      }
    }, DEBOUNCE_MS)
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const next = e.target.value
    setQuery(next)
    onChange(next)
    setOpen(true)
    scheduleSearch(next)
  }

  function handleFocus() {
    if (blurRef.current) clearTimeout(blurRef.current)
    setRecent(loadRecent())
    setOpen(true)
  }

  function handleBlur() {
    if (blurRef.current) clearTimeout(blurRef.current)
    blurRef.current = setTimeout(() => setOpen(false), BLUR_CLOSE_MS)
  }

  function handleSelect(result: AddressResult) {
    setQuery(result.address_line)
    onChange(result.address_line)
    onSelect(result)
    saveRecent(result)
    setRecent(loadRecent())
    setSuggestions([])
    setOpen(false)
  }

  const trimmed = query.trim()
  const showRecent =
    open && trimmed.length < MIN_QUERY_LEN && recent.length > 0
  const showSuggestions = open && trimmed.length >= MIN_QUERY_LEN
  const showNoResults =
    showSuggestions && !loading && suggestions.length === 0
  const dropdownVisible = showRecent || showSuggestions

  return (
    <div style={{ position: 'relative' }}>
      <input
        type="text"
        value={query}
        onChange={handleChange}
        onFocus={handleFocus}
        onBlur={handleBlur}
        placeholder={placeholder}
        className="rs-input"
        autoComplete="street-address"
        autoCapitalize="words"
        spellCheck={false}
        style={{ width: '100%' }}
      />

      {dropdownVisible && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            right: 0,
            marginTop: 4,
            background: '#1A3C6B',
            border: '1px solid rgba(170,189,224,0.3)',
            borderRadius: 10,
            overflow: 'hidden',
            zIndex: 50,
            boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
          }}
        >
          {showRecent && (
            <>
              <SectionLabel>Recent</SectionLabel>
              {recent.map((r, i) => (
                <ResultRow
                  key={`recent-${i}`}
                  result={r}
                  hover={hoverIndex === i}
                  onHover={() => setHoverIndex(i)}
                  onLeave={() => setHoverIndex(null)}
                  onSelect={() => handleSelect(r)}
                />
              ))}
            </>
          )}

          {showSuggestions && (
            <>
              {showRecent && <div style={{ height: 1, background: 'rgba(170,189,224,0.2)' }} />}
              <SectionLabel>Suggestions</SectionLabel>
              {loading && (
                <div
                  style={{
                    padding: '10px 14px',
                    fontSize: 13,
                    color: '#AABDE0',
                  }}
                >
                  Searching…
                </div>
              )}
              {!loading &&
                suggestions.map((r, i) => {
                  const hoverKey = 1000 + i
                  return (
                    <ResultRow
                      key={`sug-${i}`}
                      result={r}
                      hover={hoverIndex === hoverKey}
                      onHover={() => setHoverIndex(hoverKey)}
                      onLeave={() => setHoverIndex(null)}
                      onSelect={() => handleSelect(r)}
                    />
                  )
                })}
              {showNoResults && (
                <div
                  style={{
                    padding: '10px 14px',
                    fontSize: 13,
                    color: '#AABDE0',
                    fontStyle: 'italic',
                  }}
                >
                  No addresses found — type the full street address
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: 9,
        fontWeight: 700,
        textTransform: 'uppercase',
        letterSpacing: '0.1em',
        color: '#AABDE0',
        padding: '8px 14px 6px',
      }}
    >
      {children}
    </div>
  )
}

function ResultRow({
  result,
  hover,
  onHover,
  onLeave,
  onSelect,
}: {
  result: AddressResult
  hover: boolean
  onHover: () => void
  onLeave: () => void
  onSelect: () => void
}) {
  const subline = [
    result.address_city,
    [result.address_state, result.address_zip].filter(Boolean).join(' '),
  ]
    .filter(Boolean)
    .join(', ')

  return (
    <button
      type="button"
      onMouseDown={(e) => {
        e.preventDefault()
        onSelect()
      }}
      onMouseEnter={onHover}
      onMouseLeave={onLeave}
      style={{
        display: 'block',
        width: '100%',
        padding: '10px 14px',
        background: hover ? 'rgba(255,255,255,0.08)' : 'transparent',
        border: 'none',
        textAlign: 'left',
        color: '#fff',
        cursor: 'pointer',
        fontSize: 13,
        lineHeight: 1.4,
        borderTop: '1px solid rgba(170,189,224,0.1)',
      }}
    >
      <span style={{ display: 'block', fontWeight: 500 }}>
        {result.address_line}
      </span>
      {subline && (
        <span
          style={{
            display: 'block',
            fontSize: 11,
            color: '#AABDE0',
            marginTop: 2,
          }}
        >
          {subline}
        </span>
      )}
    </button>
  )
}

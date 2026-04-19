'use client'

// Uses OpenStreetMap Nominatim API (free, no API key required).
// Rate limit: max 1 request/second — the 400ms debounce handles this,
// plus reverse-geocode fallback only fires when the primary search has
// no street-level hit.
// Usage policy: https://operations.osmfoundation.org/policies/nominatim/
//
// Map preview via Leaflet, loaded once from CDN (no npm install needed).

import { useEffect, useRef, useState } from 'react'

export type AddressResult = {
  display: string
  address_line: string
  address_city: string
  address_state: string
  address_zip: string
  lat?: string
  lon?: string
}

type Props = {
  value: string
  onChange: (value: string) => void
  onSelect: (result: AddressResult) => void
  placeholder?: string
}

const STORAGE_KEY = 'rs-recent-addresses'
const MIN_QUERY_LEN = 3
const MAX_RECENT = 5
const DEBOUNCE_MS = 400
const BLUR_CLOSE_MS = 150

/* ─────────── recents ─────────── */

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
    // ignore
  }
}

/* ─────────── Leaflet loader ─────────── */

let leafletLoaded = false
let leafletLoadingPromise: Promise<void> | null = null

function ensureLeaflet(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve()
  const w = window as unknown as { L?: unknown }
  if (leafletLoaded || w.L) {
    leafletLoaded = true
    return Promise.resolve()
  }
  if (leafletLoadingPromise) return leafletLoadingPromise
  leafletLoadingPromise = new Promise<void>((resolve) => {
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'
    document.head.appendChild(link)

    const script = document.createElement('script')
    script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
    script.async = true
    script.onload = () => {
      leafletLoaded = true
      resolve()
    }
    script.onerror = () => {
      leafletLoadingPromise = null
      resolve()
    }
    document.head.appendChild(script)
  })
  return leafletLoadingPromise
}

/* ─────────── Nominatim ─────────── */

type NominatimResult = {
  place_id: number
  display_name: string
  lat: string
  lon: string
  address?: Record<string, string>
  type?: string
  class?: string
}

async function searchNominatim(
  query: string,
  signal?: AbortSignal
): Promise<NominatimResult[]> {
  const params = new URLSearchParams({
    q: query,
    format: 'json',
    addressdetails: '1',
    countrycodes: 'us',
    limit: '8',
  })
  const res = await fetch(
    `https://nominatim.openstreetmap.org/search?${params}`,
    {
      headers: {
        'Accept-Language': 'en',
        'User-Agent': 'RowlyStudiosApp/1.0',
      },
      signal,
    }
  )
  if (!res.ok) return []
  return (await res.json()) as NominatimResult[]
}

/** When a landmark hit has no street-level match, fetch the nearest
 *  address + a few neighbours inside a ~100m box. */
async function reverseGeocode(
  lat: string,
  lon: string,
  signal?: AbortSignal
): Promise<NominatimResult[]> {
  const reverseParams = new URLSearchParams({
    lat,
    lon,
    format: 'json',
    addressdetails: '1',
    zoom: '18',
  })
  const reverseRes = await fetch(
    `https://nominatim.openstreetmap.org/reverse?${reverseParams}`,
    {
      headers: {
        'Accept-Language': 'en',
        'User-Agent': 'RowlyStudiosApp/1.0',
      },
      signal,
    }
  )
  const reverseItem: NominatimResult | null = reverseRes.ok
    ? ((await reverseRes.json()) as NominatimResult)
    : null

  const delta = 0.001 // ~100m in degrees
  const nearbyParams = new URLSearchParams({
    format: 'json',
    addressdetails: '1',
    countrycodes: 'us',
    limit: '5',
    viewbox: `${+lon - delta},${+lat + delta},${+lon + delta},${+lat - delta}`,
    bounded: '1',
    q: 'street',
  })
  const nearbyRes = await fetch(
    `https://nominatim.openstreetmap.org/search?${nearbyParams}`,
    {
      headers: {
        'Accept-Language': 'en',
        'User-Agent': 'RowlyStudiosApp/1.0',
      },
      signal,
    }
  )
  const nearbyData: NominatimResult[] = nearbyRes.ok
    ? ((await nearbyRes.json()) as NominatimResult[])
    : []

  const combined: NominatimResult[] = []
  if (reverseItem && reverseItem.place_id) combined.push(reverseItem)
  combined.push(...nearbyData)

  const seen = new Set<number>()
  return combined.filter((r) => {
    if (!r.place_id) return false
    if (seen.has(r.place_id)) return false
    seen.add(r.place_id)
    return true
  })
}

function parseResult(item: NominatimResult): AddressResult | null {
  const a = item.address ?? {}
  const houseNumber = a.house_number ?? ''
  const road =
    a.road ?? a.pedestrian ?? a.footway ?? a.path ?? a.cycleway ?? ''
  const streetLine = [houseNumber, road].filter(Boolean).join(' ').trim()
  const stateRaw = a.state_code ?? a.ISO3166_2_lvl4 ?? a.state ?? ''
  const state = stateRaw.replace(/^US-/, '').toUpperCase().slice(0, 2)
  const city =
    a.city ?? a.town ?? a.village ?? a.suburb ?? a.county ?? ''
  const zip = a.postcode?.trim() ?? ''

  // For landmarks without a street address, keep the display name's
  // first segment so the user sees something meaningful.
  const addressLine =
    streetLine || (item.display_name?.split(',')[0]?.trim() ?? '')

  if (!addressLine) return null

  return {
    display: item.display_name ?? addressLine,
    address_line: addressLine,
    address_city: city,
    address_state: state,
    address_zip: zip,
    lat: item.lat,
    lon: item.lon,
  }
}

async function searchAddress(
  query: string,
  signal?: AbortSignal
): Promise<AddressResult[]> {
  if (query.length < MIN_QUERY_LEN) return []

  const raw = await searchNominatim(query, signal)
  const primary = raw
    .map(parseResult)
    .filter((r): r is AddressResult => r !== null)

  const hasStreetLevel = primary.some((r) => /^\d/.test(r.address_line))

  if (!hasStreetLevel && raw.length > 0) {
    const { lat, lon } = raw[0]
    const nearby = await reverseGeocode(lat, lon, signal)
    const nearbyParsed = nearby
      .map(parseResult)
      .filter((r): r is AddressResult => r !== null)

    const seen = new Set<string>()
    const merged: AddressResult[] = []
    for (const r of [...primary, ...nearbyParsed]) {
      const key = r.address_line.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      merged.push(r)
    }
    // Prefer results that actually carry a zip — stable sort.
    return merged.sort((a, b) => {
      const aHasZip = a.address_zip ? 1 : 0
      const bHasZip = b.address_zip ? 1 : 0
      return bHasZip - aHasZip
    })
  }

  return primary
}

/* ─────────── component ─────────── */

type LeafletLike = {
  map: (
    el: HTMLElement,
    opts: Record<string, unknown>
  ) => {
    remove: () => void
  }
  tileLayer: (
    url: string,
    opts: Record<string, unknown>
  ) => { addTo: (m: unknown) => unknown }
  divIcon: (opts: Record<string, unknown>) => unknown
  marker: (
    latlng: [number, number],
    opts: Record<string, unknown>
  ) => { addTo: (m: unknown) => unknown }
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
  const [previewResult, setPreviewResult] = useState<AddressResult | null>(null)

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const blurRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const requestId = useRef(0)

  const mapRef = useRef<HTMLDivElement | null>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const leafletMapRef = useRef<any>(null)

  useEffect(() => {
    setQuery(value)
  }, [value])

  useEffect(() => {
    setRecent(loadRecent())
  }, [])

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
      if (blurRef.current) clearTimeout(blurRef.current)
      abortRef.current?.abort()
      if (leafletMapRef.current) {
        leafletMapRef.current.remove()
        leafletMapRef.current = null
      }
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
        // Auto-preview the first result so mobile (no hover) still
        // gets the mini map.
        if (results.length > 0 && results[0].lat && results[0].lon) {
          setPreviewResult(results[0])
        }
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
    const rec = loadRecent()
    setRecent(rec)
    if (rec.length > 0 && rec[0].lat && rec[0].lon) {
      setPreviewResult(rec[0])
    }
    setOpen(true)
  }

  function handleBlur() {
    if (blurRef.current) clearTimeout(blurRef.current)
    blurRef.current = setTimeout(() => {
      setOpen(false)
      setPreviewResult(null)
      setHoverIndex(null)
    }, BLUR_CLOSE_MS)
  }

  function handleSelect(result: AddressResult) {
    setQuery(result.address_line)
    onChange(result.address_line)
    onSelect(result)
    saveRecent(result)
    setRecent(loadRecent())
    setSuggestions([])
    setOpen(false)
    setPreviewResult(null)
    setHoverIndex(null)
  }

  const trimmed = query.trim()
  const showRecent = open && trimmed.length < MIN_QUERY_LEN && recent.length > 0
  const showSuggestions = open && trimmed.length >= MIN_QUERY_LEN
  const showNoResults =
    showSuggestions && !loading && suggestions.length === 0
  const dropdownVisible = showRecent || showSuggestions

  /* ─── Map preview lifecycle ─── */
  useEffect(() => {
    if (!previewResult?.lat || !previewResult?.lon || !mapRef.current) {
      if (leafletMapRef.current) {
        leafletMapRef.current.remove()
        leafletMapRef.current = null
      }
      return
    }

    const lat = parseFloat(previewResult.lat)
    const lon = parseFloat(previewResult.lon)
    if (Number.isNaN(lat) || Number.isNaN(lon)) return

    let cancelled = false
    ensureLeaflet().then(() => {
      if (cancelled) return
      const w = window as unknown as { L?: LeafletLike }
      const L = w.L
      if (!L || !mapRef.current) return

      if (leafletMapRef.current) {
        leafletMapRef.current.remove()
        leafletMapRef.current = null
      }

      const map = L.map(mapRef.current, {
        center: [lat, lon],
        zoom: 17,
        zoomControl: false,
        attributionControl: false,
        dragging: false,
        scrollWheelZoom: false,
      })
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
      }).addTo(map)

      const icon = L.divIcon({
        className: '',
        html: `<div style="
          width:14px;height:14px;
          background:#1A3C6B;
          border:2px solid #fff;
          border-radius:50%;
          box-shadow:0 1px 4px rgba(0,0,0,0.4)
        "></div>`,
        iconSize: [14, 14],
        iconAnchor: [7, 7],
      })
      L.marker([lat, lon], { icon }).addTo(map)

      leafletMapRef.current = map
    })

    return () => {
      cancelled = true
      if (leafletMapRef.current) {
        leafletMapRef.current.remove()
        leafletMapRef.current = null
      }
    }
  }, [previewResult])

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
          onMouseLeave={() => {
            setPreviewResult(null)
            setHoverIndex(null)
          }}
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
                  onHover={() => {
                    setHoverIndex(i)
                    if (r.lat && r.lon) setPreviewResult(r)
                  }}
                  onSelect={() => handleSelect(r)}
                />
              ))}
            </>
          )}

          {showSuggestions && (
            <>
              {showRecent && (
                <div style={{ height: 1, background: 'rgba(170,189,224,0.2)' }} />
              )}
              <SectionLabel>Suggestions</SectionLabel>
              {loading && (
                <div
                  style={{
                    padding: '10px 14px',
                    fontSize: 12,
                    color: '#AABDE0',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    className="animate-spin"
                    aria-hidden
                  >
                    <circle cx="12" cy="12" r="9" strokeOpacity=".25" />
                    <path d="M21 12a9 9 0 0 0-9-9" />
                  </svg>
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
                      onHover={() => {
                        setHoverIndex(hoverKey)
                        if (r.lat && r.lon) setPreviewResult(r)
                      }}
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

          {previewResult?.lat && previewResult?.lon && (
            <div
              ref={mapRef}
              style={{
                height: 160,
                borderTop: '1px solid rgba(170,189,224,0.15)',
                borderRadius: '0 0 10px 10px',
                overflow: 'hidden',
                position: 'relative',
              }}
            />
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
  onSelect,
}: {
  result: AddressResult
  hover: boolean
  onHover: () => void
  onSelect: () => void
}) {
  const subline = [
    result.address_city,
    [result.address_state, result.address_zip].filter(Boolean).join(' '),
  ]
    .filter(Boolean)
    .join(', ')

  const isLandmark = !/^\d/.test(result.address_line)

  return (
    <button
      type="button"
      onMouseDown={(e) => {
        e.preventDefault()
        onSelect()
      }}
      onMouseEnter={onHover}
      onFocus={onHover}
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
      <span style={{ display: 'block', fontWeight: 500, fontSize: 13 }}>
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
      {isLandmark && (
        <span
          style={{
            display: 'block',
            fontSize: 10,
            color: 'rgba(170,189,224,0.5)',
            marginTop: 2,
            fontStyle: 'italic',
          }}
        >
          Nearest address to this location
        </span>
      )}
    </button>
  )
}

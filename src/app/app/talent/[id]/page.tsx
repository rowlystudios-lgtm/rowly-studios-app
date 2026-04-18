'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useAuth } from '@/lib/auth-context'
import { Avatar } from '@/components/Avatar'
import { AdminGuard } from '@/components/AdminGuard'
import { PageShell, TEXT_MUTED, TEXT_PRIMARY } from '@/components/PageShell'
import { DEPARTMENT_LABELS, type Department } from '@/lib/types'

const CARD_BG = '#2E5099'
const CARD_BORDER = 'rgba(170,189,224,0.15)'
const AVAILABLE_GREEN = '#4ade80'

type Row = {
  id: string
  first_name: string | null
  last_name: string | null
  full_name: string | null
  email: string | null
  phone: string | null
  city: string | null
  avatar_url: string | null
  verified: boolean
  verified_at: string | null
  available: boolean
  talent_profiles:
    | {
        department: Department | null
        primary_role: string | null
        bio: string | null
        day_rate_cents: number | null
        rate_floor_cents: number | null
        showreel_url: string | null
        equipment: string | null
      }
    | {
        department: Department | null
        primary_role: string | null
        bio: string | null
        day_rate_cents: number | null
        rate_floor_cents: number | null
        showreel_url: string | null
        equipment: string | null
      }[]
    | null
}

function unwrap<T>(v: T | T[] | null): T | null {
  if (!v) return null
  return Array.isArray(v) ? v[0] ?? null : v
}

function formatMoney(cents: number | null | undefined): string {
  if (!cents) return '—'
  return `$${(cents / 100).toLocaleString()}`
}

function getVimeoId(url: string): string | null {
  const match = url.match(/vimeo\.com\/(?:video\/|channels\/\w+\/)?(\d+)/)
  return match ? match[1] : null
}

export default function AdminTalentDetailPageWrapper() {
  return (
    <AdminGuard>
      <AdminTalentDetailPage />
    </AdminGuard>
  )
}

function AdminTalentDetailPage() {
  const params = useParams<{ id: string }>()
  const { supabase } = useAuth()
  const id = params?.id

  const [row, setRow] = useState<Row | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [toggling, setToggling] = useState(false)

  useEffect(() => {
    if (!id) return
    let cancelled = false
    async function load() {
      const { data, error } = await supabase
        .from('profiles')
        .select(
          `id, first_name, last_name, full_name, email, phone, city, avatar_url,
           verified, verified_at, available,
           talent_profiles (department, primary_role, bio, day_rate_cents,
             rate_floor_cents, showreel_url, equipment)`
        )
        .eq('id', id)
        .maybeSingle()
      if (cancelled) return
      if (error) {
        setError(error.message)
        setLoading(false)
        return
      }
      setRow(data as Row | null)
      setLoading(false)
    }
    load()
    return () => {
      cancelled = true
    }
  }, [id, supabase])

  async function toggleVerified() {
    if (!row || toggling) return
    const next = !row.verified
    setToggling(true)
    const { error } = await supabase
      .from('profiles')
      .update({
        verified: next,
        verified_at: next ? new Date().toISOString() : null,
      })
      .eq('id', row.id)
    if (!error) {
      setRow({
        ...row,
        verified: next,
        verified_at: next ? new Date().toISOString() : null,
      })
    } else {
      setError(error.message)
    }
    setToggling(false)
  }

  if (loading)
    return (
      <PageShell>
        <p style={{ fontSize: 13, color: TEXT_MUTED }}>Loading…</p>
      </PageShell>
    )
  if (error)
    return (
      <PageShell>
        <p style={{ fontSize: 13, color: '#fca5a5' }}>{error}</p>
      </PageShell>
    )
  if (!row)
    return (
      <PageShell>
        <p style={{ fontSize: 13, color: TEXT_MUTED }}>Not found.</p>
      </PageShell>
    )

  const name =
    [row.first_name, row.last_name].filter(Boolean).join(' ') ||
    row.full_name ||
    'Unnamed'
  const tp = unwrap(row.talent_profiles)
  const dept = tp?.department ? DEPARTMENT_LABELS[tp.department] : null
  const vimeoId = tp?.showreel_url ? getVimeoId(tp.showreel_url) : null

  return (
    <PageShell>
      <Link
        href="/app/talent"
        style={{
          fontSize: 11,
          color: TEXT_MUTED,
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          fontWeight: 600,
        }}
      >
        ← Talent
      </Link>

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          textAlign: 'center',
          marginTop: 14,
          marginBottom: 18,
        }}
      >
        <Avatar url={row.avatar_url} name={name} size={96} />
        <h1 style={{ fontSize: 24, fontWeight: 700, marginTop: 14 }}>{name}</h1>
        {(dept || row.city) && (
          <p style={{ fontSize: 13, color: TEXT_MUTED, marginTop: 2 }}>
            {[dept, row.city].filter(Boolean).join(' · ')}
          </p>
        )}
        <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
          <button
            type="button"
            onClick={toggleVerified}
            disabled={toggling}
            style={{
              padding: '8px 14px',
              borderRadius: 999,
              border: 'none',
              fontSize: 11,
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              background: row.verified
                ? 'rgba(74,222,128,0.2)'
                : 'rgba(170,189,224,0.2)',
              color: row.verified ? AVAILABLE_GREEN : TEXT_MUTED,
              cursor: toggling ? 'wait' : 'pointer',
            }}
          >
            {row.verified ? '✓ Verified' : 'Verify talent'}
          </button>
          <span
            style={{
              padding: '8px 12px',
              borderRadius: 999,
              fontSize: 11,
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              background: row.available
                ? 'rgba(74,222,128,0.2)'
                : 'rgba(170,189,224,0.15)',
              color: row.available ? AVAILABLE_GREEN : TEXT_MUTED,
            }}
          >
            ● {row.available ? 'Available' : 'Unavailable'}
          </span>
        </div>
      </div>

      <CardBlock label="Contact">
        <p style={{ fontSize: 14 }}>{row.email ?? '—'}</p>
        {row.phone && (
          <p style={{ fontSize: 13, color: TEXT_MUTED, marginTop: 4 }}>{row.phone}</p>
        )}
      </CardBlock>

      <CardBlock label="Rates">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr' }}>
          <div style={{ paddingRight: 12 }}>
            <SubLabel>Day rate</SubLabel>
            <p style={{ fontSize: 18, fontWeight: 700, marginTop: 2 }}>
              {formatMoney(tp?.day_rate_cents)}
            </p>
          </div>
          <div style={{ paddingLeft: 12, borderLeft: `1px solid ${CARD_BORDER}` }}>
            <SubLabel>Floor</SubLabel>
            <p style={{ fontSize: 18, fontWeight: 700, marginTop: 2 }}>
              {formatMoney(tp?.rate_floor_cents)}
            </p>
          </div>
        </div>
      </CardBlock>

      <CardBlock label="About">
        {tp?.bio ? (
          <p style={{ fontSize: 14, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
            {tp.bio}
          </p>
        ) : (
          <p style={{ fontSize: 13, color: TEXT_MUTED }}>No bio</p>
        )}
      </CardBlock>

      {tp?.equipment && (
        <CardBlock label="Equipment">
          <p style={{ fontSize: 14, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
            {tp.equipment}
          </p>
        </CardBlock>
      )}

      {vimeoId && (
        <div style={{ marginBottom: 10 }}>
          <SubLabel>Showreel</SubLabel>
          <div
            style={{
              marginTop: 6,
              position: 'relative',
              width: '100%',
              paddingBottom: '125%',
              borderRadius: 12,
              overflow: 'hidden',
              background: '#000',
              border: `1px solid ${CARD_BORDER}`,
            }}
          >
            <iframe
              src={`https://player.vimeo.com/video/${vimeoId}?autoplay=0&title=0&byline=0&portrait=0&dnt=1`}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                border: 'none',
              }}
              allow="autoplay; fullscreen; picture-in-picture"
              allowFullScreen
              loading="lazy"
              title="Showreel"
            />
          </div>
        </div>
      )}

      {!vimeoId && tp?.showreel_url && (
        <a
          href={tp.showreel_url}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: 'block',
            padding: 14,
            background: CARD_BG,
            border: `1px solid ${CARD_BORDER}`,
            borderRadius: 12,
            color: TEXT_PRIMARY,
            textDecoration: 'none',
            marginBottom: 10,
          }}
        >
          ▶ View showreel →
        </a>
      )}
    </PageShell>
  )
}

function CardBlock({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div
      style={{
        background: CARD_BG,
        border: `1px solid ${CARD_BORDER}`,
        borderRadius: 12,
        padding: 14,
        marginBottom: 10,
      }}
    >
      <SubLabel>{label}</SubLabel>
      <div style={{ marginTop: 6 }}>{children}</div>
    </div>
  )
}

function SubLabel({ children }: { children: React.ReactNode }) {
  return (
    <span
      style={{
        fontSize: 10,
        fontWeight: 600,
        textTransform: 'uppercase',
        letterSpacing: '0.08em',
        color: TEXT_MUTED,
      }}
    >
      {children}
    </span>
  )
}

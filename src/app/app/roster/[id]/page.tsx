'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth-context'
import { Avatar } from '@/components/Avatar'
import { PageShell, TEXT_MUTED, TEXT_PRIMARY } from '@/components/PageShell'
import { DEPARTMENT_LABELS, type Department } from '@/lib/types'
import { clientRateCents } from '@/lib/rates'

const CARD_BG = '#2E5099'
const CARD_BORDER = 'rgba(170,189,224,0.15)'
const LINK_COLOR = '#AABDE0'

type Row = {
  id: string
  first_name: string | null
  last_name: string | null
  full_name: string | null
  email: string | null
  phone: string | null
  city: string | null
  avatar_url: string | null
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

export default function RosterDetailPage() {
  const router = useRouter()
  const params = useParams<{ id: string }>()
  const { supabase, user } = useAuth()
  const id = params?.id

  const [row, setRow] = useState<Row | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [restricted, setRestricted] = useState(false)

  useEffect(() => {
    if (!id) return
    let cancelled = false
    async function load() {
      const { data, error } = await supabase
        .from('profiles')
        .select(
          `id, first_name, last_name, full_name, email, phone, city, avatar_url, available,
           talent_profiles (department, primary_role, bio, day_rate_cents,
             rate_floor_cents, showreel_url, equipment)`
        )
        .eq('id', id)
        .eq('role', 'talent')
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

  useEffect(() => {
    const uid = user?.id
    if (!uid) return
    let cancelled = false
    supabase
      .from('client_profiles')
      .select('account_restricted')
      .eq('id', uid)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return
        const row = data as { account_restricted: boolean | null } | null
        setRestricted(Boolean(row?.account_restricted))
      })
    return () => {
      cancelled = true
    }
  }, [user?.id, supabase])

  if (loading) {
    return (
      <PageShell>
        <p style={{ fontSize: 13, color: TEXT_MUTED }}>Loading…</p>
      </PageShell>
    )
  }
  if (error) {
    return (
      <PageShell>
        <p style={{ fontSize: 13, color: '#fca5a5' }}>{error}</p>
      </PageShell>
    )
  }
  if (!row) {
    return (
      <PageShell>
        <p style={{ fontSize: 13, color: TEXT_MUTED }}>Talent not found.</p>
      </PageShell>
    )
  }

  const name =
    [row.first_name, row.last_name].filter(Boolean).join(' ') ||
    row.full_name ||
    'Unnamed'
  const tp = unwrap(row.talent_profiles)
  const departmentLabel = tp?.department ? DEPARTMENT_LABELS[tp.department] : null
  const vimeoId = tp?.showreel_url ? getVimeoId(tp.showreel_url) : null

  return (
    <PageShell>
      <Link
        href="/app/roster"
        style={{
          fontSize: 11,
          color: TEXT_MUTED,
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          fontWeight: 600,
        }}
      >
        ← Roster
      </Link>

      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', marginTop: 14, marginBottom: 22 }}>
        <Avatar url={row.avatar_url} name={name} size={96} />
        <h1 style={{ fontSize: 24, fontWeight: 700, marginTop: 14 }}>{name}</h1>
        {(departmentLabel || row.city) && (
          <p style={{ fontSize: 13, color: TEXT_MUTED, marginTop: 2 }}>
            {[departmentLabel, row.city].filter(Boolean).join(' · ')}
          </p>
        )}
        {tp?.primary_role && (
          <p style={{ fontSize: 12, color: TEXT_MUTED, marginTop: 2 }}>{tp.primary_role}</p>
        )}
      </div>

      <CardBlock label="Day Rate / Floor">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr' }}>
          <div style={{ paddingRight: 12 }}>
            <FieldLabel>Day rate</FieldLabel>
            {/* Client-facing surface — gross up the talent net to what the client pays. */}
            <p style={{ fontSize: 18, fontWeight: 700, marginTop: 2 }}>
              {tp?.day_rate_cents != null
                ? formatMoney(clientRateCents(tp.day_rate_cents))
                : formatMoney(null)}
            </p>
          </div>
          <div style={{ paddingLeft: 12, borderLeft: `1px solid ${CARD_BORDER}` }}>
            <FieldLabel>Rate floor</FieldLabel>
            <p style={{ fontSize: 18, fontWeight: 700, marginTop: 2 }}>
              {tp?.rate_floor_cents != null
                ? formatMoney(clientRateCents(tp.rate_floor_cents))
                : formatMoney(null)}
            </p>
          </div>
        </div>
      </CardBlock>

      <CardBlock label="About">
        {tp?.bio ? (
          <p style={{ fontSize: 14, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{tp.bio}</p>
        ) : (
          <p style={{ fontSize: 13, color: TEXT_MUTED }}>No bio added yet</p>
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
          <FieldLabel>Showreel</FieldLabel>
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

      <button
        type="button"
        onClick={() =>
          restricted ? null : router.push(`/app/post-job?talent=${row.id}`)
        }
        disabled={restricted}
        title={
          restricted
            ? 'Account restricted — settle outstanding invoices to re-enable'
            : undefined
        }
        style={{
          width: '100%',
          marginTop: 16,
          padding: '14px 0',
          borderRadius: 12,
          background: restricted ? 'rgba(255,255,255,0.25)' : '#fff',
          color: restricted ? 'rgba(255,255,255,0.55)' : '#1A3C6B',
          border: 'none',
          fontSize: 13,
          fontWeight: 600,
          cursor: restricted ? 'not-allowed' : 'pointer',
        }}
      >
        {restricted ? 'Request disabled — account restricted' : 'Request for a job →'}
      </button>
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
      <FieldLabel>{label}</FieldLabel>
      <div style={{ marginTop: 6 }}>{children}</div>
    </div>
  )
}

function FieldLabel({ children }: { children: React.ReactNode }) {
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

'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useAuth } from '@/lib/auth-context'
import { Avatar } from '@/components/Avatar'
import { JobStatusBadge } from '@/components/StatusBadge'
import { PageShell, TEXT_MUTED, TEXT_PRIMARY } from '@/components/PageShell'
import { formatDateRange } from '@/lib/jobs'
import type { JobStatus } from '@/lib/job-status'

const CARD_BG = '#2E5099'
const CARD_BORDER = 'rgba(170,189,224,0.15)'

type ClientRow = {
  id: string
  first_name: string | null
  last_name: string | null
  full_name: string | null
  email: string | null
  phone: string | null
  city: string | null
  avatar_url: string | null
  created_at: string | null
  client_profiles:
    | {
        company_name: string | null
        industry: string | null
        website: string | null
        billing_email: string | null
      }
    | {
        company_name: string | null
        industry: string | null
        website: string | null
        billing_email: string | null
      }[]
    | null
}

type JobRow = {
  id: string
  title: string
  start_date: string | null
  end_date: string | null
  location: string | null
  status: JobStatus
}

function unwrap<T>(v: T | T[] | null): T | null {
  if (!v) return null
  return Array.isArray(v) ? v[0] ?? null : v
}

export default function AdminClientDetailPage() {
  const params = useParams<{ id: string }>()
  const { supabase } = useAuth()
  const id = params?.id

  const [row, setRow] = useState<ClientRow | null>(null)
  const [jobs, setJobs] = useState<JobRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!id) return
    let cancelled = false
    async function load() {
      const [clientRes, jobsRes] = await Promise.all([
        supabase
          .from('profiles')
          .select(
            `id, first_name, last_name, full_name, email, phone, city, avatar_url, created_at,
             client_profiles (company_name, industry, website, billing_email)`
          )
          .eq('id', id)
          .maybeSingle(),
        supabase
          .from('jobs')
          .select('id, title, start_date, end_date, location, status')
          .eq('client_id', id)
          .order('start_date', { ascending: false }),
      ])
      if (cancelled) return
      if (clientRes.error) {
        setError(clientRes.error.message)
        setLoading(false)
        return
      }
      setRow(clientRes.data as ClientRow | null)
      setJobs((jobsRes.data ?? []) as JobRow[])
      setLoading(false)
    }
    load()
    return () => {
      cancelled = true
    }
  }, [id, supabase])

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
    row.email ||
    'Unnamed'
  const cp = unwrap(row.client_profiles)

  return (
    <PageShell>
      <Link
        href="/app/clients"
        style={{
          fontSize: 11,
          color: TEXT_MUTED,
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          fontWeight: 600,
        }}
      >
        ← Clients
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
        {cp?.company_name && (
          <p style={{ fontSize: 13, color: TEXT_MUTED, marginTop: 4 }}>
            {cp.company_name}
            {cp.industry && ` · ${cp.industry}`}
          </p>
        )}
      </div>

      <CardBlock label="Contact">
        {row.email && <p style={{ fontSize: 14 }}>{row.email}</p>}
        {row.phone && (
          <p style={{ fontSize: 13, color: TEXT_MUTED, marginTop: 4 }}>{row.phone}</p>
        )}
        {row.city && (
          <p style={{ fontSize: 13, color: TEXT_MUTED, marginTop: 4 }}>{row.city}</p>
        )}
        {cp?.website && (
          <p style={{ fontSize: 13, color: TEXT_MUTED, marginTop: 4 }}>
            <a
              href={cp.website}
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: '#AABDE0', textDecoration: 'underline' }}
            >
              {cp.website}
            </a>
          </p>
        )}
        {cp?.billing_email && (
          <p style={{ fontSize: 13, color: TEXT_MUTED, marginTop: 4 }}>
            Billing: {cp.billing_email}
          </p>
        )}
      </CardBlock>

      <p
        style={{
          fontSize: 10,
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '0.1em',
          color: TEXT_MUTED,
          marginTop: 18,
          marginBottom: 8,
        }}
      >
        Jobs ({jobs.length})
      </p>

      {jobs.length === 0 && (
        <p style={{ fontSize: 13, color: TEXT_MUTED }}>No jobs posted yet.</p>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {jobs.map((j) => (
          <div
            key={j.id}
            style={{
              background: CARD_BG,
              border: `1px solid ${CARD_BORDER}`,
              borderRadius: 12,
              padding: '12px 14px',
              display: 'flex',
              alignItems: 'flex-start',
              gap: 10,
              justifyContent: 'space-between',
            }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 13, fontWeight: 600, color: TEXT_PRIMARY }}>
                {j.title}
              </p>
              {(j.start_date || j.location) && (
                <p style={{ fontSize: 11, color: TEXT_MUTED, marginTop: 2 }}>
                  {j.start_date && formatDateRange(j.start_date, j.end_date)}
                  {j.start_date && j.location && ' · '}
                  {j.location}
                </p>
              )}
            </div>
            <JobStatusBadge status={j.status} small />
          </div>
        ))}
      </div>
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
      <span
        style={{
          fontSize: 10,
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          color: TEXT_MUTED,
        }}
      >
        {label}
      </span>
      <div style={{ marginTop: 6 }}>{children}</div>
    </div>
  )
}

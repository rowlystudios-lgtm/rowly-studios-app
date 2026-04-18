'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useAuth } from '@/lib/auth-context'
import { Avatar } from '@/components/Avatar'
import { BookingStatusBadge } from '@/components/StatusBadge'
import type { BookingStatus } from '@/lib/job-status'
import { formatLongDate, greeting } from '@/lib/jobs'

const CARD_BG = '#2E5099'
const CARD_BORDER = 'rgba(170,189,224,0.15)'
const TEXT_PRIMARY = '#FFFFFF'
const TEXT_MUTED = '#AABDE0'

type Stats = {
  pending: number
  active: number
  talent: number
  clients: number
}

type ActivityProfile = {
  first_name: string | null
  last_name: string | null
  full_name: string | null
} | ActivityProfile[] | null

type ActivityJob =
  | { title: string | null }
  | { title: string | null }[]
  | null

type Activity = {
  id: string
  status: BookingStatus
  created_at: string
  profiles: ActivityProfile
  jobs: ActivityJob
}

function unwrap<T>(v: T | T[] | null): T | null {
  if (!v) return null
  return Array.isArray(v) ? v[0] ?? null : v
}

function talentName(p: ActivityProfile): string {
  const row = unwrap(p)
  if (!row) return 'Someone'
  if (Array.isArray(row)) return 'Someone'
  const composed = [row.first_name, row.last_name].filter(Boolean).join(' ')
  return composed || row.full_name || 'Someone'
}

export function AdminDashboard() {
  const { profile, supabase } = useAuth()
  const firstName =
    profile?.first_name ?? profile?.full_name?.split(' ')[0] ?? 'admin'
  const today = formatLongDate(new Date())

  const [stats, setStats] = useState<Stats>({
    pending: 0,
    active: 0,
    talent: 0,
    clients: 0,
  })
  const [activity, setActivity] = useState<Activity[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    async function load() {
      const [pendingRes, activeRes, talentRes, clientsRes, activityRes] =
        await Promise.all([
          supabase
            .from('jobs')
            .select('*', { count: 'exact', head: true })
            .eq('status', 'submitted'),
          supabase
            .from('jobs')
            .select('*', { count: 'exact', head: true })
            .in('status', ['crewing', 'confirmed']),
          supabase
            .from('profiles')
            .select('*', { count: 'exact', head: true })
            .eq('role', 'talent'),
          supabase
            .from('profiles')
            .select('*', { count: 'exact', head: true })
            .eq('role', 'client'),
          supabase
            .from('job_bookings')
            .select(
              `id, status, created_at,
               profiles!job_bookings_talent_id_fkey (first_name, last_name, full_name),
               jobs (title)`
            )
            .order('created_at', { ascending: false })
            .limit(5),
        ])

      if (cancelled) return

      setStats({
        pending: pendingRes.count ?? 0,
        active: activeRes.count ?? 0,
        talent: talentRes.count ?? 0,
        clients: clientsRes.count ?? 0,
      })
      setActivity((activityRes.data ?? []) as Activity[])
      setLoading(false)
    }

    load()
    return () => {
      cancelled = true
    }
  }, [supabase])

  return (
    <>
      <header style={{ marginBottom: 18 }}>
        <p style={{ fontSize: 18, fontWeight: 600, lineHeight: 1.2 }}>
          {greeting()}, {firstName}
        </p>
        <p style={{ fontSize: 12, color: TEXT_MUTED, marginTop: 2 }}>{today}</p>
      </header>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 10,
          marginBottom: 12,
        }}
      >
        <StatCard label="Pending approval" value={stats.pending} accent={stats.pending > 0} />
        <StatCard label="Active jobs" value={stats.active} />
        <StatCard label="Talent" value={stats.talent} />
        <StatCard label="Clients" value={stats.clients} />
      </div>

      {stats.pending > 0 && (
        <Link
          href="/app/jobs?filter=pending"
          style={{
            display: 'block',
            background: 'rgba(212,149,10,0.15)',
            border: '1px solid rgba(212,149,10,0.35)',
            borderRadius: 12,
            padding: '12px 14px',
            color: '#d4950a',
            fontSize: 13,
            fontWeight: 600,
            textDecoration: 'none',
            marginBottom: 16,
          }}
        >
          ⚠ {stats.pending} job{stats.pending === 1 ? '' : 's'} waiting for your review →
        </Link>
      )}

      <h2
        style={{
          fontSize: 11,
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '0.1em',
          color: TEXT_MUTED,
          marginTop: 8,
          marginBottom: 10,
        }}
      >
        Recent activity
      </h2>

      {loading && <p style={{ fontSize: 13, color: TEXT_MUTED }}>Loading…</p>}
      {!loading && activity.length === 0 && (
        <p style={{ fontSize: 13, color: TEXT_MUTED }}>No booking activity yet.</p>
      )}
      {!loading &&
        activity.map((a) => {
          const job = unwrap(a.jobs)
          const title = job && !Array.isArray(job) ? job.title ?? 'Job' : 'Job'
          return (
            <div
              key={a.id}
              style={{
                background: CARD_BG,
                border: `1px solid ${CARD_BORDER}`,
                borderRadius: 12,
                padding: '10px 14px',
                marginBottom: 8,
                display: 'flex',
                alignItems: 'center',
                gap: 10,
              }}
            >
              <Avatar
                url={null}
                name={talentName(a.profiles)}
                size={28}
                className="shrink-0"
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 13, fontWeight: 600 }}>
                  {talentName(a.profiles)}
                </p>
                <p
                  style={{
                    fontSize: 11,
                    color: TEXT_MUTED,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {title}
                </p>
              </div>
              <BookingStatusBadge status={a.status} />
            </div>
          )
        })}
    </>
  )
}

function StatCard({
  label,
  value,
  accent = false,
}: {
  label: string
  value: number
  accent?: boolean
}) {
  return (
    <div
      style={{
        background: CARD_BG,
        border: `1px solid ${accent ? 'rgba(212,149,10,0.45)' : CARD_BORDER}`,
        borderRadius: 12,
        padding: '14px 14px',
      }}
    >
      <p
        style={{
          fontSize: 10,
          color: TEXT_MUTED,
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          fontWeight: 600,
          marginBottom: 4,
        }}
      >
        {label}
      </p>
      <p
        style={{
          fontSize: 24,
          fontWeight: 700,
          color: accent ? '#d4950a' : TEXT_PRIMARY,
        }}
      >
        {value}
      </p>
    </div>
  )
}

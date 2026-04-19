'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useAuth } from '@/lib/auth-context'
import { JobStatusBadge } from '@/components/StatusBadge'
import {
  formatLongDate,
  greeting,
  summariseShootDays,
  type ShootDay,
} from '@/lib/jobs'
import type { JobStatus } from '@/lib/job-status'

const CARD_BG = '#2E5099'
const CARD_BORDER = 'rgba(170,189,224,0.15)'
const TEXT_PRIMARY = '#FFFFFF'
const TEXT_MUTED = '#AABDE0'

type JobSummary = {
  id: string
  title: string
  start_date: string | null
  end_date: string | null
  location: string | null
  status: JobStatus
  num_talent: number | null
  shoot_days: ShootDay[] | null
  call_time: string | null
}

type ClientRow = {
  company_name: string | null
  bio: string | null
}

export function ClientOverview() {
  const { user, profile, supabase } = useAuth()
  const [jobs, setJobs] = useState<JobSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [clientProfile, setClientProfile] = useState<ClientRow | null>(null)
  const [clientLoading, setClientLoading] = useState(true)
  const [setupDismissed, setSetupDismissed] = useState(false)

  const firstName =
    profile?.first_name ?? profile?.full_name?.split(' ')[0] ?? 'there'
  const today = formatLongDate(new Date())

  useEffect(() => {
    const uid = user?.id
    if (!uid) return
    let cancelled = false

    async function load() {
      const [jobsRes, clientRes] = await Promise.all([
        supabase
          .from('jobs')
          .select(
            'id, title, start_date, end_date, location, status, num_talent, shoot_days, call_time'
          )
          .eq('client_id', uid)
          .order('start_date', { ascending: false })
          .limit(10),
        supabase
          .from('client_profiles')
          .select('company_name, bio')
          .eq('id', uid)
          .maybeSingle(),
      ])

      if (cancelled) return
      if (jobsRes.error) {
        setError(jobsRes.error.message)
      } else {
        setJobs((jobsRes.data ?? []) as JobSummary[])
      }
      setClientProfile((clientRes.data as ClientRow | null) ?? { company_name: null, bio: null })
      setClientLoading(false)
      setLoading(false)
    }

    load()
    return () => {
      cancelled = true
    }
  }, [user?.id, supabase])

  const missing: string[] = []
  if (!clientProfile?.company_name) missing.push('Company name')
  if (!clientProfile?.bio) missing.push('About / bio')
  const showSetup = !clientLoading && !setupDismissed && missing.length > 0

  return (
    <>
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          marginBottom: 20,
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: 18, fontWeight: 600, lineHeight: 1.2 }}>
            {greeting()}, {firstName}
          </p>
          <p style={{ fontSize: 12, color: TEXT_MUTED, marginTop: 2 }}>{today}</p>
        </div>
      </header>

      {showSetup && (
        <div
          style={{
            position: 'relative',
            background: CARD_BG,
            border: `1px solid rgba(170,189,224,0.2)`,
            borderRadius: 14,
            padding: '14px 16px',
            marginBottom: 16,
          }}
        >
          <button
            type="button"
            onClick={() => setSetupDismissed(true)}
            aria-label="Dismiss"
            style={{
              position: 'absolute',
              top: 8,
              right: 8,
              width: 24,
              height: 24,
              borderRadius: 999,
              background: 'transparent',
              border: 'none',
              color: TEXT_MUTED,
              fontSize: 16,
              lineHeight: 1,
              cursor: 'pointer',
            }}
          >
            ×
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <span
              aria-hidden
              style={{
                width: 40,
                height: 40,
                borderRadius: 999,
                background: 'rgba(170,189,224,0.15)',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                color: '#fff',
              }}
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <rect x="3" y="6" width="18" height="14" rx="2" />
                <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
              </svg>
            </span>
            <p style={{ fontSize: 14, fontWeight: 600, color: TEXT_PRIMARY }}>
              Complete your profile
            </p>
          </div>
          <p style={{ fontSize: 12, color: TEXT_MUTED, lineHeight: 1.5, marginBottom: 8 }}>
            Add your company info so talent know who you are when you post a job.
          </p>
          <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 12px', display: 'flex', flexDirection: 'column', gap: 4 }}>
            {missing.map((m) => (
              <li
                key={m}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  fontSize: 12,
                  color: TEXT_MUTED,
                }}
              >
                <span
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: 999,
                    background: '#AABDE0',
                    flexShrink: 0,
                  }}
                />
                {m}
              </li>
            ))}
          </ul>
          <Link
            href="/app/account"
            style={{
              display: 'inline-block',
              padding: '9px 14px',
              borderRadius: 10,
              background: '#fff',
              color: '#1A3C6B',
              fontSize: 11,
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              textDecoration: 'none',
            }}
          >
            Set up profile →
          </Link>
        </div>
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
        My jobs
      </h2>

      {loading && <p style={{ fontSize: 13, color: TEXT_MUTED }}>Loading…</p>}
      {error && <p style={{ fontSize: 13, color: '#fca5a5' }}>{error}</p>}

      {!loading && !error && jobs.length === 0 && (
        <div
          style={{
            background: CARD_BG,
            border: `1px solid ${CARD_BORDER}`,
            borderRadius: 14,
            padding: '22px 20px',
            textAlign: 'center',
            marginBottom: 12,
          }}
        >
          <p style={{ fontSize: 14, marginBottom: 12 }}>
            You haven&apos;t posted any jobs yet.
          </p>
          <Link
            href="/app/post-job"
            style={{
              display: 'inline-block',
              padding: '10px 16px',
              borderRadius: 10,
              background: '#fff',
              color: '#1A3C6B',
              fontSize: 12,
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              textDecoration: 'none',
            }}
          >
            Post your first job →
          </Link>
        </div>
      )}

      {!loading &&
        !error &&
        jobs.map((job) => <JobRow key={job.id} job={job} />)}
    </>
  )
}

function JobRow({ job }: { job: JobSummary }) {
  const date = summariseShootDays(job)
  return (
    <div
      style={{
        background: CARD_BG,
        border: `1px solid ${CARD_BORDER}`,
        borderRadius: 14,
        padding: '14px 16px',
        marginBottom: 10,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: 10,
          justifyContent: 'space-between',
        }}
      >
        <h3
          style={{
            flex: 1,
            minWidth: 0,
            fontSize: 15,
            fontWeight: 600,
            color: TEXT_PRIMARY,
            lineHeight: 1.25,
          }}
        >
          {job.title}
        </h3>
        <JobStatusBadge status={job.status} small />
      </div>
      {(date || job.location) && (
        <p style={{ fontSize: 12, color: TEXT_MUTED, marginTop: 6 }}>
          {date}
          {date && job.location && ' · '}
          {job.location}
        </p>
      )}
      {typeof job.num_talent === 'number' && job.num_talent > 0 && (
        <p style={{ fontSize: 11, color: TEXT_MUTED, marginTop: 2 }}>
          Talent needed: {job.num_talent}
        </p>
      )}
    </div>
  )
}

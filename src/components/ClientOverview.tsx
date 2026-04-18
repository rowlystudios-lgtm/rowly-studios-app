'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useAuth } from '@/lib/auth-context'
import { JobStatusBadge } from '@/components/StatusBadge'
import { formatDateRange, formatLongDate, greeting } from '@/lib/jobs'
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
}

export function ClientOverview() {
  const { user, profile, supabase } = useAuth()
  const [jobs, setJobs] = useState<JobSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const firstName =
    profile?.first_name ?? profile?.full_name?.split(' ')[0] ?? 'there'
  const today = formatLongDate(new Date())

  useEffect(() => {
    const uid = user?.id
    if (!uid) return
    let cancelled = false

    async function load() {
      const { data, error } = await supabase
        .from('jobs')
        .select('id, title, start_date, end_date, location, status, num_talent')
        .eq('client_id', uid)
        .order('start_date', { ascending: false })
        .limit(10)

      if (cancelled) return
      if (error) {
        setError(error.message)
        setLoading(false)
        return
      }
      setJobs((data ?? []) as JobSummary[])
      setLoading(false)
    }

    load()
    return () => {
      cancelled = true
    }
  }, [user?.id, supabase])

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
  const date = job.start_date ? formatDateRange(job.start_date, job.end_date) : ''
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

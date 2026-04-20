import Link from 'next/link'
import {
  requireAdmin,
  centsToUsd,
  formatDate,
  formatDateShort,
  jobStatusStyle,
  invoiceStatusStyle,
} from '@/lib/admin-auth'

export const dynamic = 'force-dynamic'

export default async function AdminClientDetailPage({
  params,
}: {
  params: { id: string }
}) {
  const { supabase } = await requireAdmin()

  const [profileRes, clientRes, jobsRes, invoicesRes] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', params.id).maybeSingle(),
    supabase.from('client_profiles').select('*').eq('id', params.id).maybeSingle(),
    supabase
      .from('jobs')
      .select('id, title, status, start_date, end_date')
      .eq('client_id', params.id)
      .order('start_date', { ascending: false, nullsFirst: false }),
    supabase
      .from('invoices')
      .select('id, invoice_number, status, total_cents, due_date')
      .eq('client_id', params.id)
      .order('created_at', { ascending: false }),
  ])

  const profile = profileRes.data as unknown as {
    id: string
    first_name: string | null
    last_name: string | null
    full_name: string | null
    email: string | null
    phone: string | null
    avatar_url: string | null
    city: string | null
    verified: boolean
  } | null

  if (!profile) {
    return (
      <div style={{ padding: 20 }}>
        <p style={{ color: '#AABDE0' }}>Client not found.</p>
        <Link href="/admin/clients" style={{ color: '#F0A500' }}>
          ← Back to clients
        </Link>
      </div>
    )
  }

  const cp = clientRes.data as unknown as {
    company_name: string | null
    industry: string | null
    website: string | null
    billing_email: string | null
    bio: string | null
    logo_url: string | null
    entity_type: string | null
  } | null

  const jobs = (jobsRes.data ?? []) as unknown as Array<{
    id: string
    title: string
    status: string
    start_date: string | null
    end_date: string | null
  }>
  const invoices = (invoicesRes.data ?? []) as unknown as Array<{
    id: string
    invoice_number: string | null
    status: string
    total_cents: number | null
    due_date: string | null
  }>

  const displayName =
    cp?.company_name ||
    [profile.first_name, profile.last_name].filter(Boolean).join(' ') ||
    profile.full_name ||
    'Unnamed client'

  return (
    <div style={{ padding: '18px 18px', maxWidth: 640, margin: '0 auto' }}>
      <Link
        href="/admin/clients"
        style={{
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: '#AABDE0',
          textDecoration: 'none',
        }}
      >
        ← Clients
      </Link>

      {/* Header */}
      <div
        style={{
          marginTop: 12,
          display: 'flex',
          alignItems: 'center',
          gap: 14,
        }}
      >
        <div
          style={{
            width: 64,
            height: 64,
            borderRadius: 14,
            background: '#1E3A6B',
            color: '#fff',
            fontSize: 22,
            fontWeight: 700,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            overflow: 'hidden',
          }}
        >
          {cp?.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={cp.logo_url}
              alt=""
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          ) : (
            displayName.slice(0, 1).toUpperCase()
          )}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: '#fff' }}>
            {displayName}
          </h1>
          <p style={{ fontSize: 12, color: '#AABDE0', marginTop: 2 }}>
            {[cp?.industry, profile.city].filter(Boolean).join(' · ') || '—'}
          </p>
          {cp?.website && (
            <a
              href={cp.website.startsWith('http') ? cp.website : `https://${cp.website}`}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                fontSize: 12,
                color: '#F0A500',
                textDecoration: 'underline',
                marginTop: 4,
                display: 'inline-block',
              }}
            >
              {cp.website} ↗
            </a>
          )}
        </div>
      </div>

      {/* Contact card */}
      <section style={{ marginTop: 18 }}>
        <SectionLabel>Contact</SectionLabel>
        <div
          style={{
            background: '#1A2E4A',
            border: '1px solid rgba(170,189,224,0.15)',
            borderRadius: 12,
            padding: 14,
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
          }}
        >
          <DetailRow label="Email" value={profile.email ?? '—'} />
          <DetailRow label="Phone" value={profile.phone ?? '—'} />
          <DetailRow label="Billing email" value={cp?.billing_email ?? '—'} />
        </div>
      </section>

      {/* Jobs */}
      <section style={{ marginTop: 18 }}>
        <SectionLabel>Job history</SectionLabel>
        {jobs.length === 0 ? (
          <p style={{ fontSize: 13, color: '#7A90AA', fontStyle: 'italic' }}>
            No jobs for this client
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {jobs.map((j) => {
              const s = jobStatusStyle(j.status)
              const range =
                j.start_date && j.end_date && j.end_date !== j.start_date
                  ? `${formatDateShort(j.start_date)} – ${formatDateShort(j.end_date)}`
                  : formatDateShort(j.start_date)
              return (
                <Link
                  key={j.id}
                  href={`/admin/jobs/${j.id}`}
                  style={{
                    background: '#1A2E4A',
                    border: '1px solid rgba(170,189,224,0.15)',
                    borderRadius: 12,
                    padding: '10px 12px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 10,
                    textDecoration: 'none',
                    color: '#fff',
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p
                      style={{
                        fontSize: 13,
                        fontWeight: 600,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {j.title}
                    </p>
                    <p style={{ fontSize: 11, color: '#AABDE0', marginTop: 2 }}>
                      {range}
                    </p>
                  </div>
                  <span
                    style={{
                      padding: '3px 8px',
                      borderRadius: 999,
                      fontSize: 10,
                      fontWeight: 700,
                      letterSpacing: '0.06em',
                      textTransform: 'uppercase',
                      background: s.bg,
                      color: s.color,
                      flexShrink: 0,
                    }}
                  >
                    {s.label}
                  </span>
                </Link>
              )
            })}
          </div>
        )}
      </section>

      {/* Invoices */}
      <section style={{ marginTop: 18 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 10,
          }}
        >
          <SectionLabel>Invoices</SectionLabel>
          <Link
            href={`/admin/finance?client=${profile.id}`}
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: '#F0A500',
              textDecoration: 'none',
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
            }}
          >
            + Create
          </Link>
        </div>
        {invoices.length === 0 ? (
          <p style={{ fontSize: 13, color: '#7A90AA', fontStyle: 'italic' }}>
            No invoices for this client
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {invoices.map((inv) => {
              const s = invoiceStatusStyle(inv.status)
              return (
                <Link
                  key={inv.id}
                  href={`/admin/finance/${inv.id}`}
                  style={{
                    background: '#1A2E4A',
                    border: '1px solid rgba(170,189,224,0.15)',
                    borderRadius: 12,
                    padding: '10px 12px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 10,
                    textDecoration: 'none',
                    color: '#fff',
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 13, fontWeight: 700 }}>
                      {inv.invoice_number}
                    </p>
                    <p style={{ fontSize: 11, color: '#AABDE0', marginTop: 2 }}>
                      {centsToUsd(inv.total_cents)}
                      {inv.due_date && ` · due ${formatDate(inv.due_date)}`}
                    </p>
                  </div>
                  <span
                    style={{
                      padding: '3px 8px',
                      borderRadius: 999,
                      fontSize: 10,
                      fontWeight: 700,
                      letterSpacing: '0.06em',
                      textTransform: 'uppercase',
                      background: s.bg,
                      color: s.color,
                      flexShrink: 0,
                    }}
                  >
                    {s.label}
                  </span>
                </Link>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p
      style={{
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: '0.14em',
        textTransform: 'uppercase',
        color: '#7A90AA',
        marginBottom: 10,
      }}
    >
      {children}
    </p>
  )
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        gap: 10,
      }}
    >
      <span
        style={{
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: '#AABDE0',
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontSize: 13,
          color: '#fff',
          textAlign: 'right',
          wordBreak: 'break-word',
        }}
      >
        {value}
      </span>
    </div>
  )
}

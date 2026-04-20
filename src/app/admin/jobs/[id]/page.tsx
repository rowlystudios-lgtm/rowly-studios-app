import Link from 'next/link'
import { redirect } from 'next/navigation'
import { requireAdmin, centsToUsd, formatDate } from '@/lib/admin-auth'
import { StatusBadge } from '@/components/StatusBadge'

export const dynamic = 'force-dynamic'

type ClientProfileRow = {
  first_name: string | null
  last_name: string | null
  full_name: string | null
  client_profiles:
    | { company_name: string | null }
    | { company_name: string | null }[]
    | null
}

function clientDisplay(raw: ClientProfileRow | ClientProfileRow[] | null): string {
  const p = Array.isArray(raw) ? raw[0] : raw
  if (!p) return 'Unknown client'
  const cp = Array.isArray(p.client_profiles) ? p.client_profiles[0] : p.client_profiles
  return (
    cp?.company_name ||
    [p.first_name, p.last_name].filter(Boolean).join(' ') ||
    p.full_name ||
    'Unknown client'
  )
}

type TalentRow = {
  first_name: string | null
  last_name: string | null
  full_name: string | null
}

function talentDisplay(raw: TalentRow | TalentRow[] | null): string {
  const p = Array.isArray(raw) ? raw[0] : raw
  if (!p) return 'Someone'
  return (
    [p.first_name, p.last_name].filter(Boolean).join(' ') ||
    p.full_name ||
    'Someone'
  )
}

export default async function AdminJobDetailPage({
  params,
}: {
  params: { id: string }
}) {
  const { supabase, user } = await requireAdmin()

  const [jobRes, bookingsRes, invoiceRes] = await Promise.all([
    supabase
      .from('jobs')
      .select(
        `*,
         profiles!jobs_client_id_fkey (id, first_name, last_name, full_name,
           client_profiles (company_name))`
      )
      .eq('id', params.id)
      .maybeSingle(),
    supabase
      .from('job_bookings')
      .select(
        `id, status, confirmed_rate_cents, paid, notes,
         profiles!job_bookings_talent_id_fkey (id, first_name, last_name, full_name,
           avatar_url, talent_profiles (department, primary_role))`
      )
      .eq('job_id', params.id)
      .order('created_at', { ascending: true }),
    supabase
      .from('invoices')
      .select('id, invoice_number, status, total_cents, due_date')
      .eq('job_id', params.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])

  const job = jobRes.data as unknown as
    | (Record<string, unknown> & {
        id: string
        title: string
        status: string
        description: string | null
        admin_notes: string | null
        client_notes: string | null
        location: string | null
        address_line: string | null
        address_city: string | null
        address_state: string | null
        start_date: string | null
        end_date: string | null
        day_rate_cents: number | null
        num_talent: number | null
        shoot_days: Array<{ date: string; call_time: string | null }> | null
        client_id: string | null
        profiles: Parameters<typeof clientDisplay>[0]
      })
    | null

  if (!job) {
    return (
      <div style={{ padding: 20 }}>
        <p style={{ color: '#AABDE0' }}>Job not found.</p>
        <Link href="/admin/jobs" style={{ color: '#F0A500' }}>
          ← Back to jobs
        </Link>
      </div>
    )
  }

  const bookings = (bookingsRes.data ?? []) as unknown as Array<{
    id: string
    status: string
    confirmed_rate_cents: number | null
    paid: boolean | null
    notes: string | null
    profiles:
      | {
          id: string
          first_name: string | null
          last_name: string | null
          full_name: string | null
          avatar_url: string | null
          talent_profiles:
            | { department: string | null; primary_role: string | null }
            | { department: string | null; primary_role: string | null }[]
            | null
        }
      | {
          id: string
          first_name: string | null
          last_name: string | null
          full_name: string | null
          avatar_url: string | null
          talent_profiles:
            | { department: string | null; primary_role: string | null }
            | { department: string | null; primary_role: string | null }[]
            | null
        }[]
      | null
  }>

  const invoice = invoiceRes.data as unknown as {
    id: string
    invoice_number: string | null
    status: string
    total_cents: number | null
    due_date: string | null
  } | null

  const range =
    job.start_date && job.end_date && job.end_date !== job.start_date
      ? `${formatDate(job.start_date)} – ${formatDate(job.end_date)}`
      : formatDate(job.start_date)
  const loc =
    [job.address_city, job.address_state].filter(Boolean).join(', ') ||
    job.location ||
    ''

  async function generateInvoice(formData: FormData) {
    'use server'
    const { supabase: sb, user: u } = await requireAdmin()
    const jobId = formData.get('jobId') as string
    if (!jobId) return

    // Generate a simple sequential invoice number.
    const { count } = await sb
      .from('invoices')
      .select('id', { count: 'exact', head: true })
    const next = (count ?? 0) + 1
    const invoiceNumber = `RS-INV-${String(next).padStart(4, '0')}`

    // Due date: 14 days from today.
    const due = new Date()
    due.setDate(due.getDate() + 14)
    const dueIso = `${due.getFullYear()}-${String(due.getMonth() + 1).padStart(
      2,
      '0'
    )}-${String(due.getDate()).padStart(2, '0')}`

    const { data: jobRow } = await sb
      .from('jobs')
      .select('client_id')
      .eq('id', jobId)
      .maybeSingle()

    const { data: inv, error } = await sb
      .from('invoices')
      .insert({
        job_id: jobId,
        client_id: jobRow?.client_id ?? null,
        invoice_number: invoiceNumber,
        status: 'draft',
        total_cents: 0,
        due_date: dueIso,
        created_by: u.id,
      })
      .select('id')
      .single()

    if (error || !inv) return
    redirect(`/admin/finance/${inv.id}`)
  }

  return (
    <div style={{ padding: '18px 18px', maxWidth: 640, margin: '0 auto' }}>
      <Link
        href="/admin/jobs"
        style={{
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: '#AABDE0',
          textDecoration: 'none',
        }}
      >
        ← Jobs
      </Link>

      {/* Header */}
      <div
        style={{
          marginTop: 10,
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 10,
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: '#fff' }}>{job.title}</h1>
          <p style={{ fontSize: 12, color: '#AABDE0', marginTop: 4 }}>
            {clientDisplay(job.profiles)}
            {range && range !== '—' && ` · ${range}`}
            {loc && ` · ${loc}`}
          </p>
        </div>
        <StatusBadge status={job.status} />
      </div>

      {/* Talent booked */}
      <section style={{ marginTop: 18 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 10,
          }}
        >
          <SectionLabel>Talent booked</SectionLabel>
          <Link
            href="/admin/talent"
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: '#F0A500',
              textDecoration: 'none',
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
            }}
          >
            + Add
          </Link>
        </div>
        {bookings.length === 0 ? (
          <p style={{ fontSize: 13, color: '#7A90AA', fontStyle: 'italic' }}>
            No talent assigned yet
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {bookings.map((b) => {
              const talent = Array.isArray(b.profiles) ? b.profiles[0] : b.profiles
              const tp = Array.isArray(talent?.talent_profiles)
                ? talent?.talent_profiles[0]
                : talent?.talent_profiles
              const role = tp?.primary_role ?? tp?.department ?? null
              return (
                <div
                  key={b.id}
                  style={{
                    background: '#1A2E4A',
                    border: '1px solid rgba(170,189,224,0.15)',
                    borderRadius: 12,
                    padding: '10px 12px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                  }}
                >
                  <div
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 999,
                      background: '#1E3A6B',
                      color: '#fff',
                      fontSize: 12,
                      fontWeight: 700,
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                      overflow: 'hidden',
                    }}
                  >
                    {talent?.avatar_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={talent.avatar_url}
                        alt=""
                        style={{
                          width: '100%',
                          height: '100%',
                          objectFit: 'cover',
                        }}
                      />
                    ) : (
                      talentDisplay(talent ?? null).slice(0, 1).toUpperCase()
                    )}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 13, fontWeight: 600, color: '#fff' }}>
                      {talentDisplay(talent ?? null)}
                    </p>
                    <p style={{ fontSize: 11, color: '#AABDE0', marginTop: 2 }}>
                      {role ?? 'Talent'}
                      {b.confirmed_rate_cents != null &&
                        ` · ${centsToUsd(b.confirmed_rate_cents)}/day`}
                    </p>
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 4,
                      alignItems: 'flex-end',
                      flexShrink: 0,
                    }}
                  >
                    <StatusBadge status={b.status} size="sm" />
                    {b.paid && (
                      <span
                        style={{
                          fontSize: 9,
                          fontWeight: 700,
                          letterSpacing: '0.08em',
                          textTransform: 'uppercase',
                          color: '#4ADE80',
                        }}
                      >
                        Paid
                      </span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </section>

      {/* Job details */}
      <section style={{ marginTop: 18 }}>
        <SectionLabel>Job details</SectionLabel>
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
          <DetailRow label="Day rate" value={centsToUsd(job.day_rate_cents)} />
          <DetailRow
            label="Num talent"
            value={
              job.num_talent != null && job.num_talent > 0 ? String(job.num_talent) : '—'
            }
          />
          <DetailRow
            label="Shoot days"
            value={
              Array.isArray(job.shoot_days) && job.shoot_days.length > 0
                ? job.shoot_days.map((d) => d.date).join(', ')
                : '—'
            }
          />
          {job.description && (
            <DetailRow label="Description" value={job.description} multiline />
          )}
          {job.client_notes && (
            <DetailRow label="Client notes" value={job.client_notes} multiline />
          )}
          {job.admin_notes && (
            <DetailRow label="Admin notes" value={job.admin_notes} multiline />
          )}
        </div>
      </section>

      {/* Invoice */}
      <section style={{ marginTop: 18 }}>
        <SectionLabel>Invoice</SectionLabel>
        {invoice ? (
          <Link
            href={`/admin/finance/${invoice.id}`}
            style={{
              background: '#1A2E4A',
              border: '1px solid rgba(170,189,224,0.15)',
              borderRadius: 12,
              padding: '12px 14px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 10,
              textDecoration: 'none',
              color: '#fff',
            }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 13, fontWeight: 700 }}>{invoice.invoice_number}</p>
              <p style={{ fontSize: 11, color: '#AABDE0', marginTop: 2 }}>
                {centsToUsd(invoice.total_cents)}
                {invoice.due_date && ` · due ${formatDate(invoice.due_date)}`}
              </p>
            </div>
            <StatusBadge status={invoice.status} size="sm" />
          </Link>
        ) : (
          <form action={generateInvoice}>
            <input type="hidden" name="jobId" value={job.id} />
            <div
              style={{
                background: '#1A2E4A',
                border: '1px solid rgba(170,189,224,0.15)',
                borderRadius: 12,
                padding: 14,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 10,
              }}
            >
              <p style={{ fontSize: 13, color: '#AABDE0' }}>No invoice yet</p>
              <button
                type="submit"
                style={{
                  padding: '8px 12px',
                  borderRadius: 10,
                  background: '#F0A500',
                  color: '#0F1B2E',
                  border: 'none',
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: '0.04em',
                  textTransform: 'uppercase',
                  cursor: 'pointer',
                }}
              >
                Generate
              </button>
            </div>
          </form>
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

function DetailRow({
  label,
  value,
  multiline,
}: {
  label: string
  value: string
  multiline?: boolean
}) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: multiline ? 'column' : 'row',
        gap: multiline ? 4 : 10,
        alignItems: multiline ? 'flex-start' : 'flex-start',
        justifyContent: 'space-between',
      }}
    >
      <span
        style={{
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: '#AABDE0',
          flexShrink: 0,
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontSize: 13,
          color: '#fff',
          textAlign: multiline ? 'left' : 'right',
          whiteSpace: multiline ? 'pre-wrap' : 'normal',
          wordBreak: 'break-word',
        }}
      >
        {value}
      </span>
    </div>
  )
}


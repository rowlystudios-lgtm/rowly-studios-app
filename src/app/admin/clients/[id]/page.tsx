import Link from 'next/link'
import { requireAdmin, centsToUsd, formatDate } from '@/lib/admin-auth'
import { StatusBadge } from '@/components/StatusBadge'
import { ClientAdminControls } from './ClientAdminControls'

export const dynamic = 'force-dynamic'

function dateDayMonth(iso: string | null): { day: string; month: string } {
  if (!iso) return { day: '—', month: '' }
  const parts = iso.split('-').map(Number)
  if (parts.length !== 3 || parts.some(Number.isNaN)) return { day: '—', month: '' }
  const d = new Date(parts[0], parts[1] - 1, parts[2])
  return {
    day: String(d.getDate()),
    month: d.toLocaleString('en-US', { month: 'short' }).toUpperCase(),
  }
}

function formatShort(iso: string | null): string {
  if (!iso) return ''
  const parts = iso.split('-').map(Number)
  if (parts.length !== 3 || parts.some(Number.isNaN)) return ''
  const d = new Date(parts[0], parts[1] - 1, parts[2])
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function initials(raw: string): string {
  const parts = raw.trim().split(/\s+/).slice(0, 2)
  return parts.map((p) => p[0]?.toUpperCase() ?? '').join('') || '?'
}

function entityLabel(type: string | null | undefined): string | null {
  if (!type) return null
  const map: Record<string, string> = {
    llc: 'LLC',
    corp: 'Corp',
    corporation: 'Corp',
    sole_prop: 'Sole prop',
    individual: 'Individual',
    other: 'Other',
  }
  return map[type.toLowerCase()] ?? type
}

type Profile = {
  id: string
  email: string | null
  phone: string | null
  city: string | null
  avatar_url: string | null
  full_name: string | null
  verified: boolean
  verified_at: string | null
  created_at: string | null
}

type ClientProfileRow = {
  company_name: string | null
  industry: string | null
  website: string | null
  billing_email: string | null
  bio: string | null
  logo_url: string | null
  entity_type: string | null
  admin_notes: string | null
}

type JobRow = {
  id: string
  title: string
  status: string
  start_date: string | null
  end_date: string | null
  location: string | null
  day_rate_cents: number | null
  num_talent: number | null
  job_bookings: Array<{ id: string; status: string; paid: boolean | null }> | null
}

type InvoiceRow = {
  id: string
  invoice_number: string | null
  status: string
  total_cents: number | null
  due_date: string | null
  sent_at: string | null
  paid_at: string | null
  created_at: string | null
}

export default async function AdminClientDetailPage({
  params,
}: {
  params: { id: string }
}) {
  const { supabase } = await requireAdmin()

  const [profileRes, clientRes, jobsRes, invoicesRes] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', params.id).maybeSingle(),
    supabase
      .from('client_profiles')
      .select('*')
      .eq('id', params.id)
      .maybeSingle(),
    supabase
      .from('jobs')
      .select(
        `id, title, status, start_date, end_date, location, day_rate_cents,
         num_talent,
         job_bookings (id, status, paid)`
      )
      .eq('client_id', params.id)
      .order('start_date', { ascending: false, nullsFirst: false }),
    supabase
      .from('invoices')
      .select(
        `id, invoice_number, status, total_cents, due_date,
         sent_at, paid_at, created_at`
      )
      .eq('client_id', params.id)
      .order('created_at', { ascending: false }),
  ])

  const profile = profileRes.data as unknown as Profile | null
  if (!profile) {
    return (
      <div className="px-5 pt-5">
        <Link href="/admin/clients" style={{ color: '#7A90AA', fontSize: 13 }}>
          ← Clients
        </Link>
        <p
          className="mt-3"
          style={{ fontSize: 14, color: '#AABDE0', fontStyle: 'italic' }}
        >
          Client not found.
        </p>
      </div>
    )
  }

  const cp = (clientRes.data ?? null) as unknown as ClientProfileRow | null
  const jobs = (jobsRes.data ?? []) as unknown as JobRow[]
  const invoices = (invoicesRes.data ?? []) as InvoiceRow[]

  const displayName = cp?.company_name || profile.full_name || 'Unnamed client'
  const ent = entityLabel(cp?.entity_type ?? null)
  const logo = cp?.logo_url ?? profile.avatar_url

  // Financial summary
  let paidCents = 0
  let outstandingCents = 0
  let overdueCents = 0
  let draftCount = 0
  for (const i of invoices) {
    const total = i.total_cents ?? 0
    if (i.status === 'paid') paidCents += total
    else if (i.status === 'sent' || i.status === 'overdue') {
      outstandingCents += total
      if (i.status === 'overdue') overdueCents += total
    } else if (i.status === 'draft') draftCount += 1
  }

  const showBilling =
    cp?.billing_email && cp.billing_email !== (profile.email ?? '').toLowerCase()

  return (
    <div className="mx-auto" style={{ maxWidth: 720, padding: '20px 18px 28px' }}>
      <Link href="/admin/clients" style={{ fontSize: 13, color: '#7A90AA', textDecoration: 'none' }}>
        ← Clients
      </Link>

      {/* Header card */}
      <section
        className="mt-3 rounded-xl bg-[#1A2E4A] border border-white/5"
        style={{ padding: 20 }}
      >
        <div className="flex items-start gap-4">
          <div
            className="rounded-full overflow-hidden"
            style={{
              width: 72,
              height: 72,
              background: '#1E3A6B',
              color: '#fff',
              fontSize: 24,
              fontWeight: 700,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            {logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={logo}
                alt=""
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
            ) : (
              initials(displayName)
            )}
          </div>

          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="flex items-center gap-2 flex-wrap">
              <h1
                className="text-white"
                style={{ fontSize: 20, fontWeight: 600, lineHeight: 1.2 }}
              >
                {displayName}
              </h1>
              {ent && (
                <span
                  className="rounded-full"
                  style={{
                    padding: '2px 8px',
                    fontSize: 10,
                    fontWeight: 700,
                    letterSpacing: '0.1em',
                    textTransform: 'uppercase',
                    background: 'rgba(170,189,224,0.12)',
                    color: '#AABDE0',
                    border: '1px solid rgba(170,189,224,0.25)',
                  }}
                >
                  {ent}
                </span>
              )}
            </div>
            {cp?.industry && (
              <p style={{ fontSize: 14, color: '#AABDE0', marginTop: 2 }}>
                {cp.industry}
              </p>
            )}
            {profile.city && (
              <p style={{ fontSize: 13, color: '#7A90AA', marginTop: 1 }}>
                {profile.city}
              </p>
            )}
            <div className="flex flex-wrap gap-2 mt-2">
              <StatusBadge
                status={profile.verified ? 'verified' : 'pending'}
                size="sm"
                label={profile.verified ? 'Verified' : 'Unverified'}
              />
              {cp?.industry && (
                <span
                  className="rounded-full"
                  style={{
                    padding: '3px 8px',
                    fontSize: 10,
                    fontWeight: 700,
                    letterSpacing: '0.06em',
                    textTransform: 'uppercase',
                    background: 'rgba(59,130,246,0.18)',
                    color: '#93C5FD',
                    border: '1px solid rgba(59,130,246,0.35)',
                  }}
                >
                  {cp.industry}
                </span>
              )}
            </div>
          </div>

          <Link
            href={`/admin/clients/${profile.id}/edit`}
            style={{
              fontSize: 13,
              color: '#AABDE0',
              textDecoration: 'underline',
              marginLeft: 'auto',
              flexShrink: 0,
            }}
          >
            Edit
          </Link>
        </div>

        {(profile.email || profile.phone || cp?.website || showBilling) && (
          <div
            className="flex flex-wrap gap-x-6 gap-y-2 mt-4 pt-4"
            style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }}
          >
            {profile.email && (
              <a
                href={`mailto:${profile.email}`}
                className="inline-flex items-center gap-1.5"
                style={{ fontSize: 13, color: '#AABDE0', textDecoration: 'underline' }}
              >
                <span aria-hidden>✉︎</span>
                {profile.email}
              </a>
            )}
            {profile.phone && (
              <a
                href={`tel:${profile.phone}`}
                className="inline-flex items-center gap-1.5"
                style={{ fontSize: 13, color: '#AABDE0', textDecoration: 'underline' }}
              >
                <span aria-hidden>☎</span>
                {profile.phone}
              </a>
            )}
            {showBilling && (
              <span className="inline-flex flex-col">
                <span style={{ fontSize: 10, color: '#7A90AA', letterSpacing: '0.12em', textTransform: 'uppercase' }}>
                  Billing
                </span>
                <a
                  href={`mailto:${cp?.billing_email}`}
                  style={{ fontSize: 13, color: '#AABDE0', textDecoration: 'underline' }}
                >
                  {cp?.billing_email}
                </a>
              </span>
            )}
            {cp?.website && (
              <a
                href={cp.website.startsWith('http') ? cp.website : `https://${cp.website}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5"
                style={{ fontSize: 13, color: '#AABDE0', textDecoration: 'underline' }}
              >
                <span aria-hidden>↗</span>
                {cp.website}
              </a>
            )}
          </div>
        )}

        {cp?.bio && (
          <p
            className="mt-4"
            style={{
              fontSize: 14,
              color: '#C5D3E8',
              lineHeight: 1.55,
              fontStyle: 'italic',
            }}
          >
            “{cp.bio}”
          </p>
        )}
      </section>

      {/* Financial summary */}
      <section className="mt-4 flex gap-3">
        <SummaryChip label="Total paid" value={centsToUsd(paidCents)} tone="green" />
        <SummaryChip
          label="Outstanding"
          value={centsToUsd(outstandingCents)}
          tone={outstandingCents > 0 ? 'amber' : 'default'}
        />
        <SummaryChip
          label="Overdue"
          value={centsToUsd(overdueCents)}
          tone={overdueCents > 0 ? 'red' : 'default'}
        />
        <SummaryChip label="Total jobs" value={String(jobs.length)} />
      </section>

      {/* Action row */}
      <section className="mt-4 flex flex-wrap gap-3">
        <Link
          href={`/admin/jobs/new?client=${profile.id}`}
          className="rounded-xl bg-[#1E3A6B] hover:bg-[#253D8A] text-white transition-colors"
          style={{
            padding: '10px 16px',
            fontSize: 14,
            fontWeight: 500,
            textDecoration: 'none',
          }}
        >
          + New job for this client
        </Link>
        <Link
          href={`/admin/finance/new?client=${profile.id}`}
          className="rounded-xl"
          style={{
            padding: '10px 16px',
            fontSize: 14,
            fontWeight: 500,
            background: '#253D5E',
            color: '#AABDE0',
            border: '1px solid rgba(255,255,255,0.1)',
            textDecoration: 'none',
          }}
        >
          + Create invoice
        </Link>
      </section>

      {/* Job history */}
      <section className="mt-5">
        <div className="flex items-center justify-between mb-2">
          <p
            style={{
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              color: '#7A90AA',
            }}
          >
            Job history
          </p>
          <span style={{ fontSize: 11, color: '#7A90AA' }}>
            {jobs.length} total
          </span>
        </div>

        {jobs.length === 0 ? (
          <div
            className="rounded-xl bg-[#1A2E4A] border border-white/5 text-center"
            style={{ padding: '22px 18px' }}
          >
            <p style={{ fontSize: 13, color: '#7A90AA' }}>
              No jobs yet for this client.
            </p>
            <Link
              href={`/admin/jobs/new?client=${profile.id}`}
              className="inline-block mt-3 rounded-lg bg-[#1E3A6B] hover:bg-[#253D8A] text-white transition-colors"
              style={{
                padding: '8px 16px',
                fontSize: 12,
                fontWeight: 600,
                textDecoration: 'none',
                letterSpacing: '0.04em',
                textTransform: 'uppercase',
              }}
            >
              + Create first job
            </Link>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {jobs.map((j) => {
              const dm = dateDayMonth(j.start_date)
              const bookings = Array.isArray(j.job_bookings) ? j.job_bookings : []
              const confirmed = bookings.filter(
                (b) => b.status === 'confirmed'
              ).length
              const allPaid =
                bookings.length > 0 && bookings.every((b) => b.paid === true)
              return (
                <Link
                  key={j.id}
                  href={`/admin/jobs/${j.id}`}
                  className="block rounded-xl"
                  style={{
                    background: '#253D5E',
                    padding: 14,
                    border: '1px solid rgba(255,255,255,0.05)',
                    textDecoration: 'none',
                  }}
                >
                  <div className="flex items-start gap-3">
                    <div
                      className="flex flex-col items-center justify-center rounded-lg"
                      style={{
                        width: 48,
                        minHeight: 52,
                        background: '#0F1B2E',
                        flexShrink: 0,
                      }}
                    >
                      <span
                        className="text-white"
                        style={{ fontSize: 18, fontWeight: 700, lineHeight: 1 }}
                      >
                        {dm.day}
                      </span>
                      <span
                        style={{
                          fontSize: 10,
                          color: '#7A90AA',
                          letterSpacing: '0.12em',
                          marginTop: 2,
                        }}
                      >
                        {dm.month}
                      </span>
                    </div>

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p
                        className="text-white"
                        style={{
                          fontSize: 14,
                          fontWeight: 500,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {j.title}
                      </p>
                      {j.location && (
                        <p
                          style={{
                            fontSize: 12,
                            color: '#7A90AA',
                            marginTop: 1,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {j.location}
                        </p>
                      )}
                      <p style={{ fontSize: 12, color: '#AABDE0', marginTop: 2 }}>
                        {confirmed}/{j.num_talent ?? '?'} talent confirmed
                      </p>
                    </div>

                    <div
                      className="flex flex-col items-end gap-1"
                      style={{ flexShrink: 0 }}
                    >
                      <StatusBadge status={j.status} size="sm" />
                      {j.day_rate_cents != null && (
                        <span style={{ fontSize: 12, color: '#AABDE0' }}>
                          {centsToUsd(j.day_rate_cents)}/day
                        </span>
                      )}
                      {allPaid && (
                        <span
                          className="rounded-full"
                          style={{
                            padding: '2px 8px',
                            fontSize: 9,
                            fontWeight: 700,
                            letterSpacing: '0.08em',
                            textTransform: 'uppercase',
                            background: 'rgba(16,185,129,0.2)',
                            color: '#10B981',
                            border: '1px solid rgba(16,185,129,0.3)',
                          }}
                        >
                          Paid
                        </span>
                      )}
                    </div>
                  </div>
                </Link>
              )
            })}
          </div>
        )}
      </section>

      {/* Invoices */}
      <section className="mt-5">
        <div className="flex items-center justify-between mb-2">
          <p
            style={{
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              color: '#7A90AA',
            }}
          >
            Invoices
          </p>
          <Link
            href={`/admin/finance/new?client=${profile.id}`}
            className="text-amber-400 hover:text-amber-300"
            style={{
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: '0.04em',
              textDecoration: 'none',
            }}
          >
            + New invoice
          </Link>
        </div>

        {invoices.length === 0 ? (
          <p style={{ fontSize: 13, color: '#7A90AA', fontStyle: 'italic' }}>
            No invoices yet.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {invoices.map((i) => {
              const dueLabel =
                i.status === 'paid'
                  ? `Paid ${formatShort(i.paid_at ?? null) || ''}`
                  : i.due_date
                  ? `Due ${formatShort(i.due_date)}`
                  : ''
              const dueColor = i.status === 'paid' ? '#4ADE80' : i.status === 'overdue' ? '#F87171' : '#7A90AA'
              return (
                <Link
                  key={i.id}
                  href={`/admin/finance/${i.id}`}
                  className="block rounded-xl bg-[#1A2E4A] border border-white/5 hover:border-white/10 transition-colors"
                  style={{ padding: 14, textDecoration: 'none' }}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="flex items-center gap-2">
                        <p
                          className="text-white"
                          style={{
                            fontSize: 14,
                            fontWeight: 500,
                          }}
                        >
                          {i.invoice_number ?? 'Draft invoice'}
                        </p>
                        <StatusBadge status={i.status} size="sm" />
                      </div>
                      <p style={{ fontSize: 12, color: '#AABDE0', marginTop: 2 }}>
                        {centsToUsd(i.total_cents)}
                      </p>
                    </div>
                    <span
                      style={{
                        fontSize: 12,
                        color: dueColor,
                        whiteSpace: 'nowrap',
                        flexShrink: 0,
                      }}
                    >
                      {dueLabel}
                    </span>
                  </div>
                </Link>
              )
            })}
          </div>
        )}
      </section>

      {/* Admin controls */}
      <section
        className="mt-5 rounded-xl bg-[#1A2E4A] border border-white/5"
        style={{ padding: 16 }}
      >
        <p
          style={{
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            color: '#7A90AA',
            marginBottom: 14,
          }}
        >
          Admin
        </p>
        <ClientAdminControls
          clientId={profile.id}
          verified={profile.verified}
          adminNotes={cp?.admin_notes ?? null}
        />
      </section>

      <div className="mt-6 text-center">
        <Link
          href={`/admin/clients/${profile.id}/edit`}
          style={{
            fontSize: 12,
            color: '#7A90AA',
            textDecoration: 'underline',
          }}
        >
          Edit full profile →
        </Link>
      </div>
    </div>
  )
}

function SummaryChip({
  label,
  value,
  tone = 'default',
}: {
  label: string
  value: string
  tone?: 'default' | 'amber' | 'green' | 'red'
}) {
  const color =
    tone === 'amber'
      ? '#F0A500'
      : tone === 'green'
      ? '#4ADE80'
      : tone === 'red'
      ? '#F87171'
      : '#fff'
  return (
    <div
      className="rounded-xl"
      style={{
        background: '#0F1B2E',
        padding: 12,
        flex: 1,
        textAlign: 'center',
        border: '1px solid rgba(255,255,255,0.05)',
      }}
    >
      <p style={{ fontSize: 18, fontWeight: 600, color, lineHeight: 1 }}>
        {value}
      </p>
      <p
        style={{
          fontSize: 10,
          color: '#7A90AA',
          textTransform: 'uppercase',
          letterSpacing: '0.14em',
          marginTop: 4,
          fontWeight: 700,
        }}
      >
        {label}
      </p>
    </div>
  )
}

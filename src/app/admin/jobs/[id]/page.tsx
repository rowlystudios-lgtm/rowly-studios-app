import Link from 'next/link'
import { requireAdmin, centsToUsd, formatDate } from '@/lib/admin-auth'
import { StatusBadge } from '@/components/StatusBadge'
import { JobCodePill } from '@/components/JobCodePill'
import { generateInvoice } from '../actions'
import { StatusActionButtons } from './StatusActionButtons'
import { BookingAdminActions } from './BookingAdminActions'
import { AdminBudgetRow } from './AdminBudgetRow'
import { CallSheetButtons } from './CallSheetButtons'
import { AddToCalendarButton } from '@/components/AddToCalendarButton'

export const dynamic = 'force-dynamic'

function formatRange(start: string | null, end: string | null): string {
  if (!start) return '—'
  if (!end || end === start) return formatDate(start)
  return `${formatDate(start)} – ${formatDate(end)}`
}

function formatCall(time: string | null): string | null {
  if (!time) return null
  return time.slice(0, 5)
}

function unwrap<T>(v: T | T[] | null | undefined): T | null {
  if (v == null) return null
  return Array.isArray(v) ? v[0] ?? null : v
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).slice(0, 2)
  return parts.map((p) => p[0]?.toUpperCase() ?? '').join('') || '?'
}

type Job = {
  id: string
  title: string
  status: string
  job_code: string | null
  start_date: string | null
  end_date: string | null
  call_time: string | null
  day_rate_cents: number | null
  client_budget_cents: number | null
  shoot_duration_hours: number | null
  num_talent: number | null
  location: string | null
  address_line: string | null
  address_city: string | null
  address_state: string | null
  address_zip: string | null
  client_id: string | null
  description: string | null
  client_notes: string | null
  admin_notes: string | null
  call_sheet_sent_at: string | null
  profiles:
    | {
        full_name: string | null
        email: string | null
        phone: string | null
        client_profiles:
          | {
              company_name: string | null
              logo_url: string | null
              billing_email: string | null
              website: string | null
            }
          | {
              company_name: string | null
              logo_url: string | null
              billing_email: string | null
              website: string | null
            }[]
          | null
      }
    | {
        full_name: string | null
        email: string | null
        phone: string | null
        client_profiles:
          | {
              company_name: string | null
              logo_url: string | null
              billing_email: string | null
              website: string | null
            }
          | {
              company_name: string | null
              logo_url: string | null
              billing_email: string | null
              website: string | null
            }[]
          | null
      }[]
    | null
}

type Booking = {
  id: string
  status: string
  confirmed_rate_cents: number | null
  offered_rate_cents: number | null
  paid: boolean | null
  paid_at: string | null
  created_at: string | null
  auto_accepted: boolean | null
  auto_accepted_at: string | null
  talent_reviewed_at: string | null
  response_deadline_at: string | null
  nudge_count: number | null
  nudged_at: string | null
  declined_reason: string | null
  rate_negotiation_notes: string | null
  profiles:
    | {
        id: string
        full_name: string | null
        avatar_url: string | null
        email: string | null
        phone: string | null
        talent_profiles:
          | {
              department: string | null
              primary_role: string | null
              day_rate_cents: number | null
            }
          | {
              department: string | null
              primary_role: string | null
              day_rate_cents: number | null
            }[]
          | null
      }
    | {
        id: string
        full_name: string | null
        avatar_url: string | null
        email: string | null
        phone: string | null
        talent_profiles:
          | {
              department: string | null
              primary_role: string | null
              day_rate_cents: number | null
            }
          | {
              department: string | null
              primary_role: string | null
              day_rate_cents: number | null
            }[]
          | null
      }[]
    | null
}

type Invoice = {
  id: string
  invoice_number: string | null
  status: string
  total_cents: number | null
  due_date: string | null
  sent_at: string | null
}

export default async function AdminJobDetailPage({
  params,
}: {
  params: { id: string }
}) {
  const { supabase } = await requireAdmin()

  const [jobRes, bookingsRes, invoiceRes] = await Promise.all([
    supabase
      .from('jobs')
      .select(
        `*,
         profiles!jobs_client_id_fkey (full_name, email, phone,
           client_profiles (company_name, logo_url, billing_email, website))`
      )
      .eq('id', params.id)
      .maybeSingle(),
    supabase
      .from('job_bookings')
      .select(
        `id, status, confirmed_rate_cents, offered_rate_cents, paid, paid_at,
         created_at, auto_accepted, auto_accepted_at,
         talent_reviewed_at, response_deadline_at, nudge_count,
         nudged_at, declined_reason, rate_negotiation_notes,
         profiles!job_bookings_talent_id_fkey (id, full_name, avatar_url, email, phone,
           talent_profiles (department, primary_role, day_rate_cents))`
      )
      .eq('job_id', params.id)
      .order('created_at', { ascending: true }),
    supabase
      .from('invoices')
      .select('id, invoice_number, status, total_cents, due_date, sent_at')
      .eq('job_id', params.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])

  const job = jobRes.data as unknown as Job | null
  if (!job) {
    return (
      <div className="px-5 pt-5">
        <Link href="/admin/jobs" style={{ color: '#7A90AA', fontSize: 13 }}>
          ← Jobs
        </Link>
        <p
          className="mt-3"
          style={{ fontSize: 14, color: '#AABDE0', fontStyle: 'italic' }}
        >
          Job not found.
        </p>
      </div>
    )
  }

  const bookings = (bookingsRes.data ?? []) as unknown as Booking[]
  const invoice = invoiceRes.data as unknown as Invoice | null

  const clientRow = unwrap(job.profiles)
  const clientProfile = clientRow ? unwrap(clientRow.client_profiles) : null
  const clientName =
    clientProfile?.company_name ||
    clientRow?.full_name ||
    'Unknown client'

  const loc =
    [job.address_city, job.address_state].filter(Boolean).join(', ') ||
    job.location ||
    ''
  const range = formatRange(job.start_date, job.end_date)
  const fullAddressParts = [
    job.address_line,
    [job.address_city, job.address_state, job.address_zip]
      .filter(Boolean)
      .join(' '),
  ].filter(Boolean) as string[]
  const fullAddress = fullAddressParts.join(', ')
  const mapsUrl = fullAddress
    ? `https://maps.apple.com/?q=${encodeURIComponent(fullAddress)}`
    : null

  const isTerminal = job.status === 'wrapped' || job.status === 'cancelled'
  const confirmedTalentCount = bookings.filter(
    (b) => b.status === 'confirmed'
  ).length
  const billingEmail =
    clientProfile?.billing_email || clientRow?.email || null

  return (
    <div
      className="mx-auto"
      style={{ maxWidth: 720, padding: '20px 18px 28px' }}
    >
      <Link href="/admin/jobs" style={{ color: '#7A90AA', fontSize: 13 }}>
        ← Jobs
      </Link>

      {/* ─── Job header card ─── */}
      <section
        className="mt-3 rounded-xl bg-[#1A2E4A] border border-white/5"
        style={{ padding: 20 }}
      >
        <div className="flex items-start justify-between gap-3">
          <div style={{ flex: 1, minWidth: 0 }}>
            <h1
              className="text-white"
              style={{ fontSize: 20, fontWeight: 600, lineHeight: 1.2 }}
            >
              {job.title}
            </h1>
            {job.job_code && (
              <p
                className="mt-1"
                style={{
                  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                  fontSize: 11,
                  color: '#7A90AA',
                  letterSpacing: '0.04em',
                }}
              >
                Job # {job.job_code}
              </p>
            )}
          </div>
          <StatusBadge status={job.status} />
        </div>

        {!isTerminal && (
          <StatusActionButtons jobId={job.id} currentStatus={job.status} />
        )}

        <p
          className="mt-3"
          style={{ fontSize: 14, color: '#AABDE0' }}
        >
          {clientName}
        </p>

        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5" style={{ fontSize: 12, color: '#C5D3E8' }}>
          {range && range !== '—' && <InfoLine icon="📅" text={range} />}
          {formatCall(job.call_time) && (
            <InfoLine icon="🕐" text={`Call: ${formatCall(job.call_time)}`} />
          )}
          {loc && <InfoLine icon="📍" text={loc} />}
          {job.day_rate_cents != null ? (
            <InfoLine icon="💰" text={`${centsToUsd(job.day_rate_cents)}/day`} />
          ) : (
            <span
              style={{
                fontSize: 12,
                color: '#F0A500',
                fontWeight: 600,
              }}
            >
              💰 Rate TBD
            </span>
          )}
          {job.num_talent != null && job.num_talent > 0 && (
            <InfoLine
              icon="👥"
              text={`${job.num_talent} talent needed`}
            />
          )}
        </div>

        {job.start_date && (
          <div className="mt-3">
            <AddToCalendarButton
              title={`${job.title} — ${clientName}`}
              startDate={job.start_date}
              endDate={job.end_date ?? undefined}
              callTime={job.call_time}
              location={fullAddress || job.location || undefined}
              jobCode={job.job_code ?? undefined}
              variant="ghost"
              size="sm"
            />
          </div>
        )}
      </section>

      {/* ─── Job budget (inline admin edit) ─── */}
      <AdminBudgetRow
        jobId={job.id}
        budgetCents={job.client_budget_cents ?? job.day_rate_cents ?? null}
        isShortShoot={
          job.shoot_duration_hours != null && job.shoot_duration_hours < 4
        }
        editHref={`/admin/jobs/${job.id}/edit`}
      />

      {/* ─── Talent section ─── */}
      <section className="mt-4">
        <div className="flex items-center justify-between" style={{ marginBottom: 10 }}>
          <p
            style={{
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              color: '#7A90AA',
            }}
          >
            Talent booked
          </p>
          <Link
            href={`/admin/jobs/${job.id}/add-talent`}
            className="text-amber-400 hover:text-amber-300"
            style={{
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: '0.04em',
              textDecoration: 'none',
            }}
          >
            + Add talent
          </Link>
        </div>

        {bookings.length === 0 ? (
          <div
            className="rounded-xl bg-[#1A2E4A] border border-white/5 text-center"
            style={{ padding: '22px 18px' }}
          >
            <p style={{ fontSize: 13, color: '#7A90AA' }}>
              No talent booked yet
            </p>
            <Link
              href={`/admin/jobs/${job.id}/add-talent`}
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
              Add talent
            </Link>
          </div>
        ) : (
          <div className="flex flex-col gap-2.5">
            {bookings.map((b) => {
              const t = unwrap(b.profiles)
              const tp = t ? unwrap(t.talent_profiles) : null
              const name = t?.full_name || 'Unnamed'
              const meta =
                [tp?.department, tp?.primary_role].filter(Boolean).join(' · ') ||
                'Talent'
              return (
                <article
                  key={b.id}
                  className="rounded-xl"
                  style={{
                    background: '#253D5E',
                    padding: 16,
                    border: '1px solid rgba(255,255,255,0.05)',
                  }}
                >
                  <div className="flex items-start gap-3">
                    <div
                      className="flex items-center justify-center rounded-full overflow-hidden"
                      style={{
                        width: 48,
                        height: 48,
                        background: '#1E3A6B',
                        color: '#fff',
                        fontSize: 14,
                        fontWeight: 700,
                        flexShrink: 0,
                      }}
                    >
                      {t?.avatar_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={t.avatar_url}
                          alt=""
                          style={{
                            width: '100%',
                            height: '100%',
                            objectFit: 'cover',
                          }}
                        />
                      ) : (
                        initials(name)
                      )}
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
                        {name}
                      </p>
                      <p
                        style={{
                          fontSize: 12,
                          color: '#AABDE0',
                          marginTop: 2,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {meta}
                      </p>
                      {t?.email && (
                        <a
                          href={`mailto:${t.email}`}
                          style={{
                            display: 'block',
                            fontSize: 11,
                            color: '#7A90AA',
                            marginTop: 1,
                            textDecoration: 'underline',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {t.email}
                        </a>
                      )}
                    </div>

                    <div
                      className="flex flex-col items-end gap-1"
                      style={{ flexShrink: 0 }}
                    >
                      {b.status === 'unavailable' ? (
                        <span
                          className="rounded-full bg-gray-800/60 text-gray-400"
                          style={{
                            padding: '3px 10px',
                            fontSize: 10,
                            fontWeight: 600,
                            letterSpacing: '0.04em',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          Unavailable — booked elsewhere
                        </span>
                      ) : (
                        <StatusBadge status={b.status} size="sm" />
                      )}
                      {b.auto_accepted && (
                        <span
                          className="rounded-full"
                          style={{
                            padding: '2px 8px',
                            fontSize: 10,
                            fontWeight: 700,
                            letterSpacing: '0.08em',
                            textTransform: 'uppercase',
                            background: 'rgba(34,197,94,0.18)',
                            color: '#86EFAC',
                            border: '1px solid rgba(34,197,94,0.35)',
                          }}
                        >
                          ⚡ Auto-accepted
                        </span>
                      )}
                      {b.confirmed_rate_cents != null && (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
                          <span style={{ fontSize: 12, color: '#F0A500', fontWeight: 700 }}>
                            Client: {centsToUsd(Math.round(b.confirmed_rate_cents * 1.15))}/day
                          </span>
                          <span style={{ fontSize: 11, color: '#4ADE80' }}>
                            ✓ Talent: {centsToUsd(b.confirmed_rate_cents)}/day
                          </span>
                        </div>
                      )}
                      {b.confirmed_rate_cents == null && b.offered_rate_cents != null && (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
                          <span style={{ fontSize: 12, color: 'rgba(240,165,0,0.7)', fontWeight: 600 }}>
                            Client: {centsToUsd(Math.round(b.offered_rate_cents * 1.15))}/day
                          </span>
                          <span style={{ fontSize: 11, color: '#AABDE0' }}>
                            Offered: {centsToUsd(b.offered_rate_cents)}/day
                          </span>
                        </div>
                      )}
                      {b.paid && (
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

                  {/* Read receipt + nudge log */}
                  {(b.status === 'requested' ||
                    b.status === 'negotiating') && (
                    <div
                      className="mt-2 flex items-center gap-2 flex-wrap"
                      style={{ fontSize: 11, color: '#7A90AA' }}
                    >
                      <span
                        aria-hidden
                        style={{
                          display: 'inline-block',
                          width: 7,
                          height: 7,
                          borderRadius: 999,
                          background: b.talent_reviewed_at
                            ? 'rgba(170,189,224,0.4)'
                            : '#F0A500',
                          flexShrink: 0,
                        }}
                      />
                      <span>
                        {b.talent_reviewed_at
                          ? `Viewed ${formatDate(b.talent_reviewed_at)}`
                          : 'Not yet viewed'}
                      </span>
                      {b.nudge_count != null && b.nudge_count > 0 && (
                        <span>
                          · Nudged {b.nudge_count}x
                          {b.nudged_at
                            ? ` (last: ${formatDate(b.nudged_at)})`
                            : ''}
                        </span>
                      )}
                    </div>
                  )}
                  {b.status === 'declined' && b.declined_reason && (
                    <p
                      className="mt-2 rounded-lg"
                      style={{
                        fontSize: 12,
                        color: '#F87171',
                        background: 'rgba(239,68,68,0.08)',
                        border: '1px solid rgba(239,68,68,0.25)',
                        padding: '6px 10px',
                      }}
                    >
                      Reason: {b.declined_reason}
                    </p>
                  )}

                  {!isTerminal && (
                    <BookingAdminActions
                      bookingId={b.id}
                      jobId={job.id}
                      status={b.status}
                      paid={Boolean(b.paid)}
                      offeredRateCents={b.offered_rate_cents}
                      responseDeadlineAt={b.response_deadline_at}
                      negotiationNotes={b.rate_negotiation_notes}
                    />
                  )}
                </article>
              )
            })}
          </div>
        )}
      </section>

      {/* ─── Call sheet ─── */}
      {job.status !== 'cancelled' && (
        <div className="mt-4">
          <CallSheetButtons
            jobId={job.id}
            clientEmail={billingEmail}
            confirmedTalentCount={confirmedTalentCount}
            callSheetSentAt={job.call_sheet_sent_at}
          />
        </div>
      )}

      {/* ─── Notes ─── */}
      {(job.client_notes || job.admin_notes) && (
        <section
          className="mt-4 grid gap-3"
          style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}
        >
          <NotesCard label="Client notes" text={job.client_notes} />
          <NotesCard label="Admin notes" text={job.admin_notes} />
        </section>
      )}

      {/* ─── Address ─── */}
      {(fullAddress || job.location) && (
        <section className="mt-4">
          <p
            style={{
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              color: '#7A90AA',
              marginBottom: 8,
            }}
          >
            Location
          </p>
          <div
            className="rounded-xl bg-[#1A2E4A] border border-white/5"
            style={{ padding: 16 }}
          >
            {job.location && (
              <p
                className="text-white"
                style={{ fontSize: 14, fontWeight: 500 }}
              >
                {job.location}
              </p>
            )}
            {fullAddress && (
              <p
                style={{
                  fontSize: 13,
                  color: '#C5D3E8',
                  marginTop: job.location ? 4 : 0,
                  lineHeight: 1.5,
                }}
              >
                {fullAddress}
              </p>
            )}
            {mapsUrl && (
              <a
                href={mapsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block mt-2 text-amber-400 hover:text-amber-300"
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  letterSpacing: '0.04em',
                  textDecoration: 'none',
                }}
              >
                Open in Maps ↗
              </a>
            )}
          </div>
        </section>
      )}

      {/* ─── Invoice ─── */}
      <section className="mt-4">
        <p
          style={{
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            color: '#7A90AA',
            marginBottom: 8,
          }}
        >
          Invoice
        </p>
        {invoice ? (
          <Link
            href={`/admin/finance/${invoice.id}`}
            className="block rounded-xl bg-[#1A2E4A] border border-white/5 hover:border-white/10"
            style={{ padding: 16, textDecoration: 'none' }}
          >
            <div className="flex items-center justify-between gap-3">
              <div style={{ flex: 1, minWidth: 0 }}>
                <p className="text-white" style={{ fontSize: 14, fontWeight: 700 }}>
                  {invoice.invoice_number}
                </p>
                <p style={{ fontSize: 12, color: '#AABDE0', marginTop: 2 }}>
                  {centsToUsd(invoice.total_cents)}
                  {invoice.due_date && ` · due ${formatDate(invoice.due_date)}`}
                </p>
              </div>
              <StatusBadge status={invoice.status} size="sm" />
            </div>
            <p
              className="mt-2 text-amber-400"
              style={{ fontSize: 12, fontWeight: 600, letterSpacing: '0.04em' }}
            >
              View invoice →
            </p>
          </Link>
        ) : (
          <form action={generateInvoice}>
            <input type="hidden" name="jobId" value={job.id} />
            <div
              className="rounded-xl bg-[#1A2E4A] border border-white/5"
              style={{ padding: 16 }}
            >
              <div className="flex items-center justify-between gap-3">
                <p style={{ fontSize: 13, color: '#AABDE0' }}>No invoice yet</p>
                <button
                  type="submit"
                  className="rounded-lg bg-[#F0A500] hover:bg-[#F5B733] text-[#0F1B2E] transition-colors"
                  style={{
                    padding: '8px 14px',
                    fontSize: 11,
                    fontWeight: 700,
                    letterSpacing: '0.06em',
                    textTransform: 'uppercase',
                    border: 'none',
                    cursor: 'pointer',
                  }}
                >
                  Generate invoice
                </button>
              </div>
            </div>
          </form>
        )}
      </section>

      {/* ─── Edit link ─── */}
      <div className="mt-6 text-center">
        <Link
          href={`/admin/jobs/${job.id}/edit`}
          style={{
            fontSize: 12,
            color: '#7A90AA',
            textDecoration: 'underline',
          }}
        >
          Edit job details →
        </Link>
      </div>
    </div>
  )
}

function InfoLine({ icon, text }: { icon: string; text: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span aria-hidden style={{ fontSize: 12 }}>
        {icon}
      </span>
      <span style={{ fontSize: 12, color: '#C5D3E8' }}>{text}</span>
    </span>
  )
}

function NotesCard({
  label,
  text,
}: {
  label: string
  text: string | null
}) {
  return (
    <div
      className="rounded-xl bg-[#1A2E4A] border border-white/5"
      style={{ padding: 16 }}
    >
      <p
        style={{
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: '0.14em',
          textTransform: 'uppercase',
          color: '#7A90AA',
          marginBottom: 8,
        }}
      >
        {label}
      </p>
      {text ? (
        <p
          style={{
            fontSize: 14,
            color: '#C5D3E8',
            lineHeight: 1.55,
            whiteSpace: 'pre-wrap',
          }}
        >
          {text}
        </p>
      ) : (
        <p style={{ fontSize: 13, color: '#7A90AA', fontStyle: 'italic' }}>
          None
        </p>
      )}
    </div>
  )
}


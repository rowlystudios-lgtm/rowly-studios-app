import Link from 'next/link'
import { requireAdmin, centsToUsd, formatDate } from '@/lib/admin-auth'
import { StatusBadge } from '@/components/StatusBadge'
import { JobCodePill } from '@/components/JobCodePill'
import {
  buildGmailUrl,
  buildInvoiceBody,
  buildInvoiceSubject,
} from '../gmail'
import { markAsPaid, markAsOverdue, verifyInvoice } from '../actions'
import { GmailSendButton } from './GmailSendButton'
import { InvoicePreviewButton, type PreviewInvoice } from './InvoicePreviewModal'
import {
  AddLineItemForm,
  RemoveLineItemButton,
  DeleteDraftButton,
  VoidButton,
} from './DraftActions'

export const dynamic = 'force-dynamic'

function unwrap<T>(v: T | T[] | null | undefined): T | null {
  if (v == null) return null
  return Array.isArray(v) ? v[0] ?? null : v
}

function todayIsoLA(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Los_Angeles',
  }).format(new Date())
}

function formatShort(iso: string | null): string {
  if (!iso) return ''
  const parts = iso.split('-').map(Number)
  if (parts.length !== 3 || parts.some(Number.isNaN)) return ''
  const d = new Date(parts[0], parts[1] - 1, parts[2])
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function formatRange(start: string | null, end: string | null): string {
  if (!start) return ''
  if (!end || end === start) return formatDate(start)
  return `${formatDate(start)} – ${formatDate(end)}`
}

function fmtCents(c: number | null | undefined): string {
  if (!c && c !== 0) return '$0'
  return `$${(c / 100).toLocaleString('en-US', { maximumFractionDigits: 2 })}`
}

type Invoice = {
  id: string
  invoice_number: string | null
  status: string
  total_cents: number | null
  tax_cents: number | null
  rs_fee_cents: number | null
  rs_fee_percent: number | null
  client_total_cents: number | null
  invoice_verified: boolean | null
  verified_at: string | null
  due_date: string | null
  sent_at: string | null
  paid_at: string | null
  voided_at: string | null
  notes: string | null
  created_at: string | null
  client_id: string | null
  job_id: string | null
  drive_file_id: string | null
  drive_file_url: string | null
  jobs:
    | {
        id: string
        title: string
        job_code: string | null
        start_date: string | null
        end_date: string | null
        location: string | null
      }
    | {
        id: string
        title: string
        job_code: string | null
        start_date: string | null
        end_date: string | null
        location: string | null
      }[]
    | null
  profiles:
    | {
        full_name: string | null
        email: string | null
        client_profiles:
          | {
              company_name: string | null
              billing_email: string | null
              website: string | null
              entity_type: string | null
            }
          | {
              company_name: string | null
              billing_email: string | null
              website: string | null
              entity_type: string | null
            }[]
          | null
      }
    | {
        full_name: string | null
        email: string | null
        client_profiles:
          | {
              company_name: string | null
              billing_email: string | null
              website: string | null
              entity_type: string | null
            }
          | {
              company_name: string | null
              billing_email: string | null
              website: string | null
              entity_type: string | null
            }[]
          | null
      }[]
    | null
}

type LineItem = {
  id: string
  description: string | null
  quantity: number | null
  unit_price_cents: number | null
  total_cents: number | null
  booking_id: string | null
  created_at: string | null
  profiles:
    | {
        full_name: string | null
        talent_profiles:
          | { primary_role: string | null }
          | { primary_role: string | null }[]
          | null
      }
    | {
        full_name: string | null
        talent_profiles:
          | { primary_role: string | null }
          | { primary_role: string | null }[]
          | null
      }[]
    | null
}

export default async function AdminInvoiceDetailPage({
  params,
}: {
  params: { id: string }
}) {
  const { supabase } = await requireAdmin()

  const [invRes, itemsRes] = await Promise.all([
    supabase
      .from('invoices')
      .select(
        `id, invoice_number, status, total_cents, tax_cents,
         rs_fee_cents, rs_fee_percent, client_total_cents,
         invoice_verified, verified_at,
         due_date, sent_at, paid_at, voided_at, notes, created_at,
         client_id, job_id, drive_file_id, drive_file_url,
         jobs (id, title, job_code, start_date, end_date, location),
         profiles!invoices_client_id_fkey (full_name, email,
           client_profiles (company_name, billing_email, website, entity_type))`
      )
      .eq('id', params.id)
      .maybeSingle(),
    supabase
      .from('invoice_line_items')
      .select(
        `id, description, quantity, unit_price_cents, total_cents,
         booking_id, created_at,
         profiles!invoice_line_items_talent_id_fkey (full_name,
           talent_profiles (primary_role))`
      )
      .eq('invoice_id', params.id)
      .order('created_at', { ascending: true }),
  ])

  const invoice = invRes.data as unknown as Invoice | null
  if (!invoice) {
    return (
      <div className="px-5 pt-5">
        <Link href="/admin/finance" style={{ color: '#7A90AA', fontSize: 13 }}>
          ← Finance
        </Link>
        <p
          className="mt-3"
          style={{ fontSize: 14, color: '#AABDE0', fontStyle: 'italic' }}
        >
          Invoice not found.
        </p>
      </div>
    )
  }

  const lineItems = (itemsRes.data ?? []) as unknown as LineItem[]

  const today = todayIsoLA()
  const overdueByDate =
    invoice.status === 'sent' && invoice.due_date && invoice.due_date < today
  const effectiveStatus = overdueByDate ? 'overdue' : invoice.status

  const client = unwrap(invoice.profiles)
  const cp = client ? unwrap(client.client_profiles) : null
  const job = unwrap(invoice.jobs)

  const companyName = cp?.company_name || client?.full_name || 'Unknown client'
  const billingEmail =
    cp?.billing_email || client?.email || 'billing@example.com'

  const subtotalCents = lineItems.reduce(
    (s, li) => s + (li.total_cents ?? 0),
    0
  )
  const taxCents = invoice.tax_cents ?? 0
  // total_cents = what talent get paid (subtotal + tax)
  const total = invoice.total_cents ?? subtotalCents + taxCents
  const rsFeePercent = Number(invoice.rs_fee_percent ?? 15)
  // Trust the persisted rs_fee_cents if set, otherwise recompute from total.
  const rsFeeCents =
    invoice.rs_fee_cents ?? Math.round((total * rsFeePercent) / 100)
  const clientTotal = invoice.client_total_cents ?? total + rsFeeCents
  const isVerified = invoice.invoice_verified === true

  const jobDateLabel = job
    ? formatRange(job.start_date, job.end_date)
    : null

  // ─── Gmail payload ───
  const todayLabel = formatDate(today)
  const dueLabel = invoice.due_date ? formatDate(invoice.due_date) : null

  const emailItems = lineItems
    .filter((li) => (li.description ?? '').trim().length > 0)
    .map((li) => ({
      description: li.description ?? '',
      quantity: li.quantity ?? 1,
      unitPriceCents: li.unit_price_cents ?? 0,
      totalCents: li.total_cents ?? 0,
    }))

  const normalBody = buildInvoiceBody({
    invoiceNumber: invoice.invoice_number ?? 'DRAFT',
    todayLabel,
    dueLabel,
    companyName,
    billingEmail,
    jobTitle: job?.title ?? null,
    jobDateLabel,
    items: emailItems,
    subtotalCents,
    taxCents,
    totalCents: total,
    rsFeeCents,
    rsFeePercent,
    clientTotalCents: clientTotal,
    notes: invoice.notes,
  })
  const normalSubject = buildInvoiceSubject(
    invoice.invoice_number ?? 'DRAFT',
    companyName,
    job?.title ?? null
  )
  const gmailUrl = buildGmailUrl(billingEmail, normalSubject, normalBody)

  const reminderBody = buildInvoiceBody({
    invoiceNumber: invoice.invoice_number ?? 'DRAFT',
    todayLabel,
    dueLabel,
    companyName,
    billingEmail,
    jobTitle: job?.title ?? null,
    jobDateLabel,
    items: emailItems,
    subtotalCents,
    taxCents,
    totalCents: total,
    rsFeeCents,
    rsFeePercent,
    clientTotalCents: clientTotal,
    notes: invoice.notes,
    reminder: true,
  })
  const reminderSubject = buildInvoiceSubject(
    invoice.invoice_number ?? 'DRAFT',
    companyName,
    job?.title ?? null,
    true
  )
  const reminderUrl = buildGmailUrl(
    billingEmail,
    reminderSubject,
    reminderBody
  )

  // ─── Preview payload ───
  const previewInvoice: PreviewInvoice = {
    invoiceNumber: invoice.invoice_number ?? 'DRAFT',
    dateLabel: todayLabel,
    dueLabel,
    companyName,
    billingEmail,
    jobTitle: job?.title ?? null,
    jobDateLabel,
    jobLocation: job?.location ?? null,
    items: emailItems,
    subtotalCents,
    taxCents,
    totalCents: total,
    rsFeeCents,
    rsFeePercent,
    clientTotalCents: clientTotal,
    notes: invoice.notes,
  }

  const isDraft = invoice.status === 'draft'

  // Due-date label for header row 3
  let dueRowLabel = ''
  let dueRowColor = '#fff'
  if (invoice.due_date) {
    dueRowLabel = `Due ${formatDate(invoice.due_date)}`
    if (effectiveStatus === 'overdue') dueRowColor = '#F87171'
  }

  return (
    <div className="mx-auto" style={{ maxWidth: 720, padding: '20px 18px 28px' }}>
      <Link href="/admin/finance" style={{ fontSize: 13, color: '#7A90AA', textDecoration: 'none' }}>
        ← Finance
      </Link>

      {/* ─── Header card ─── */}
      <section
        className="mt-3 rounded-xl bg-[#1A2E4A] border border-white/5"
        style={{ padding: 20 }}
      >
        <div className="flex items-start justify-between gap-4">
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="flex items-center gap-3 flex-wrap">
              <h1
                className="text-white"
                style={{
                  fontSize: 22,
                  fontWeight: 600,
                  lineHeight: 1.1,
                  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                  letterSpacing: '0.02em',
                }}
              >
                {invoice.invoice_number ?? 'DRAFT'}
              </h1>
              <StatusBadge status={effectiveStatus} />
            </div>
          </div>
          <div className="text-right" style={{ flexShrink: 0 }}>
            <p
              style={{
                fontSize: 9,
                fontWeight: 700,
                letterSpacing: '0.14em',
                textTransform: 'uppercase',
                color: '#7A90AA',
                marginBottom: 2,
              }}
            >
              Client total
            </p>
            <p
              className="text-white"
              style={{ fontSize: 26, fontWeight: 700, lineHeight: 1 }}
            >
              {centsToUsd(clientTotal)}
            </p>
            <p style={{ fontSize: 11, color: '#7A90AA', marginTop: 4 }}>
              Talent: {fmtCents(total)}
              {taxCents > 0 && <> · Tax: {fmtCents(taxCents)}</>}
            </p>
            <p style={{ fontSize: 11, color: '#7A90AA' }}>
              RS fee ({rsFeePercent}%): {fmtCents(rsFeeCents)}
            </p>
          </div>
        </div>

        <div
          className="mt-4 grid gap-3"
          style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}
        >
          <div
            className="rounded-xl"
            style={{
              background: '#253D5E',
              padding: 14,
              border: '1px solid rgba(255,255,255,0.04)',
            }}
          >
            <p
              style={{
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: '0.14em',
                textTransform: 'uppercase',
                color: '#7A90AA',
                marginBottom: 6,
              }}
            >
              Billed to
            </p>
            <p
              className="text-white"
              style={{ fontSize: 14, fontWeight: 500 }}
            >
              {companyName}
            </p>
            <p style={{ fontSize: 13, color: '#AABDE0', marginTop: 2 }}>
              {billingEmail}
            </p>
          </div>
          <div
            className="rounded-xl"
            style={{
              background: '#253D5E',
              padding: 14,
              border: '1px solid rgba(255,255,255,0.04)',
            }}
          >
            <p
              style={{
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: '0.14em',
                textTransform: 'uppercase',
                color: '#7A90AA',
                marginBottom: 6,
              }}
            >
              Job
            </p>
            {job ? (
              <>
                <Link
                  href={`/admin/jobs/${job.id}`}
                  className="text-white"
                  style={{
                    fontSize: 14,
                    fontWeight: 500,
                    textDecoration: 'none',
                  }}
                >
                  {job.title}
                </Link>
                {job.job_code && (
                  <div style={{ marginTop: 4 }}>
                    <JobCodePill code={job.job_code} />
                  </div>
                )}
                {jobDateLabel && (
                  <p style={{ fontSize: 13, color: '#AABDE0', marginTop: 2 }}>
                    {jobDateLabel}
                  </p>
                )}
              </>
            ) : (
              <p style={{ fontSize: 13, color: '#7A90AA', fontStyle: 'italic' }}>
                No job linked
              </p>
            )}
          </div>
        </div>

        <div
          className="mt-3 flex flex-wrap gap-x-6 gap-y-1.5"
          style={{ fontSize: 12 }}
        >
          {dueRowLabel && (
            <span style={{ color: dueRowColor, fontWeight: 500 }}>
              {dueRowLabel}
            </span>
          )}
          {invoice.sent_at && (
            <span style={{ color: '#AABDE0' }}>
              Sent {formatDate(invoice.sent_at)}
            </span>
          )}
          {invoice.paid_at && (
            <span style={{ color: '#4ADE80', fontWeight: 600 }}>
              Paid {formatDate(invoice.paid_at)}
            </span>
          )}
          {invoice.voided_at && (
            <span style={{ color: '#7A90AA' }}>
              Voided {formatDate(invoice.voided_at)}
            </span>
          )}
          {invoice.drive_file_url && (
            <a
              href={invoice.drive_file_url}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                color: '#F0A500',
                fontWeight: 600,
                textDecoration: 'underline',
                fontSize: 12,
              }}
            >
              View in Drive ↗
            </a>
          )}
        </div>
      </section>

      {/* ─── Actions ─── */}
      <section className="mt-4 flex flex-col gap-3">
        {invoice.status === 'void' && (
          <div
            className="rounded-xl"
            style={{
              background: 'rgba(170,189,224,0.06)',
              border: '1px solid rgba(170,189,224,0.18)',
              padding: 14,
              color: '#AABDE0',
              fontSize: 13,
              textAlign: 'center',
            }}
          >
            This invoice has been voided.
          </div>
        )}

        {isDraft && !isVerified && (
          <div
            className="rounded-xl"
            style={{
              background: 'rgba(240,165,0,0.08)',
              border: '1px solid rgba(240,165,0,0.35)',
              padding: 16,
            }}
          >
            <p
              style={{
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: '0.14em',
                textTransform: 'uppercase',
                color: '#F0A500',
                marginBottom: 10,
              }}
            >
              ⚠ Verify before sending
            </p>
            <p style={{ fontSize: 13, color: '#E8D9B6', lineHeight: 1.5, marginBottom: 12 }}>
              Confirm every row below matches what you&rsquo;ll bill the client. Once verified,
              the Gmail send button unlocks.
            </p>
            <ul
              style={{
                fontSize: 13,
                color: '#C5D3E8',
                lineHeight: 1.7,
                paddingLeft: 18,
                marginBottom: 14,
                listStyle: 'disc',
              }}
            >
              <li>
                Job: <strong style={{ color: '#fff' }}>{job?.title ?? '— none —'}</strong>
                {job?.job_code && (
                  <span style={{ color: '#7A90AA', fontFamily: 'ui-monospace, monospace' }}>
                    {' '}
                    ({job.job_code})
                  </span>
                )}
              </li>
              <li>
                Client: <strong style={{ color: '#fff' }}>{companyName}</strong>{' '}
                <span style={{ color: '#7A90AA' }}>→ {billingEmail}</span>
              </li>
              <li>
                Invoice date: <strong style={{ color: '#fff' }}>{todayLabel}</strong>
                {dueLabel && (
                  <> · Due: <strong style={{ color: '#fff' }}>{dueLabel}</strong></>
                )}
              </li>
              {jobDateLabel && (
                <li>
                  Shoot date: <strong style={{ color: '#fff' }}>{jobDateLabel}</strong>
                </li>
              )}
              <li>
                Talent total:{' '}
                <strong style={{ color: '#fff' }}>{fmtCents(total)}</strong>
                {' '}(what talent get paid)
              </li>
              <li>
                RS fee ({rsFeePercent}%):{' '}
                <strong style={{ color: '#fff' }}>{fmtCents(rsFeeCents)}</strong>
              </li>
              <li style={{ color: '#F0A500' }}>
                <strong style={{ textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Client total: {centsToUsd(clientTotal)}
                </strong>{' '}
                (what the client is billed)
              </li>
            </ul>
            <div className="flex gap-2 flex-wrap">
              <form action={verifyInvoice} style={{ flex: 1, minWidth: 180 }}>
                <input type="hidden" name="invoiceId" value={invoice.id} />
                <button
                  type="submit"
                  className="w-full rounded-xl text-white transition-colors"
                  style={{
                    padding: '12px 0',
                    fontSize: 13,
                    fontWeight: 700,
                    letterSpacing: '0.04em',
                    background: '#F0A500',
                    color: '#0B1220',
                    border: 'none',
                    cursor: 'pointer',
                  }}
                >
                  ✓ Confirm and unlock send
                </button>
              </form>
              <Link
                href={`/admin/finance/${invoice.id}/edit`}
                style={{
                  padding: '12px 16px',
                  fontSize: 13,
                  fontWeight: 600,
                  letterSpacing: '0.02em',
                  background: 'rgba(255,255,255,0.06)',
                  color: '#AABDE0',
                  border: '1px solid rgba(170,189,224,0.2)',
                  borderRadius: 10,
                  textDecoration: 'none',
                }}
              >
                Edit invoice
              </Link>
            </div>
          </div>
        )}

        {isDraft && (
          <>
            {isVerified ? (
              <GmailSendButton
                invoiceId={invoice.id}
                gmailUrl={gmailUrl}
                label="Send via Gmail"
                variant="primary"
              />
            ) : null}
            <div className="flex gap-2 flex-wrap">
              <InvoicePreviewButton invoice={previewInvoice} />
              {isVerified && (
                <Link
                  href={`/admin/finance/${invoice.id}/edit`}
                  style={{
                    padding: '9px 14px',
                    fontSize: 12,
                    fontWeight: 600,
                    letterSpacing: '0.04em',
                    background: 'rgba(255,255,255,0.06)',
                    color: '#AABDE0',
                    border: '1px solid rgba(170,189,224,0.2)',
                    borderRadius: 10,
                    textDecoration: 'none',
                  }}
                >
                  Edit
                </Link>
              )}
              <DeleteDraftButton invoiceId={invoice.id} />
            </div>
            {isVerified && (
              <p
                style={{
                  fontSize: 11,
                  color: '#4ADE80',
                  fontWeight: 600,
                  letterSpacing: '0.04em',
                  textAlign: 'center',
                }}
              >
                ✓ Verified — ready to send
              </p>
            )}
          </>
        )}

        {invoice.status === 'sent' && (
          <>
            <form action={markAsPaid}>
              <input type="hidden" name="invoiceId" value={invoice.id} />
              <button
                type="submit"
                className="w-full rounded-xl text-white transition-colors"
                style={{
                  padding: '14px 0',
                  fontSize: 14,
                  fontWeight: 600,
                  background: '#166534',
                  border: 'none',
                  cursor: 'pointer',
                }}
              >
                ✓ Mark as paid
              </button>
            </form>
            <div className="flex gap-2 flex-wrap">
              <InvoicePreviewButton invoice={previewInvoice} />
              <GmailSendButton
                invoiceId={invoice.id}
                gmailUrl={gmailUrl}
                label="Resend via Gmail"
                variant="secondary"
                reminder
              />
              <form action={markAsOverdue}>
                <input type="hidden" name="invoiceId" value={invoice.id} />
                <button
                  type="submit"
                  style={{
                    padding: '9px 14px',
                    fontSize: 12,
                    fontWeight: 600,
                    letterSpacing: '0.04em',
                    background: 'rgba(239,68,68,0.15)',
                    color: '#F87171',
                    border: '1px solid rgba(239,68,68,0.35)',
                    borderRadius: 10,
                    cursor: 'pointer',
                  }}
                >
                  Mark overdue
                </button>
              </form>
            </div>
          </>
        )}

        {effectiveStatus === 'overdue' && invoice.status !== 'paid' && invoice.status !== 'void' && (
          <>
            <form action={markAsPaid}>
              <input type="hidden" name="invoiceId" value={invoice.id} />
              <button
                type="submit"
                className="w-full rounded-xl text-white transition-colors"
                style={{
                  padding: '14px 0',
                  fontSize: 14,
                  fontWeight: 600,
                  background: '#166534',
                  border: 'none',
                  cursor: 'pointer',
                }}
              >
                ✓ Mark as paid
              </button>
            </form>
            <div className="flex gap-2 flex-wrap">
              <InvoicePreviewButton invoice={previewInvoice} />
              <GmailSendButton
                invoiceId={invoice.id}
                gmailUrl={reminderUrl}
                label="Send reminder via Gmail"
                variant="secondary"
                reminder
              />
              <VoidButton invoiceId={invoice.id} />
            </div>
          </>
        )}

        {invoice.status === 'paid' && (
          <div className="flex gap-2 flex-wrap">
            <InvoicePreviewButton invoice={previewInvoice} variant="primary" />
          </div>
        )}
      </section>

      {/* ─── Line items ─── */}
      <section
        className="mt-4 rounded-xl bg-[#1A2E4A] border border-white/5"
        style={{ padding: 16 }}
      >
        <div className="flex items-center justify-between mb-3">
          <p
            style={{
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              color: '#7A90AA',
            }}
          >
            Line items
          </p>
          <span style={{ fontSize: 11, color: '#7A90AA' }}>
            {lineItems.length} item{lineItems.length === 1 ? '' : 's'}
          </span>
        </div>

        {lineItems.length === 0 ? (
          <p style={{ fontSize: 13, color: '#7A90AA', fontStyle: 'italic' }}>
            No line items yet.
          </p>
        ) : (
          <table
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              fontSize: 13,
            }}
          >
            <thead>
              <tr
                style={{
                  textAlign: 'left',
                  borderBottom: '1px solid rgba(255,255,255,0.1)',
                }}
              >
                <th
                  style={{
                    padding: '4px 4px 10px',
                    fontSize: 10,
                    fontWeight: 700,
                    letterSpacing: '0.14em',
                    textTransform: 'uppercase',
                    color: '#7A90AA',
                  }}
                >
                  Description
                </th>
                <th
                  style={{
                    padding: '4px 4px 10px',
                    fontSize: 10,
                    fontWeight: 700,
                    letterSpacing: '0.14em',
                    textTransform: 'uppercase',
                    color: '#7A90AA',
                    textAlign: 'center',
                    width: 56,
                  }}
                >
                  Days
                </th>
                <th
                  style={{
                    padding: '4px 4px 10px',
                    fontSize: 10,
                    fontWeight: 700,
                    letterSpacing: '0.14em',
                    textTransform: 'uppercase',
                    color: '#7A90AA',
                    textAlign: 'right',
                    width: 110,
                  }}
                >
                  Rate
                </th>
                <th
                  style={{
                    padding: '4px 4px 10px',
                    fontSize: 10,
                    fontWeight: 700,
                    letterSpacing: '0.14em',
                    textTransform: 'uppercase',
                    color: '#7A90AA',
                    textAlign: 'right',
                    width: 96,
                  }}
                >
                  Total
                </th>
                {isDraft && <th style={{ width: 36 }} />}
              </tr>
            </thead>
            <tbody>
              {lineItems.map((li) => (
                <tr
                  key={li.id}
                  style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}
                >
                  <td
                    style={{
                      padding: '12px 4px',
                      color: '#fff',
                      lineHeight: 1.4,
                    }}
                  >
                    {li.description || 'Line item'}
                  </td>
                  <td
                    style={{
                      padding: '12px 4px',
                      color: '#AABDE0',
                      textAlign: 'center',
                    }}
                  >
                    {li.quantity != null && Number.isInteger(li.quantity)
                      ? li.quantity
                      : (li.quantity ?? 1).toFixed(2)}
                  </td>
                  <td
                    style={{
                      padding: '12px 4px',
                      color: '#AABDE0',
                      textAlign: 'right',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {fmtCents(li.unit_price_cents)}/day
                  </td>
                  <td
                    style={{
                      padding: '12px 4px',
                      color: '#fff',
                      fontWeight: 600,
                      textAlign: 'right',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {fmtCents(li.total_cents)}
                  </td>
                  {isDraft && (
                    <td style={{ padding: '12px 4px', textAlign: 'right' }}>
                      <RemoveLineItemButton
                        lineItemId={li.id}
                        invoiceId={invoice.id}
                      />
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* Totals block — talent total, RS fee, client total */}
        <div className="mt-3 ml-auto" style={{ maxWidth: 280 }}>
          {(taxCents > 0 || lineItems.length > 1) && (
            <div
              className="flex items-center justify-between"
              style={{ fontSize: 13, color: '#AABDE0' }}
            >
              <span>Subtotal</span>
              <span>{fmtCents(subtotalCents)}</span>
            </div>
          )}
          {taxCents > 0 && (
            <div
              className="flex items-center justify-between mt-1"
              style={{ fontSize: 13, color: '#AABDE0' }}
            >
              <span>Tax</span>
              <span>{fmtCents(taxCents)}</span>
            </div>
          )}
          <div
            className="flex items-center justify-between mt-2 pt-2"
            style={{
              borderTop: '1px solid rgba(255,255,255,0.08)',
              fontSize: 13,
              color: '#AABDE0',
            }}
          >
            <span>Talent total</span>
            <span style={{ fontWeight: 600, color: '#fff' }}>
              {fmtCents(total)}
            </span>
          </div>
          <div
            className="flex items-center justify-between mt-1"
            style={{ fontSize: 13, color: '#AABDE0' }}
          >
            <span>RS fee ({rsFeePercent}%)</span>
            <span style={{ fontWeight: 600, color: '#fff' }}>
              {fmtCents(rsFeeCents)}
            </span>
          </div>
          <div
            className="flex items-center justify-between mt-2 pt-2"
            style={{ borderTop: '1px solid rgba(240,165,0,0.3)' }}
          >
            <span
              style={{
                fontSize: 12,
                fontWeight: 700,
                color: '#F0A500',
                textTransform: 'uppercase',
                letterSpacing: '0.12em',
              }}
            >
              Client total
            </span>
            <span
              style={{ fontSize: 18, fontWeight: 700, color: '#F0A500' }}
            >
              {centsToUsd(clientTotal)}
            </span>
          </div>
        </div>

        {isDraft && <AddLineItemForm invoiceId={invoice.id} />}
      </section>

      {/* ─── Notes ─── */}
      {invoice.notes && (
        <section
          className="mt-4 rounded-xl bg-[#1A2E4A] border border-white/5"
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
            Notes
          </p>
          <p
            style={{
              fontSize: 14,
              color: '#C5D3E8',
              lineHeight: 1.55,
              whiteSpace: 'pre-wrap',
            }}
          >
            {invoice.notes}
          </p>
        </section>
      )}
    </div>
  )
}

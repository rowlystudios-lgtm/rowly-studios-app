import Link from 'next/link'
import { revalidatePath } from 'next/cache'
import { requireAdmin, centsToUsdPrecise, formatDate } from '@/lib/admin-auth'
import { StatusBadge } from '@/components/StatusBadge'

export const dynamic = 'force-dynamic'

async function recalcTotal(
  supabase: Awaited<ReturnType<typeof requireAdmin>>['supabase'],
  invoiceId: string
) {
  const { data } = await supabase
    .from('invoice_line_items')
    .select('total_cents')
    .eq('invoice_id', invoiceId)
  const total = (data ?? []).reduce((s, r) => s + (r.total_cents ?? 0), 0)
  await supabase.from('invoices').update({ total_cents: total }).eq('id', invoiceId)
  return total
}

export default async function AdminInvoiceDetailPage({
  params,
}: {
  params: { id: string }
}) {
  const { supabase } = await requireAdmin()

  const [invoiceRes, lineItemsRes] = await Promise.all([
    supabase
      .from('invoices')
      .select(
        `*,
         jobs (id, title, start_date, end_date),
         profiles!invoices_client_id_fkey (id, first_name, last_name, full_name,
           client_profiles (company_name, billing_email))`
      )
      .eq('id', params.id)
      .maybeSingle(),
    supabase
      .from('invoice_line_items')
      .select(
        `id, description, quantity, unit_price_cents, total_cents,
         profiles!invoice_line_items_talent_id_fkey (first_name, last_name, full_name)`
      )
      .eq('invoice_id', params.id)
      .order('created_at'),
  ])

  const invoice = invoiceRes.data as unknown as
    | {
        id: string
        invoice_number: string | null
        status: string
        total_cents: number | null
        tax_cents: number | null
        due_date: string | null
        notes: string | null
        sent_at: string | null
        paid_at: string | null
        jobs:
          | {
              id: string
              title: string
              start_date: string | null
              end_date: string | null
            }
          | {
              id: string
              title: string
              start_date: string | null
              end_date: string | null
            }[]
          | null
        profiles:
          | {
              first_name: string | null
              last_name: string | null
              full_name: string | null
              client_profiles:
                | { company_name: string | null; billing_email: string | null }
                | { company_name: string | null; billing_email: string | null }[]
                | null
            }
          | {
              first_name: string | null
              last_name: string | null
              full_name: string | null
              client_profiles:
                | { company_name: string | null; billing_email: string | null }
                | { company_name: string | null; billing_email: string | null }[]
                | null
            }[]
          | null
      }
    | null

  if (!invoice) {
    return (
      <div style={{ padding: 20 }}>
        <p style={{ color: '#AABDE0' }}>Invoice not found.</p>
        <Link href="/admin/finance" style={{ color: '#F0A500' }}>
          ← Back to finance
        </Link>
      </div>
    )
  }

  type LineItem = {
    id: string
    description: string | null
    quantity: number | null
    unit_price_cents: number | null
    total_cents: number | null
    profiles:
      | {
          first_name: string | null
          last_name: string | null
          full_name: string | null
        }
      | {
          first_name: string | null
          last_name: string | null
          full_name: string | null
        }[]
      | null
  }
  const lineItems = (lineItemsRes.data ?? []) as unknown as LineItem[]

  const clientProfile = Array.isArray(invoice.profiles)
    ? invoice.profiles[0] ?? null
    : invoice.profiles
  const cp = clientProfile
    ? Array.isArray(clientProfile.client_profiles)
      ? clientProfile.client_profiles[0] ?? null
      : clientProfile.client_profiles
    : null
  const job = Array.isArray(invoice.jobs) ? invoice.jobs[0] ?? null : invoice.jobs
  const clientName =
    cp?.company_name ||
    [clientProfile?.first_name, clientProfile?.last_name]
      .filter(Boolean)
      .join(' ') ||
    clientProfile?.full_name ||
    '—'

  const total = (lineItems ?? []).reduce((s, r) => s + (r.total_cents ?? 0), 0)

  async function addLineItem(formData: FormData) {
    'use server'
    const { supabase: sb } = await requireAdmin()
    const invoiceId = params.id
    const description = ((formData.get('description') as string) ?? '').trim()
    const quantityRaw = (formData.get('quantity') as string) ?? '1'
    const rateRaw = (formData.get('rate') as string) ?? ''
    if (!description || !rateRaw) return
    const quantity = Math.max(1, parseFloat(quantityRaw) || 1)
    const unitPriceCents = Math.round(parseFloat(rateRaw) * 100)
    const totalCents = Math.round(quantity * unitPriceCents)
    await sb.from('invoice_line_items').insert({
      invoice_id: invoiceId,
      description,
      quantity,
      unit_price_cents: unitPriceCents,
      total_cents: totalCents,
    })
    await recalcTotal(sb, invoiceId)
    revalidatePath(`/admin/finance/${invoiceId}`)
  }

  async function removeLineItem(formData: FormData) {
    'use server'
    const { supabase: sb } = await requireAdmin()
    const lineId = formData.get('lineId') as string
    if (!lineId) return
    await sb.from('invoice_line_items').delete().eq('id', lineId)
    await recalcTotal(sb, params.id)
    revalidatePath(`/admin/finance/${params.id}`)
  }

  async function markPaid() {
    'use server'
    const { supabase: sb } = await requireAdmin()
    await sb
      .from('invoices')
      .update({ status: 'paid', paid_at: new Date().toISOString() })
      .eq('id', params.id)
    revalidatePath(`/admin/finance/${params.id}`)
    revalidatePath('/admin/finance')
  }

  async function sendInvoice() {
    'use server'
    // Stub — Gmail send is coming in Day 6. For now just flip to 'sent'.
    const { supabase: sb } = await requireAdmin()
    await sb
      .from('invoices')
      .update({ status: 'sent', sent_at: new Date().toISOString() })
      .eq('id', params.id)
    revalidatePath(`/admin/finance/${params.id}`)
    revalidatePath('/admin/finance')
  }

  return (
    <div style={{ padding: '18px 18px', maxWidth: 640, margin: '0 auto' }}>
      <Link
        href="/admin/finance"
        style={{
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: '#AABDE0',
          textDecoration: 'none',
        }}
      >
        ← Finance
      </Link>

      {/* Header */}
      <div
        style={{
          marginTop: 12,
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 10,
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: '#fff' }}>
            {invoice.invoice_number}
          </h1>
          <p style={{ fontSize: 12, color: '#AABDE0', marginTop: 4 }}>
            {clientName}
            {job && ` · ${job.title}`}
          </p>
          {invoice.due_date && (
            <p style={{ fontSize: 12, color: '#AABDE0', marginTop: 2 }}>
              Due {formatDate(invoice.due_date)}
            </p>
          )}
        </div>
        <StatusBadge status={invoice.status} />
      </div>

      {cp?.billing_email && (
        <p style={{ fontSize: 12, color: '#AABDE0', marginTop: 4 }}>
          Billing: {cp.billing_email}
        </p>
      )}

      {/* Line items */}
      <section style={{ marginTop: 18 }}>
        <SectionLabel>Line items</SectionLabel>
        <div
          style={{
            background: '#1A2E4A',
            border: '1px solid rgba(170,189,224,0.15)',
            borderRadius: 12,
            padding: 14,
          }}
        >
          {lineItems.length === 0 ? (
            <p style={{ fontSize: 13, color: '#7A90AA', fontStyle: 'italic' }}>
              No line items yet
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {lineItems.map((li) => (
                <div
                  key={li.id}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 10,
                    paddingBottom: 10,
                    borderBottom: '1px solid rgba(170,189,224,0.1)',
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 13, color: '#fff', fontWeight: 600 }}>
                      {li.description || 'Line item'}
                    </p>
                    <p style={{ fontSize: 11, color: '#AABDE0', marginTop: 2 }}>
                      {li.quantity ?? 1} × {centsToUsdPrecise(li.unit_price_cents)}
                    </p>
                  </div>
                  <span
                    style={{
                      fontSize: 13,
                      fontWeight: 700,
                      color: '#fff',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {centsToUsdPrecise(li.total_cents)}
                  </span>
                  {invoice.status === 'draft' && (
                    <form action={removeLineItem}>
                      <input type="hidden" name="lineId" value={li.id} />
                      <button
                        type="submit"
                        aria-label="Remove line item"
                        style={{
                          background: 'transparent',
                          border: '1px solid rgba(239,68,68,0.3)',
                          color: '#F87171',
                          fontSize: 11,
                          fontWeight: 600,
                          padding: '4px 8px',
                          borderRadius: 6,
                          cursor: 'pointer',
                        }}
                      >
                        ×
                      </button>
                    </form>
                  )}
                </div>
              ))}
            </div>
          )}

          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              paddingTop: 10,
              marginTop: lineItems.length > 0 ? 0 : 10,
            }}
          >
            <span
              style={{
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: '#AABDE0',
              }}
            >
              Total
            </span>
            <span style={{ fontSize: 16, fontWeight: 700, color: '#fff' }}>
              {centsToUsdPrecise(total)}
            </span>
          </div>
        </div>
      </section>

      {/* Add line item form (only when draft) */}
      {invoice.status === 'draft' && (
        <section style={{ marginTop: 14 }}>
          <form
            action={addLineItem}
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
            <input
              type="text"
              name="description"
              required
              placeholder="Description (e.g. Photographer – day 1)"
              style={inputStyle}
            />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 8 }}>
              <input
                type="number"
                name="quantity"
                min={1}
                step={0.5}
                defaultValue={1}
                placeholder="Qty"
                style={inputStyle}
              />
              <input
                type="number"
                name="rate"
                min={0}
                step={25}
                required
                placeholder="Rate ($)"
                style={inputStyle}
              />
            </div>
            <button
              type="submit"
              style={{
                padding: '10px 0',
                borderRadius: 8,
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
              + Add line item
            </button>
          </form>
        </section>
      )}

      {/* Actions */}
      <section style={{ marginTop: 18 }}>
        <SectionLabel>Actions</SectionLabel>
        <div
          style={{
            background: '#1A2E4A',
            border: '1px solid rgba(170,189,224,0.15)',
            borderRadius: 12,
            padding: 14,
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
          }}
        >
          {invoice.status === 'draft' && (
            <form action={sendInvoice}>
              <button
                type="submit"
                disabled={lineItems.length === 0}
                style={{
                  width: '100%',
                  padding: '12px 0',
                  borderRadius: 10,
                  background: '#F0A500',
                  color: '#0F1B2E',
                  border: 'none',
                  fontSize: 12,
                  fontWeight: 700,
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                  cursor: lineItems.length === 0 ? 'not-allowed' : 'pointer',
                  opacity: lineItems.length === 0 ? 0.5 : 1,
                }}
              >
                Send via Gmail (stub — marks sent)
              </button>
            </form>
          )}
          {invoice.status === 'sent' && (
            <form action={markPaid}>
              <button
                type="submit"
                style={{
                  width: '100%',
                  padding: '12px 0',
                  borderRadius: 10,
                  background: '#4ADE80',
                  color: '#0F1B2E',
                  border: 'none',
                  fontSize: 12,
                  fontWeight: 700,
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                  cursor: 'pointer',
                }}
              >
                Mark as paid
              </button>
            </form>
          )}
          {invoice.status === 'paid' && (
            <p style={{ fontSize: 13, color: '#4ADE80', fontWeight: 600 }}>
              Paid{invoice.paid_at ? ` on ${formatDate(invoice.paid_at)}` : ''}
            </p>
          )}
        </div>
      </section>
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  padding: '10px 12px',
  borderRadius: 8,
  border: '1px solid rgba(170,189,224,0.2)',
  background: 'rgba(255,255,255,0.05)',
  color: '#fff',
  fontSize: 14,
  outline: 'none',
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

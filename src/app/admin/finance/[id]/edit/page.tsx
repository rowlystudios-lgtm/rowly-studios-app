import Link from 'next/link'
import { redirect } from 'next/navigation'
import { requireAdmin } from '@/lib/admin-auth'
import { InvoiceForm, type InvoiceFormInitial } from '../../InvoiceForm'
import { updateInvoiceDraft } from '../../actions'

export const dynamic = 'force-dynamic'

export default async function AdminEditInvoicePage({
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
         due_date, notes, client_id, job_id`
      )
      .eq('id', params.id)
      .maybeSingle(),
    supabase
      .from('invoice_line_items')
      .select(
        `id, description, quantity, unit_price_cents, total_cents,
         booking_id, talent_id, created_at`
      )
      .eq('invoice_id', params.id)
      .order('created_at', { ascending: true }),
  ])

  const invoice = invRes.data as unknown as {
    id: string
    invoice_number: string | null
    status: string
    total_cents: number | null
    tax_cents: number | null
    due_date: string | null
    notes: string | null
    client_id: string | null
    job_id: string | null
  } | null

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

  // Only drafts are editable — bounce to read-only detail otherwise.
  if (invoice.status !== 'draft') redirect(`/admin/finance/${invoice.id}`)

  const items = (itemsRes.data ?? []) as Array<{
    id: string
    description: string | null
    quantity: number | null
    unit_price_cents: number | null
    total_cents: number | null
    booking_id: string | null
    talent_id: string | null
  }>

  const subtotal = items.reduce((s, i) => s + (i.total_cents ?? 0), 0)
  const taxPercent =
    subtotal > 0 && invoice.tax_cents
      ? Math.round(((invoice.tax_cents ?? 0) / subtotal) * 1000) / 10
      : 0

  const initial: InvoiceFormInitial = {
    id: invoice.id,
    client_id: invoice.client_id,
    job_id: invoice.job_id,
    due_date: invoice.due_date,
    notes: invoice.notes,
    tax_percent: taxPercent,
    invoice_number: invoice.invoice_number,
    line_items: items.map((li) => ({
      description: li.description ?? '',
      quantity: li.quantity ?? 1,
      unit_price_cents: li.unit_price_cents ?? 0,
      booking_id: li.booking_id,
      talent_id: li.talent_id,
    })),
  }

  return (
    <InvoiceForm mode="edit" initial={initial} action={updateInvoiceDraft} />
  )
}

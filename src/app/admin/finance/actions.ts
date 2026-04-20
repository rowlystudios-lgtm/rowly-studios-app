'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/admin-auth'

type ParsedLineItem = {
  description: string
  quantity: number
  unit_price_cents: number
  total_cents: number
  booking_id: string | null
  talent_id: string | null
}

function parseLineItems(raw: string | null): ParsedLineItem[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed
      .map((r: Record<string, unknown>) => {
        const quantity = Math.max(0.5, Number(r.quantity ?? 1))
        const unit = Math.round(Number(r.unit_price_cents ?? 0))
        const total = Math.round(quantity * unit)
        return {
          description: String(r.description ?? '').trim(),
          quantity,
          unit_price_cents: unit,
          total_cents: total,
          booking_id:
            typeof r.booking_id === 'string' && r.booking_id
              ? r.booking_id
              : null,
          talent_id:
            typeof r.talent_id === 'string' && r.talent_id ? r.talent_id : null,
        }
      })
      .filter((r) => r.description && r.unit_price_cents > 0)
  } catch {
    return []
  }
}

function todayIsoLA(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Los_Angeles',
  }).format(new Date())
}

/**
 * Generate the next invoice number based on current count.
 * Not transactional — collisions are astronomically unlikely for a single-admin app.
 */
async function nextInvoiceNumber(
  supabase: Awaited<ReturnType<typeof requireAdmin>>['supabase']
): Promise<string> {
  const { count } = await supabase
    .from('invoices')
    .select('id', { count: 'exact', head: true })
  const next = (count ?? 0) + 1
  return `RS-INV-${String(next).padStart(4, '0')}`
}

/**
 * Recompute invoices.total_cents by summing line items + tax.
 * Called after any add/remove/update of line items.
 */
async function recalcTotal(
  supabase: Awaited<ReturnType<typeof requireAdmin>>['supabase'],
  invoiceId: string
): Promise<void> {
  const [{ data: items }, { data: inv }] = await Promise.all([
    supabase
      .from('invoice_line_items')
      .select('total_cents')
      .eq('invoice_id', invoiceId),
    supabase
      .from('invoices')
      .select('tax_cents')
      .eq('id', invoiceId)
      .maybeSingle(),
  ])
  const itemSum = (items ?? []).reduce(
    (s, r) => s + (r.total_cents ?? 0),
    0
  )
  const tax = inv?.tax_cents ?? 0
  await supabase
    .from('invoices')
    .update({ total_cents: itemSum + tax })
    .eq('id', invoiceId)
}

export async function recalculateTotal(formData: FormData) {
  const { supabase } = await requireAdmin()
  const invoiceId = (formData.get('invoiceId') as string) ?? ''
  if (!invoiceId) return
  await recalcTotal(supabase, invoiceId)
  revalidatePath(`/admin/finance/${invoiceId}`)
}

/* ─────────── Create / update invoice ─────────── */

export async function createInvoice(formData: FormData) {
  const { supabase, user } = await requireAdmin()

  const clientId = ((formData.get('client_id') as string) ?? '').trim()
  const jobId = ((formData.get('job_id') as string) ?? '').trim() || null
  const dueDate = ((formData.get('due_date') as string) ?? '').trim() || null
  const notes = ((formData.get('notes') as string) ?? '').trim() || null
  const taxRate = Math.max(0, Number(formData.get('tax_percent') ?? 0) || 0)
  const items = parseLineItems((formData.get('line_items') as string) ?? null)
  if (!clientId) return

  const subtotal = items.reduce((s, i) => s + i.total_cents, 0)
  const taxCents = Math.round(subtotal * (taxRate / 100))
  const total = subtotal + taxCents
  const invoiceNumber = await nextInvoiceNumber(supabase)

  const { data: inv, error } = await supabase
    .from('invoices')
    .insert({
      job_id: jobId,
      client_id: clientId,
      invoice_number: invoiceNumber,
      status: 'draft',
      total_cents: total,
      tax_cents: taxCents,
      due_date: dueDate,
      notes,
      created_by: user.id,
    })
    .select('id')
    .single()

  if (error || !inv) return

  if (items.length > 0) {
    await supabase.from('invoice_line_items').insert(
      items.map((li) => ({
        invoice_id: inv.id,
        description: li.description,
        quantity: li.quantity,
        unit_price_cents: li.unit_price_cents,
        total_cents: li.total_cents,
        booking_id: li.booking_id,
        talent_id: li.talent_id,
      }))
    )
  }

  revalidatePath('/admin/finance')
  redirect(`/admin/finance/${inv.id}`)
}

export async function updateInvoiceDraft(formData: FormData) {
  const { supabase } = await requireAdmin()
  const invoiceId = ((formData.get('invoiceId') as string) ?? '').trim()
  if (!invoiceId) return
  const dueDate = ((formData.get('due_date') as string) ?? '').trim() || null
  const notes = ((formData.get('notes') as string) ?? '').trim() || null
  const taxRate = Math.max(0, Number(formData.get('tax_percent') ?? 0) || 0)
  const items = parseLineItems((formData.get('line_items') as string) ?? null)

  // Only allow edits while the invoice is still a draft.
  const { data: existing } = await supabase
    .from('invoices')
    .select('status')
    .eq('id', invoiceId)
    .maybeSingle()
  if (!existing || existing.status !== 'draft') return

  const subtotal = items.reduce((s, i) => s + i.total_cents, 0)
  const taxCents = Math.round(subtotal * (taxRate / 100))
  const total = subtotal + taxCents

  await supabase
    .from('invoices')
    .update({
      due_date: dueDate,
      notes,
      tax_cents: taxCents,
      total_cents: total,
    })
    .eq('id', invoiceId)

  // Reconcile line items — wipe + re-insert is the simplest correct approach
  // and matches what the client-side form constructs.
  await supabase
    .from('invoice_line_items')
    .delete()
    .eq('invoice_id', invoiceId)
  if (items.length > 0) {
    await supabase.from('invoice_line_items').insert(
      items.map((li) => ({
        invoice_id: invoiceId,
        description: li.description,
        quantity: li.quantity,
        unit_price_cents: li.unit_price_cents,
        total_cents: li.total_cents,
        booking_id: li.booking_id,
        talent_id: li.talent_id,
      }))
    )
  }

  revalidatePath(`/admin/finance/${invoiceId}`)
  revalidatePath('/admin/finance')
  redirect(`/admin/finance/${invoiceId}`)
}

/* ─────────── Status transitions ─────────── */

async function updateStatus(
  formData: FormData,
  next: 'sent' | 'paid' | 'overdue' | 'void'
): Promise<void> {
  const { supabase } = await requireAdmin()
  const invoiceId = ((formData.get('invoiceId') as string) ?? '').trim()
  if (!invoiceId) return
  const patch: Record<string, unknown> = { status: next }
  const nowIso = new Date().toISOString()
  if (next === 'sent') patch.sent_at = nowIso
  if (next === 'paid') patch.paid_at = nowIso
  if (next === 'void') patch.voided_at = nowIso
  await supabase.from('invoices').update(patch).eq('id', invoiceId)
  revalidatePath(`/admin/finance/${invoiceId}`)
  revalidatePath('/admin/finance')
}

export async function markAsSent(formData: FormData) {
  await updateStatus(formData, 'sent')
}

export async function markAsPaid(formData: FormData) {
  const { supabase } = await requireAdmin()
  const invoiceId = ((formData.get('invoiceId') as string) ?? '').trim()
  if (!invoiceId) return
  const nowIso = new Date().toISOString()
  await supabase
    .from('invoices')
    .update({ status: 'paid', paid_at: nowIso })
    .eq('id', invoiceId)

  // Auto-flip all associated bookings (via line_items.booking_id) to paid.
  const { data: items } = await supabase
    .from('invoice_line_items')
    .select('booking_id')
    .eq('invoice_id', invoiceId)
  const bookingIds = (items ?? [])
    .map((r) => r.booking_id)
    .filter((id): id is string => Boolean(id))
  if (bookingIds.length > 0) {
    await supabase
      .from('job_bookings')
      .update({ paid: true, paid_at: nowIso })
      .in('id', bookingIds)
  }

  revalidatePath(`/admin/finance/${invoiceId}`)
  revalidatePath('/admin/finance')
}

export async function markAsOverdue(formData: FormData) {
  await updateStatus(formData, 'overdue')
}

export async function voidInvoice(formData: FormData) {
  await updateStatus(formData, 'void')
}

export async function deleteInvoice(formData: FormData) {
  const { supabase } = await requireAdmin()
  const invoiceId = ((formData.get('invoiceId') as string) ?? '').trim()
  if (!invoiceId) return
  // Only drafts can be deleted outright; everything else should be voided.
  const { data: existing } = await supabase
    .from('invoices')
    .select('status')
    .eq('id', invoiceId)
    .maybeSingle()
  if (!existing || existing.status !== 'draft') return

  await supabase.from('invoice_line_items').delete().eq('invoice_id', invoiceId)
  await supabase.from('invoices').delete().eq('id', invoiceId)
  revalidatePath('/admin/finance')
  redirect('/admin/finance')
}

/* ─────────── Inline line-item add/remove on detail page ─────────── */

export async function addLineItem(formData: FormData) {
  const { supabase } = await requireAdmin()
  const invoiceId = ((formData.get('invoiceId') as string) ?? '').trim()
  if (!invoiceId) return
  const description = ((formData.get('description') as string) ?? '').trim()
  const quantityRaw = (formData.get('quantity') as string) ?? '1'
  const rateRaw = (formData.get('rate') as string) ?? ''
  if (!description || !rateRaw) return

  const quantity = Math.max(0.5, parseFloat(quantityRaw) || 1)
  const unit = Math.round(parseFloat(rateRaw) * 100)
  const total = Math.round(quantity * unit)

  await supabase.from('invoice_line_items').insert({
    invoice_id: invoiceId,
    description,
    quantity,
    unit_price_cents: unit,
    total_cents: total,
  })
  await recalcTotal(supabase, invoiceId)
  revalidatePath(`/admin/finance/${invoiceId}`)
}

export async function removeLineItem(formData: FormData) {
  const { supabase } = await requireAdmin()
  const lineId = ((formData.get('lineId') as string) ?? '').trim()
  const invoiceId = ((formData.get('invoiceId') as string) ?? '').trim()
  if (!lineId || !invoiceId) return
  await supabase.from('invoice_line_items').delete().eq('id', lineId)
  await recalcTotal(supabase, invoiceId)
  revalidatePath(`/admin/finance/${invoiceId}`)
}

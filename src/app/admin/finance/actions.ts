'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/admin-auth'
import { createServiceClient } from '@/lib/supabase-service'

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
 * Recompute invoices.total_cents / rs_fee_cents / client_total_cents.
 *
 * Invariants:
 *   total_cents        = Σ line items + tax   ← what talent get paid
 *   rs_fee_cents       = round(total_cents * rs_fee_percent / 100)
 *   client_total_cents = total_cents + rs_fee_cents
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
      .select('tax_cents, rs_fee_percent')
      .eq('id', invoiceId)
      .maybeSingle(),
  ])
  const itemSum = (items ?? []).reduce(
    (s, r) => s + (r.total_cents ?? 0),
    0
  )
  const tax = inv?.tax_cents ?? 0
  const total = itemSum + tax
  const feePercent = Number(inv?.rs_fee_percent ?? 15)
  const rsFee = Math.round((total * feePercent) / 100)
  await supabase
    .from('invoices')
    .update({
      total_cents: total,
      rs_fee_cents: rsFee,
      client_total_cents: total + rsFee,
    })
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
  // total_cents is what talent get paid; RS takes rs_fee_cents on top.
  const rsFeePercent = 15
  const rsFeeCents = Math.round((total * rsFeePercent) / 100)
  const clientTotalCents = total + rsFeeCents
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
      rs_fee_percent: rsFeePercent,
      rs_fee_cents: rsFeeCents,
      client_total_cents: clientTotalCents,
      invoice_verified: false,
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
  // Pull the active fee % so edits keep the same fee contract the invoice was
  // created with (defaults to 15 if unset).
  const { data: feeRow } = await supabase
    .from('invoices')
    .select('rs_fee_percent')
    .eq('id', invoiceId)
    .maybeSingle()
  const rsFeePercent = Number(feeRow?.rs_fee_percent ?? 15)
  const rsFeeCents = Math.round((total * rsFeePercent) / 100)
  const clientTotalCents = total + rsFeeCents

  await supabase
    .from('invoices')
    .update({
      due_date: dueDate,
      notes,
      tax_cents: taxCents,
      total_cents: total,
      rs_fee_cents: rsFeeCents,
      client_total_cents: clientTotalCents,
      // Any edit to a draft invalidates the admin's prior verification —
      // they need to re-review the updated totals before sending.
      invoice_verified: false,
      verified_by: null,
      verified_at: null,
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
  const { supabase } = await requireAdmin()
  const invoiceId = ((formData.get('invoiceId') as string) ?? '').trim()
  if (!invoiceId) return
  // Guard: never let an unverified draft leave the building. The UI already
  // hides the send button until verified, but enforce server-side too.
  const { data: guardRow } = await supabase
    .from('invoices')
    .select('invoice_verified')
    .eq('id', invoiceId)
    .maybeSingle()
  if (!guardRow?.invoice_verified) {
    revalidatePath(`/admin/finance/${invoiceId}`)
    return
  }
  await updateStatus(formData, 'sent')
  // Fire-and-forget the Drive upload — the main action has already
  // completed and revalidated, and Drive is allowed to fail soft.
  try {
    await uploadInvoiceToDrive(invoiceId)
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[invoice] Drive upload failed for', invoiceId, err)
  }
  revalidatePath(`/admin/finance/${invoiceId}`)
}

/**
 * Mark a draft invoice as verified by the admin. This unlocks the
 * "Send via Gmail" button and records who signed off and when.
 */
export async function verifyInvoice(formData: FormData) {
  const { supabase, user } = await requireAdmin()
  const invoiceId = ((formData.get('invoiceId') as string) ?? '').trim()
  if (!invoiceId) return
  const { data: existing } = await supabase
    .from('invoices')
    .select('status')
    .eq('id', invoiceId)
    .maybeSingle()
  if (!existing || existing.status !== 'draft') return
  await supabase
    .from('invoices')
    .update({
      invoice_verified: true,
      verified_by: user.id,
      verified_at: new Date().toISOString(),
    })
    .eq('id', invoiceId)
  revalidatePath(`/admin/finance/${invoiceId}`)
}

/**
 * Generate a PDF for this invoice and upload it into the 2026 invoices
 * Drive folder. Best-effort: every failure is logged and returned as null
 * so status transitions never block on Drive.
 */
async function uploadInvoiceToDrive(invoiceId: string) {
  const supabase = createServiceClient()

  const { data: invoice } = await supabase
    .from('invoices')
    .select('*')
    .eq('id', invoiceId)
    .maybeSingle()
  if (!invoice) return null

  const { data: lineItems } = await supabase
    .from('invoice_line_items')
    .select('description, quantity, unit_price_cents, total_cents')
    .eq('invoice_id', invoiceId)
    .order('created_at', { ascending: true })

  const { data: clientProfile } = await supabase
    .from('profiles')
    .select(
      `id, full_name, email,
       client_profiles (company_name, billing_email)`
    )
    .eq('id', invoice.client_id)
    .maybeSingle()

  const { data: job } = invoice.job_id
    ? await supabase
        .from('jobs')
        .select('title, start_date, end_date')
        .eq('id', invoice.job_id)
        .maybeSingle()
    : { data: null }

  const { data: folderSetting } = await supabase
    .from('admin_settings')
    .select('value')
    .eq('key', 'drive_invoices_2026_id')
    .maybeSingle()
  if (!folderSetting?.value) return null

  type CP = {
    company_name: string | null
    billing_email: string | null
  } | null
  const rawCp = (clientProfile as unknown as {
    client_profiles?: CP | CP[]
  } | null)?.client_profiles
  const cp: CP = Array.isArray(rawCp) ? rawCp[0] ?? null : rawCp ?? null

  const client = {
    full_name: (clientProfile as unknown as { full_name?: string | null } | null)?.full_name ?? null,
    email: (clientProfile as unknown as { email?: string | null } | null)?.email ?? null,
    company_name: cp?.company_name ?? null,
    billing_email: cp?.billing_email ?? null,
  }

  const { generateInvoiceHTML, generateInvoicePDF } = await import(
    '@/lib/invoice-pdf'
  )
  const html = generateInvoiceHTML(
    {
      invoice_number: invoice.invoice_number,
      created_at: invoice.created_at,
      due_date: invoice.due_date,
      total_cents: invoice.total_cents,
      tax_cents: invoice.tax_cents,
      rs_fee_cents: invoice.rs_fee_cents,
      rs_fee_percent: invoice.rs_fee_percent,
      client_total_cents: invoice.client_total_cents,
      notes: invoice.notes,
    },
    (lineItems ?? []) as Array<{
      description: string | null
      quantity: number | null
      unit_price_cents: number | null
      total_cents: number | null
    }>,
    client,
    job ?? null
  )

  const pdf = await generateInvoicePDF(html)
  if (!pdf) return null

  const safeName = (client.company_name ?? client.full_name ?? 'client')
    .replace(/[^\w\d]+/g, '_')
    .slice(0, 40)
  const fileName = `${invoice.invoice_number ?? invoiceId}_${safeName}.pdf`

  const { uploadToDrive } = await import('@/lib/google')
  const result = await uploadToDrive({
    fileName,
    mimeType: 'application/pdf',
    content: pdf,
    folderId: folderSetting.value,
  })
  if (!result) return null

  await supabase
    .from('invoices')
    .update({ drive_file_id: result.id, drive_file_url: result.url })
    .eq('id', invoiceId)
  return result
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

/* ─────────── v1.2: Generate draft invoice from wrapped job ─────────── */

function addDaysIso(iso: string, n: number): string {
  const parts = iso.split('-').map(Number)
  if (parts.length !== 3 || parts.some(Number.isNaN)) return iso
  const d = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]))
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

/**
 * Create a draft invoice from a wrapped job. Pulls confirmed bookings as
 * line items, sets invoice_period_start = job.end_date + 1 day, and
 * due_date = end_date + 31 days. Idempotent: if a non-void invoice
 * already exists for this job we return it instead of creating a dupe.
 */
export async function generateDraftInvoiceFromJob(formData: FormData) {
  const { supabase, user } = await requireAdmin()
  const jobId = ((formData.get('jobId') as string) ?? '').trim()
  if (!jobId) return

  const { data: job } = await supabase
    .from('jobs')
    .select('id, title, status, client_id, start_date, end_date, shoot_days')
    .eq('id', jobId)
    .maybeSingle()
  if (!job || !job.client_id) return

  // Idempotency: reuse any existing non-void invoice for this job.
  const { data: existing } = await supabase
    .from('invoices')
    .select('id')
    .eq('job_id', jobId)
    .neq('status', 'void')
    .limit(1)
    .maybeSingle()
  if (existing) {
    revalidatePath('/admin/finance')
    redirect(`/admin/finance/${existing.id}`)
  }

  // Shoot-day count for rate math: prefer shoot_days[] length, fall
  // back to start..end range, fall back to 1.
  let shootDays = 1
  if (Array.isArray(job.shoot_days) && job.shoot_days.length > 0) {
    shootDays = job.shoot_days.length
  } else if (job.start_date && job.end_date) {
    const start = new Date(job.start_date)
    const end = new Date(job.end_date)
    const diff = Math.round(
      (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)
    )
    shootDays = Math.max(1, diff + 1)
  }

  // Pull confirmed bookings as line items.
  const { data: bookings } = await supabase
    .from('job_bookings')
    .select(
      `id, talent_id, confirmed_rate_cents, offered_rate_cents, status,
       profiles!job_bookings_talent_id_fkey (first_name, last_name, full_name,
         talent_profiles (primary_role))`
    )
    .eq('job_id', jobId)
    .in('status', ['confirmed', 'completed'])

  type BRow = {
    id: string
    talent_id: string
    confirmed_rate_cents: number | null
    offered_rate_cents: number | null
    profiles:
      | {
          first_name: string | null
          last_name: string | null
          full_name: string | null
          talent_profiles:
            | { primary_role: string | null }
            | { primary_role: string | null }[]
            | null
        }
      | {
          first_name: string | null
          last_name: string | null
          full_name: string | null
          talent_profiles:
            | { primary_role: string | null }
            | { primary_role: string | null }[]
            | null
        }[]
      | null
  }
  const rows = (bookings ?? []) as unknown as BRow[]
  const lineItems = rows.map((b) => {
    const p = Array.isArray(b.profiles) ? b.profiles[0] ?? null : b.profiles
    const tp = p
      ? Array.isArray(p.talent_profiles)
        ? p.talent_profiles[0] ?? null
        : p.talent_profiles
      : null
    const name =
      [p?.first_name, p?.last_name].filter(Boolean).join(' ') ||
      p?.full_name ||
      'Talent'
    const role = tp?.primary_role ?? null
    // Invoice line items ALWAYS use the client-facing rate (talent net ÷ 0.85).
    const talentNet = b.confirmed_rate_cents ?? b.offered_rate_cents ?? 0
    const unit = Math.round(talentNet * 1.15)
    return {
      description: role ? `${name} — ${role} (${shootDays} day${shootDays === 1 ? '' : 's'})` : name,
      quantity: shootDays,
      unit_price_cents: unit,
      total_cents: unit * shootDays,
      booking_id: b.id,
      talent_id: b.talent_id,
    }
  })

  const subtotal = lineItems.reduce((s, li) => s + li.total_cents, 0)
  const taxCents = 0
  const total = subtotal + taxCents
  const rsFeePercent = 15
  const rsFeeCents = Math.round((total * rsFeePercent) / 100)
  const clientTotalCents = total + rsFeeCents
  const invoiceNumber = await nextInvoiceNumber(supabase)

  const periodStart = job.end_date ? addDaysIso(job.end_date, 1) : todayIsoLA()
  const dueDate = job.end_date
    ? addDaysIso(job.end_date, 31)
    : addDaysIso(todayIsoLA(), 30)

  const { data: inv, error } = await supabase
    .from('invoices')
    .insert({
      job_id: jobId,
      client_id: job.client_id,
      invoice_number: invoiceNumber,
      status: 'draft',
      total_cents: total,
      tax_cents: taxCents,
      rs_fee_percent: rsFeePercent,
      rs_fee_cents: rsFeeCents,
      client_total_cents: clientTotalCents,
      invoice_verified: false,
      invoice_period_start: periodStart,
      due_date: dueDate,
      late_fee_rate: 0,
      late_fee_cents: 0,
      notes: job.title ? `Invoice for ${job.title}.` : null,
      created_by: user.id,
    })
    .select('id')
    .single()
  if (error || !inv) return

  if (lineItems.length > 0) {
    await supabase.from('invoice_line_items').insert(
      lineItems.map((li) => ({
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

/**
 * v1.2 one-shot send: generate PDF, upload to Drive, email client with
 * PDF attached, flip status → 'sent'. Replaces the old verify-then-
 * Gmail flow. Requires invoice_verified=true for safety.
 */
export async function sendInvoice(formData: FormData) {
  const { supabase } = await requireAdmin()
  const invoiceId = ((formData.get('invoiceId') as string) ?? '').trim()
  if (!invoiceId) return { error: 'Missing invoice id' }

  const { data: invoice } = await supabase
    .from('invoices')
    .select(
      `id, invoice_number, client_id, job_id, status, total_cents, tax_cents,
       rs_fee_cents, rs_fee_percent, client_total_cents, due_date,
       invoice_period_start, notes, created_at, invoice_verified`
    )
    .eq('id', invoiceId)
    .maybeSingle()
  if (!invoice) return { error: 'Invoice not found' }
  if (invoice.status !== 'draft' && invoice.status !== 'overdue') {
    return { error: `Invoice already ${invoice.status}` }
  }
  if (!invoice.invoice_verified) {
    return { error: 'Verify the invoice before sending.' }
  }

  const svc = createServiceClient()
  const [{ data: lineItems }, { data: clientProfile }, { data: job }] =
    await Promise.all([
      svc
        .from('invoice_line_items')
        .select('description, quantity, unit_price_cents, total_cents')
        .eq('invoice_id', invoiceId)
        .order('created_at', { ascending: true }),
      svc
        .from('profiles')
        .select(
          `id, full_name, email,
           client_profiles (company_name, billing_email)`
        )
        .eq('id', invoice.client_id)
        .maybeSingle(),
      invoice.job_id
        ? svc
            .from('jobs')
            .select('title, start_date, end_date')
            .eq('id', invoice.job_id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
    ])

  type CP = { company_name: string | null; billing_email: string | null } | null
  const rawCp = (clientProfile as unknown as { client_profiles?: CP | CP[] } | null)
    ?.client_profiles
  const cp: CP = Array.isArray(rawCp) ? (rawCp[0] ?? null) : (rawCp ?? null)
  const recipientEmail =
    cp?.billing_email ||
    (clientProfile as unknown as { email?: string } | null)?.email ||
    null
  if (!recipientEmail) {
    return { error: 'No billing email on file for this client.' }
  }

  const { generateInvoiceHTML, generateInvoicePDF } = await import(
    '@/lib/invoice-pdf'
  )
  const html = generateInvoiceHTML(
    {
      invoice_number: invoice.invoice_number,
      created_at: invoice.created_at,
      due_date: invoice.due_date,
      total_cents: invoice.total_cents,
      tax_cents: invoice.tax_cents,
      rs_fee_cents: invoice.rs_fee_cents,
      rs_fee_percent: invoice.rs_fee_percent,
      client_total_cents: invoice.client_total_cents,
      notes: invoice.notes,
    },
    (lineItems ?? []) as Array<{
      description: string | null
      quantity: number | null
      unit_price_cents: number | null
      total_cents: number | null
    }>,
    {
      company_name: cp?.company_name ?? null,
      billing_email: cp?.billing_email ?? null,
      full_name:
        (clientProfile as unknown as { full_name?: string | null } | null)
          ?.full_name ?? null,
      email:
        (clientProfile as unknown as { email?: string | null } | null)?.email ??
        null,
    },
    job ?? null
  )

  const pdf = await generateInvoicePDF(html)

  // Drive upload — best effort.
  let driveUrl: string | null = null
  if (pdf) {
    try {
      const { data: folderSetting } = await svc
        .from('admin_settings')
        .select('value')
        .eq('key', 'drive_invoices_2026_id')
        .maybeSingle()
      if (folderSetting?.value) {
        const safeName = (cp?.company_name ?? (clientProfile as unknown as { full_name?: string } | null)?.full_name ?? 'client')
          .replace(/[^\w\d]+/g, '_')
          .slice(0, 40)
        const fileName = `${invoice.invoice_number ?? invoiceId}_${safeName}.pdf`
        const { uploadToDrive } = await import('@/lib/google')
        const result = await uploadToDrive({
          fileName,
          mimeType: 'application/pdf',
          content: pdf,
          folderId: folderSetting.value,
        })
        if (result) {
          driveUrl = result.url
          await svc
            .from('invoices')
            .update({
              drive_file_id: result.id,
              drive_file_url: result.url,
            })
            .eq('id', invoiceId)
        }
      }
    } catch {
      // non-fatal
    }
  }

  // Email via Resend with PDF attachment.
  const { sendTransactionalEmail } = await import('@/lib/email')
  const clientName =
    cp?.company_name ||
    (clientProfile as unknown as { full_name?: string | null } | null)
      ?.full_name ||
    'there'
  const dueLong = invoice.due_date
    ? new Date(invoice.due_date).toLocaleDateString('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      })
    : 'on receipt'
  const jobTitle = (job as { title?: string } | null)?.title ?? 'your recent shoot'
  const totalFmt = invoice.client_total_cents
    ? `$${(invoice.client_total_cents / 100).toLocaleString('en-US', { maximumFractionDigits: 0 })}`
    : ''
  const bodyHtml = `
    <p>Hi ${clientName},</p>
    <p>Your invoice for <strong>${jobTitle}</strong> is attached${totalFmt ? ` (total ${totalFmt})` : ''}.</p>
    <p><strong>Payment is due by ${dueLong}.</strong> Late payment fees apply as set out in the Rowly Studios Client Platform Agreement.</p>
    ${driveUrl ? `<p>A copy is also available at <a href="${driveUrl}">${driveUrl}</a>.</p>` : ''}
    <p>Thank you,<br/>Rowly Studios</p>
  `
  const mailResult = await sendTransactionalEmail({
    to: recipientEmail,
    subject: `Invoice ${invoice.invoice_number ?? ''} — Rowly Studios`.trim(),
    html: bodyHtml,
    attachments:
      pdf
        ? [
            {
              filename: `${invoice.invoice_number ?? 'invoice'}.pdf`,
              content: Buffer.from(pdf).toString('base64'),
              contentType: 'application/pdf',
            },
          ]
        : undefined,
  })
  if (mailResult.error && mailResult.error !== 'not_configured') {
    return { error: `Email failed: ${mailResult.error}` }
  }

  // Flip status + sent_at + gmail_message_id (reused for resend message id).
  await svc
    .from('invoices')
    .update({
      status: 'sent',
      sent_at: new Date().toISOString(),
      resend_message_id: mailResult.id ?? null,
    })
    .eq('id', invoiceId)

  revalidatePath('/admin/finance')
  revalidatePath(`/admin/finance/${invoiceId}`)
  return { ok: true, emailSent: !mailResult.error, driveUrl }
}

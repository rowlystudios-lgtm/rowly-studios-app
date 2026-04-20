'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase-server'
import { createServiceClient } from '@/lib/supabase-service'
import { uploadDocumentToDrive } from '@/lib/google'

type DocumentRole = 'talent' | 'client'

/**
 * Resolve the signed-in user plus whether they're an admin — both are
 * needed to gate delete / link / unlink operations. Returns null if the
 * caller is anonymous.
 */
async function requireUser(): Promise<
  | {
      supabase: Awaited<ReturnType<typeof createClient>>
      userId: string
      isAdmin: boolean
    }
  | null
> {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle()
  return {
    supabase,
    userId: user.id,
    isAdmin: profile?.role === 'admin',
  }
}

/**
 * Delete a tax_documents row + its storage object. Owners can delete
 * their own; admins can delete any. Drive copies are intentionally left
 * intact — we keep Drive as the canonical archive.
 */
export async function deleteDocument(formData: FormData): Promise<void> {
  const id = ((formData.get('id') as string) ?? '').trim()
  if (!id) return
  const ctx = await requireUser()
  if (!ctx) return

  const service = createServiceClient()
  const { data: doc } = await service
    .from('tax_documents')
    .select('id, owner_id, owner_role, storage_path, linked_invoice_id')
    .eq('id', id)
    .maybeSingle()
  if (!doc) return
  if (!ctx.isAdmin && doc.owner_id !== ctx.userId) return

  // Best-effort storage delete — don't block the row delete on it.
  if (doc.storage_path) {
    try {
      await service.storage.from('tax-documents').remove([doc.storage_path])
    } catch {
      // leave the object orphaned rather than failing the whole action
    }
  }

  await service.from('tax_documents').delete().eq('id', id)

  // Revalidate any surface that might render this document.
  revalidatePath('/app/profile')
  revalidatePath('/app/account')
  if (doc.owner_role === 'talent') {
    revalidatePath(`/admin/talent/${doc.owner_id}`)
  } else {
    revalidatePath(`/admin/clients/${doc.owner_id}`)
  }
  if (doc.linked_invoice_id) {
    revalidatePath(`/admin/finance/${doc.linked_invoice_id}`)
  }
}

/** Admin-only: link an existing document to an invoice. */
export async function linkDocumentToInvoice(formData: FormData): Promise<void> {
  const documentId = ((formData.get('documentId') as string) ?? '').trim()
  const invoiceId = ((formData.get('invoiceId') as string) ?? '').trim()
  if (!documentId || !invoiceId) return
  const ctx = await requireUser()
  if (!ctx || !ctx.isAdmin) return

  const service = createServiceClient()
  // Resolve the invoice's job id so the link also surfaces on the job view.
  const { data: inv } = await service
    .from('invoices')
    .select('job_id')
    .eq('id', invoiceId)
    .maybeSingle()
  await service
    .from('tax_documents')
    .update({
      linked_invoice_id: invoiceId,
      linked_job_id: inv?.job_id ?? null,
    })
    .eq('id', documentId)
  revalidatePath(`/admin/finance/${invoiceId}`)
}

/** Admin-only: remove an invoice link (but keep the job link if any). */
export async function unlinkDocument(formData: FormData): Promise<void> {
  const documentId = ((formData.get('documentId') as string) ?? '').trim()
  if (!documentId) return
  const ctx = await requireUser()
  if (!ctx || !ctx.isAdmin) return
  const service = createServiceClient()
  const { data: before } = await service
    .from('tax_documents')
    .select('linked_invoice_id')
    .eq('id', documentId)
    .maybeSingle()
  const prevInvoice = before?.linked_invoice_id ?? null
  await service
    .from('tax_documents')
    .update({ linked_invoice_id: null })
    .eq('id', documentId)
  if (prevInvoice) {
    revalidatePath(`/admin/finance/${prevInvoice}`)
  }
}

/**
 * Admin-only: update the admin_notes free-text on a document. Useful for
 * flagging questionable W-9s / compliance gaps.
 */
export async function setDocumentAdminNotes(formData: FormData): Promise<void> {
  const documentId = ((formData.get('documentId') as string) ?? '').trim()
  const notes = ((formData.get('notes') as string) ?? '').trim() || null
  if (!documentId) return
  const ctx = await requireUser()
  if (!ctx || !ctx.isAdmin) return
  const service = createServiceClient()
  const { data: doc } = await service
    .from('tax_documents')
    .select('owner_id, owner_role')
    .eq('id', documentId)
    .maybeSingle()
  await service
    .from('tax_documents')
    .update({
      admin_notes: notes,
      reviewed_by: ctx.userId,
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', documentId)
  if (doc) {
    if (doc.owner_role === 'talent') {
      revalidatePath(`/admin/talent/${doc.owner_id}`)
    } else {
      revalidatePath(`/admin/clients/${doc.owner_id}`)
    }
  }
}

/**
 * Admin-only: upload a document on behalf of another user. The file
 * arrives as a File inside multipart FormData; we write it to the
 * user's folder in Supabase Storage, insert a tax_documents row, then
 * fire-and-forget the Drive sync. Returns an error string for the form
 * to surface if something goes wrong.
 */
export async function adminUploadDocument(
  formData: FormData
): Promise<{ error?: string; id?: string }> {
  const ctx = await requireUser()
  if (!ctx || !ctx.isAdmin) return { error: 'Not authorised' }

  const ownerId = ((formData.get('ownerId') as string) ?? '').trim()
  const documentType =
    ((formData.get('documentType') as string) ?? '').trim() || null
  const taxYearRaw = ((formData.get('taxYear') as string) ?? '').trim()
  const description =
    ((formData.get('description') as string) ?? '').trim() || null
  const file = formData.get('file')
  if (!ownerId || !documentType) return { error: 'Missing fields' }
  if (!(file instanceof File) || file.size === 0)
    return { error: 'Missing file' }
  if (file.size > 10 * 1024 * 1024)
    return { error: 'File too large (max 10MB)' }

  const service = createServiceClient()
  const { data: owner } = await service
    .from('profiles')
    .select('role')
    .eq('id', ownerId)
    .maybeSingle()
  if (!owner) return { error: 'Unknown owner' }
  const ownerRole: DocumentRole =
    owner.role === 'client' ? 'client' : 'talent'

  const sanitized = file.name.replace(/[^\w.\- ]+/g, '_').slice(0, 120)
  const path = `${ownerId}/${Date.now()}-${sanitized}`
  const bytes = Buffer.from(await file.arrayBuffer())
  const uploadRes = await service.storage
    .from('tax-documents')
    .upload(path, bytes, {
      contentType: file.type || 'application/octet-stream',
      upsert: false,
    })
  if (uploadRes.error) return { error: uploadRes.error.message }

  const taxYear = taxYearRaw ? parseInt(taxYearRaw, 10) : null
  const { data: inserted, error: insertError } = await service
    .from('tax_documents')
    .insert({
      owner_id: ownerId,
      owner_role: ownerRole,
      document_type: documentType,
      tax_year:
        taxYear != null && Number.isFinite(taxYear) ? taxYear : null,
      description,
      file_name: file.name,
      file_size_bytes: file.size,
      mime_type: file.type || null,
      storage_path: path,
      status: 'uploaded',
    })
    .select('id')
    .single()

  if (insertError || !inserted) {
    // Clean up the orphaned storage object if the row insert failed.
    try {
      await service.storage.from('tax-documents').remove([path])
    } catch {
      // ignore
    }
    return { error: insertError?.message ?? 'insert failed' }
  }

  // Fire-and-forget the Drive sync so the admin UI doesn't block on it.
  void uploadDocumentToDrive(inserted.id).catch(() => undefined)

  if (ownerRole === 'talent') {
    revalidatePath(`/admin/talent/${ownerId}`)
  } else {
    revalidatePath(`/admin/clients/${ownerId}`)
  }
  return { id: inserted.id }
}

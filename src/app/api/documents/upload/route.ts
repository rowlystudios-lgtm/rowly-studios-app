import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { createServiceClient } from '@/lib/supabase-service'
import { uploadDocumentToDrive } from '@/lib/google'

export const runtime = 'nodejs'

// 10 MB hard cap, matching the client-side validation.
const MAX_SIZE = 10 * 1024 * 1024

// Keep the allowed list deliberately narrow — avoids exec-able types and
// random binary blobs landing in the bucket.
const ALLOWED_MIME = new Set([
  'application/pdf',
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/heic',
  'image/heif',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
])

const ALLOWED_EXT = new Set([
  'pdf',
  'jpg',
  'jpeg',
  'png',
  'heic',
  'heif',
  'doc',
  'docx',
])

/**
 * POST /api/documents/upload — multipart upload for tax / identity
 * documents. Owners upload their own files; admins can use
 * adminUploadDocument server action for uploading on behalf of someone
 * else. Storage path format: ${user_id}/${timestamp}-${sanitised_name}.
 */
export async function POST(request: Request) {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 })
  }

  const file = form.get('file')
  const documentType = ((form.get('documentType') as string) ?? '').trim()
  const taxYearRaw = ((form.get('taxYear') as string) ?? '').trim()
  const description = ((form.get('description') as string) ?? '').trim() || null
  const linkedInvoiceId =
    ((form.get('linkedInvoiceId') as string) ?? '').trim() || null
  const linkedJobId =
    ((form.get('linkedJobId') as string) ?? '').trim() || null

  if (!documentType) {
    return NextResponse.json(
      { error: 'Document type is required' },
      { status: 400 }
    )
  }
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 })
  }
  if (file.size > MAX_SIZE) {
    return NextResponse.json(
      { error: 'File too large (max 10MB)' },
      { status: 400 }
    )
  }

  // Validate mime + extension — belt + braces since browsers are inconsistent
  // with content-type on uploads (Safari in particular).
  const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
  const mimeOk =
    !file.type ||
    ALLOWED_MIME.has(file.type) ||
    file.type.startsWith('image/') // HEIC on Safari sometimes reports image/heic-sequence
  if (!ALLOWED_EXT.has(ext) && !mimeOk) {
    return NextResponse.json(
      { error: 'Unsupported file type' },
      { status: 400 }
    )
  }

  // Look up owner role so the downstream Drive sync picks the right parent.
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle()
  const ownerRole: 'talent' | 'client' =
    profile?.role === 'client' ? 'client' : 'talent'

  const sanitized = file.name.replace(/[^\w.\- ]+/g, '_').slice(0, 120)
  const storagePath = `${user.id}/${Date.now()}-${sanitized}`

  // Use the service client for the storage write so we don't depend on
  // the caller's RLS policy nuances (the auth check above is the gate).
  const service = createServiceClient()
  const bytes = Buffer.from(await file.arrayBuffer())
  const uploadRes = await service.storage
    .from('tax-documents')
    .upload(storagePath, bytes, {
      contentType: file.type || 'application/octet-stream',
      upsert: false,
    })
  if (uploadRes.error) {
    return NextResponse.json(
      { error: uploadRes.error.message },
      { status: 500 }
    )
  }

  const taxYear = taxYearRaw ? parseInt(taxYearRaw, 10) : null
  const { data: inserted, error: insertError } = await service
    .from('tax_documents')
    .insert({
      owner_id: user.id,
      owner_role: ownerRole,
      document_type: documentType,
      tax_year: taxYear != null && Number.isFinite(taxYear) ? taxYear : null,
      description,
      file_name: file.name,
      file_size_bytes: file.size,
      mime_type: file.type || null,
      storage_path: storagePath,
      linked_invoice_id: linkedInvoiceId,
      linked_job_id: linkedJobId,
      status: 'uploaded',
    })
    .select('id')
    .single()

  if (insertError || !inserted) {
    // Row insert failed — don't leave an orphaned object behind.
    try {
      await service.storage.from('tax-documents').remove([storagePath])
    } catch {
      // ignore cleanup errors
    }
    return NextResponse.json(
      { error: insertError?.message ?? 'insert failed' },
      { status: 500 }
    )
  }

  // Fire-and-forget Drive sync — the response returns as soon as the row
  // lands so the user sees "Uploaded" without waiting on external APIs.
  void uploadDocumentToDrive(inserted.id).catch(() => undefined)

  return NextResponse.json({ id: inserted.id, status: 'uploaded' })
}

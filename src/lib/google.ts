import { google } from 'googleapis'
import { Readable } from 'stream'

/**
 * Google service-account auth. Returns `null` when the env var is missing
 * so the rest of the app can fail soft instead of crashing.
 */
function getAuth() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON
  if (!raw) {
    // eslint-disable-next-line no-console
    console.warn('GOOGLE_SERVICE_ACCOUNT_JSON not set — Drive sync disabled')
    return null
  }
  try {
    const credentials = JSON.parse(raw)
    return new google.auth.GoogleAuth({
      credentials,
      scopes: [
        'https://www.googleapis.com/auth/drive',
        'https://www.googleapis.com/auth/spreadsheets',
      ],
    })
  } catch {
    // eslint-disable-next-line no-console
    console.error('Invalid GOOGLE_SERVICE_ACCOUNT_JSON')
    return null
  }
}

export function isGoogleConfigured(): boolean {
  return Boolean(process.env.GOOGLE_SERVICE_ACCOUNT_JSON)
}

export async function getDrive() {
  const auth = getAuth()
  if (!auth) return null
  return google.drive({ version: 'v3', auth })
}

export async function getSheets() {
  const auth = getAuth()
  if (!auth) return null
  return google.sheets({ version: 'v4', auth })
}

export async function uploadToDrive({
  fileName,
  mimeType,
  content,
  folderId,
}: {
  fileName: string
  mimeType: string
  content: Buffer | string
  folderId: string
}): Promise<{ id: string; url: string } | null> {
  try {
    const drive = await getDrive()
    if (!drive) return null
    const stream = new Readable()
    stream.push(content)
    stream.push(null)
    const res = await drive.files.create({
      requestBody: { name: fileName, parents: [folderId] },
      media: { mimeType, body: stream },
      fields: 'id,webViewLink',
      supportsAllDrives: true,
    })
    const id = res.data.id ?? null
    const url = res.data.webViewLink ?? null
    if (!id || !url) return null
    return { id, url }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Drive upload failed:', err)
    return null
  }
}

/**
 * Locate a Drive subfolder by exact name inside `parentFolderId`. Returns
 * the folder id if found, otherwise null. Shared drives are supported.
 */
export async function findDriveFolder(
  parentFolderId: string,
  name: string
): Promise<string | null> {
  try {
    const drive = await getDrive()
    if (!drive) return null
    const escaped = name.replace(/'/g, "\\'")
    const res = await drive.files.list({
      q: `mimeType = 'application/vnd.google-apps.folder' and trashed = false and name = '${escaped}' and '${parentFolderId}' in parents`,
      fields: 'files(id, name)',
      pageSize: 1,
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    })
    return res.data.files?.[0]?.id ?? null
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Drive findFolder failed:', err)
    return null
  }
}

/**
 * Create a Drive subfolder beneath `parentFolderId`. Returns the new
 * folder id or null on failure.
 */
export async function createDriveFolder(
  parentFolderId: string,
  name: string
): Promise<string | null> {
  try {
    const drive = await getDrive()
    if (!drive) return null
    const res = await drive.files.create({
      requestBody: {
        name,
        mimeType: 'application/vnd.google-apps.folder',
        parents: [parentFolderId],
      },
      fields: 'id',
      supportsAllDrives: true,
    })
    return res.data.id ?? null
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Drive createFolder failed:', err)
    return null
  }
}

/**
 * Find-or-create a folder in one call — useful when bucketing uploads
 * per-user beneath a stable parent (e.g. "[share_code] — [full_name]").
 */
export async function ensureDriveFolder(
  parentFolderId: string,
  name: string
): Promise<string | null> {
  const existing = await findDriveFolder(parentFolderId, name)
  if (existing) return existing
  return createDriveFolder(parentFolderId, name)
}

export async function appendToSheet(
  spreadsheetId: string,
  range: string,
  values: (string | number | boolean | null)[]
): Promise<boolean> {
  try {
    const sheets = await getSheets()
    if (!sheets) return false
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range,
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values: [values] },
    })
    return true
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Sheets append failed:', err)
    return false
  }
}

export async function overwriteSheet(
  spreadsheetId: string,
  range: string,
  values: (string | number | boolean | null)[][]
): Promise<boolean> {
  try {
    const sheets = await getSheets()
    if (!sheets) return false
    // Clear first so stale rows below the new data disappear.
    await sheets.spreadsheets.values
      .clear({ spreadsheetId, range: range.split('!')[0] ?? range })
      .catch(() => null)
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values },
    })
    return true
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Sheets overwrite failed:', err)
    return false
  }
}

/**
 * Sync a tax_documents row out to Google Drive. The file is read from
 * Supabase Storage, placed into a per-user subfolder under either the
 * Talent Tax or Client Documents parent, and the tax_documents row is
 * updated with Drive ids + status. Intended to be fire-and-forget from
 * the upload API route — every failure sets status='error'.
 */
export async function uploadDocumentToDrive(
  documentId: string
): Promise<void> {
  const { createServiceClient } = await import('@/lib/supabase-service')
  const supabase = createServiceClient()

  const { data: doc } = await supabase
    .from('tax_documents')
    .select(
      `id, owner_id, owner_role, document_type, tax_year,
       file_name, mime_type, storage_path, status`
    )
    .eq('id', documentId)
    .maybeSingle()

  if (!doc) return
  if (!doc.storage_path) {
    await supabase
      .from('tax_documents')
      .update({ status: 'error', upload_error: 'missing storage_path' })
      .eq('id', documentId)
    return
  }

  // Which Drive parent folder depends on owner role.
  const folderKey =
    doc.owner_role === 'client'
      ? 'drive_client_docs_folder_id'
      : 'drive_tax_docs_folder_id'
  const { data: folderSetting } = await supabase
    .from('admin_settings')
    .select('value')
    .eq('key', folderKey)
    .maybeSingle()
  const parentFolderId = folderSetting?.value ?? null
  if (!parentFolderId) {
    await supabase
      .from('tax_documents')
      .update({
        status: 'error',
        upload_error: `missing admin_settings.${folderKey}`,
      })
      .eq('id', documentId)
    return
  }

  // Per-owner subfolder named "[share_code] — [full_name]" (or a safe
  // fallback). Falls back to just the user id if we can't read either.
  const { data: ownerProfile } = await supabase
    .from('profiles')
    .select('full_name, share_code')
    .eq('id', doc.owner_id)
    .maybeSingle()
  const ownerName = ownerProfile?.full_name ?? ''
  const ownerCode = ownerProfile?.share_code ?? ''
  const subFolderName =
    ownerCode && ownerName
      ? `${ownerCode} — ${ownerName}`
      : ownerName ||
        ownerCode ||
        doc.owner_id.slice(0, 8)

  try {
    const subFolderId = await ensureDriveFolder(parentFolderId, subFolderName)
    if (!subFolderId) {
      throw new Error('could not resolve/create Drive subfolder')
    }

    // Pull the actual bytes out of Supabase Storage via the service client.
    const { data: blob, error: dlError } = await supabase.storage
      .from('tax-documents')
      .download(doc.storage_path)
    if (dlError || !blob) {
      throw new Error(dlError?.message ?? 'storage download failed')
    }
    const arrayBuf = await blob.arrayBuffer()
    const content = Buffer.from(arrayBuf)

    // Canonical filename: "[type]_[year]_[original]" — keeps Drive browsable.
    const safeOriginal = (doc.file_name || 'document').replace(/[^\w.\- ]+/g, '_')
    const yearPart = doc.tax_year ? `_${doc.tax_year}` : ''
    const fileName = `${doc.document_type}${yearPart}_${safeOriginal}`

    const uploaded = await uploadToDrive({
      fileName,
      mimeType: doc.mime_type ?? blob.type ?? 'application/octet-stream',
      content,
      folderId: subFolderId,
    })
    if (!uploaded) throw new Error('Drive upload returned null')

    await supabase
      .from('tax_documents')
      .update({
        drive_file_id: uploaded.id,
        drive_file_url: uploaded.url,
        drive_folder_id: subFolderId,
        status: 'drive_synced',
        upload_error: null,
      })
      .eq('id', documentId)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown error'
    await supabase
      .from('tax_documents')
      .update({ status: 'error', upload_error: msg })
      .eq('id', documentId)
  }
}

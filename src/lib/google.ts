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

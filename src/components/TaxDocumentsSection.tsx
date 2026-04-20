'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuth } from '@/lib/auth-context'
import { deleteDocument } from '@/app/actions/documents'

/**
 * Document-type lists by role — kept alongside the component so the
 * UI never renders an option that the backend doesn't accept.
 */
export const TALENT_DOCUMENT_TYPES = [
  { value: 'w9', label: 'W-9 Form', needsYear: true },
  { value: '1099-nec', label: '1099-NEC', needsYear: true },
  { value: '1099-misc', label: '1099-MISC', needsYear: true },
  { value: 'business_license', label: 'Business License', needsYear: false },
  {
    value: 'ein_letter',
    label: 'EIN Confirmation Letter',
    needsYear: false,
  },
  {
    value: 'sole_prop_registration',
    label: 'Sole Proprietor Registration',
    needsYear: false,
  },
  {
    value: 'llc_formation',
    label: 'LLC Formation Document',
    needsYear: false,
  },
  { value: 'id_right_to_work', label: 'ID / Right to Work', needsYear: false },
  { value: 'other', label: 'Other', needsYear: false },
] as const

export const CLIENT_DOCUMENT_TYPES = [
  { value: 'w9', label: 'W-9 Form', needsYear: true },
  { value: 'business_license', label: 'Business License', needsYear: false },
  {
    value: 'ein_confirmation',
    label: 'EIN / Tax ID Confirmation',
    needsYear: false,
  },
  {
    value: 'incorporation',
    label: 'Certificate of Incorporation',
    needsYear: false,
  },
  {
    value: 'state_registration',
    label: 'State Business Registration',
    needsYear: false,
  },
  {
    value: 'tax_exemption',
    label: 'Tax Exemption Certificate',
    needsYear: false,
  },
  { value: 'vendor_agreement', label: 'Vendor Agreement', needsYear: false },
  { value: 'insurance', label: 'Insurance Certificate', needsYear: false },
  { value: 'other', label: 'Other', needsYear: false },
] as const

type DocumentType = { value: string; label: string; needsYear: boolean }

export type TaxDocRow = {
  id: string
  document_type: string
  tax_year: number | null
  description: string | null
  file_name: string
  file_size_bytes: number | null
  status: string
  drive_file_url: string | null
  linked_invoice_id: string | null
  created_at: string | null
}

type Props = {
  /** Whose documents to render. Defaults to the signed-in user. */
  ownerId?: string
  role: 'talent' | 'client'
  /** Palette — lets the talent cream/navy + client navy variants share code. */
  variant?: 'dark' | 'light'
  /** When false the section renders fully expanded (admin detail view). */
  collapsible?: boolean
  /** Optional initial-open flag for collapsible mode. */
  defaultOpen?: boolean
}

function fmtSize(bytes: number | null | undefined): string {
  if (!bytes && bytes !== 0) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function fmtDate(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

/**
 * Visual status chip — consistent across the whole docs UI.
 */
function StatusChip({ status, variant }: { status: string; variant: 'dark' | 'light' }) {
  const base: React.CSSProperties = {
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
    padding: '2px 8px',
    borderRadius: 999,
    whiteSpace: 'nowrap',
  }
  if (status === 'drive_synced') {
    return (
      <span
        style={{
          ...base,
          background: 'rgba(34,197,94,0.18)',
          color: '#4ADE80',
          border: '1px solid rgba(34,197,94,0.35)',
        }}
      >
        In Drive
      </span>
    )
  }
  if (status === 'error') {
    return (
      <span
        style={{
          ...base,
          background: 'rgba(239,68,68,0.15)',
          color: '#F87171',
          border: '1px solid rgba(239,68,68,0.35)',
        }}
      >
        Upload error
      </span>
    )
  }
  return (
    <span
      style={{
        ...base,
        background:
          variant === 'light'
            ? 'rgba(26,60,107,0.1)'
            : 'rgba(170,189,224,0.15)',
        color: variant === 'light' ? '#1A3C6B' : '#AABDE0',
        border:
          variant === 'light'
            ? '1px solid rgba(26,60,107,0.2)'
            : '1px solid rgba(170,189,224,0.25)',
      }}
    >
      Saved
    </span>
  )
}

export function TaxDocumentsSection({
  ownerId,
  role,
  variant = 'dark',
  collapsible = true,
  defaultOpen = false,
}: Props) {
  const { user, supabase } = useAuth()
  const effectiveOwnerId = ownerId ?? user?.id ?? null
  const typeList: readonly DocumentType[] =
    role === 'client' ? CLIENT_DOCUMENT_TYPES : TALENT_DOCUMENT_TYPES

  const [open, setOpen] = useState(collapsible ? defaultOpen : true)
  const [docs, setDocs] = useState<TaxDocRow[]>([])
  const [loading, setLoading] = useState(true)

  const [docType, setDocType] = useState('')
  const [taxYear, setTaxYear] = useState('')
  const [description, setDescription] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [successMsg, setSuccessMsg] = useState('')
  const [errorMsg, setErrorMsg] = useState('')
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const loadDocs = useCallback(async () => {
    if (!effectiveOwnerId) return
    setLoading(true)
    const { data } = await supabase
      .from('tax_documents')
      .select(
        `id, document_type, tax_year, description, file_name, file_size_bytes,
         status, drive_file_url, linked_invoice_id, created_at`
      )
      .eq('owner_id', effectiveOwnerId)
      .order('created_at', { ascending: false })
    setDocs(((data ?? []) as TaxDocRow[]) ?? [])
    setLoading(false)
  }, [effectiveOwnerId, supabase])

  useEffect(() => {
    if (open) void loadDocs()
  }, [open, loadDocs])

  const typeMeta = typeList.find((t) => t.value === docType)
  const needsYear = typeMeta?.needsYear ?? false

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault()
    setErrorMsg('')
    setSuccessMsg('')
    if (!docType || !file) return
    if (file.size > 10 * 1024 * 1024) {
      setErrorMsg('File too large (max 10MB).')
      return
    }
    setUploading(true)
    try {
      const fd = new FormData()
      fd.set('file', file)
      fd.set('documentType', docType)
      if (taxYear.trim()) fd.set('taxYear', taxYear.trim())
      if (description.trim()) fd.set('description', description.trim())
      const res = await fetch('/api/documents/upload', {
        method: 'POST',
        body: fd,
      })
      const payload = (await res.json().catch(() => ({}))) as {
        error?: string
        id?: string
      }
      if (!res.ok) {
        setErrorMsg(payload.error ?? 'Upload failed')
        setUploading(false)
        return
      }
      setSuccessMsg('✓ Uploaded and saved to records')
      setDocType('')
      setTaxYear('')
      setDescription('')
      setFile(null)
      if (fileInputRef.current) fileInputRef.current.value = ''
      await loadDocs()
      // Surface the Drive sync state after a short beat — serverless takes
      // a second or two for the Drive round-trip to land.
      setTimeout(() => {
        void loadDocs()
      }, 2500)
      setTimeout(() => setSuccessMsg(''), 3000)
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  async function handleDelete(docId: string) {
    if (deletingId) return
    if (!window.confirm('Remove this document?')) return
    setDeletingId(docId)
    const fd = new FormData()
    fd.set('id', docId)
    try {
      await deleteDocument(fd)
      setDocs((xs) => xs.filter((x) => x.id !== docId))
    } finally {
      setDeletingId(null)
    }
  }

  // Palette mapping — matches the existing talent / client surfaces.
  const isLight = variant === 'light'
  const textMuted = isLight ? '#496275' : '#AABDE0'
  const textPrimary = isLight ? '#1A3C6B' : '#FFFFFF'
  const cardBg = isLight ? '#fff' : '#2E5099'
  const cardBorder = isLight
    ? 'rgba(26,60,107,0.12)'
    : 'rgba(170,189,224,0.15)'
  const innerBg = isLight ? '#F8F6EE' : 'rgba(255,255,255,0.06)'
  const inputBorder = isLight
    ? '1px solid rgba(26,60,107,0.2)'
    : '1px solid rgba(170,189,224,0.25)'
  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '10px 12px',
    borderRadius: 8,
    background: isLight ? '#fff' : 'rgba(255,255,255,0.06)',
    color: textPrimary,
    border: inputBorder,
    fontSize: 14,
    outline: 'none',
  }

  return (
    <div
      style={{
        background: cardBg,
        border: `1px solid ${cardBorder}`,
        borderRadius: 12,
        overflow: 'hidden',
      }}
    >
      {/* Header — acts as the accordion toggle when collapsible. */}
      {collapsible ? (
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          style={{
            width: '100%',
            padding: '14px 16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            background: 'transparent',
            border: 'none',
            color: textPrimary,
            cursor: 'pointer',
            textAlign: 'left',
          }}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 16 }}>📄</span>
            <span style={{ fontSize: 14, fontWeight: 500 }}>Tax Documents</span>
          </span>
          <span
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              fontSize: 11,
              color: textMuted,
              fontWeight: 600,
              letterSpacing: '0.04em',
            }}
          >
            {docs.length > 0 && (
              <span>
                {docs.length} uploaded
              </span>
            )}
            <span
              style={{
                display: 'inline-block',
                transform: open ? 'rotate(180deg)' : 'none',
                transition: 'transform 160ms ease',
              }}
            >
              ⌄
            </span>
          </span>
        </button>
      ) : (
        <div style={{ padding: '14px 16px 0' }}>
          <p
            style={{
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              color: textMuted,
            }}
          >
            Tax Documents
          </p>
        </div>
      )}

      {open && (
        <div
          style={{
            padding: '4px 16px 16px',
            display: 'flex',
            flexDirection: 'column',
            gap: 16,
          }}
        >
          {/* ─── Upload form ─── */}
          <form
            onSubmit={handleUpload}
            style={{
              background: innerBg,
              borderRadius: 10,
              padding: 14,
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
              border: `1px solid ${cardBorder}`,
            }}
          >
            <p
              style={{
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: '0.14em',
                textTransform: 'uppercase',
                color: textMuted,
              }}
            >
              Upload new document
            </p>
            <select
              value={docType}
              onChange={(e) => setDocType(e.target.value)}
              style={inputStyle}
            >
              <option value="">Select document type</option>
              {typeList.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>

            {needsYear && (
              <input
                type="number"
                min={2020}
                max={2100}
                step={1}
                value={taxYear}
                onChange={(e) => setTaxYear(e.target.value)}
                placeholder="Year (e.g. 2026)"
                style={inputStyle}
              />
            )}

            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief description (optional)"
              maxLength={120}
              style={inputStyle}
            />

            <label
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '18px 14px',
                border: `2px dashed ${
                  isLight
                    ? 'rgba(26,60,107,0.3)'
                    : 'rgba(170,189,224,0.3)'
                }`,
                borderRadius: 10,
                cursor: 'pointer',
                background: isLight
                  ? 'rgba(255,255,255,0.6)'
                  : 'rgba(255,255,255,0.04)',
                textAlign: 'center',
              }}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,.heic,.heif,.doc,.docx,application/pdf,image/*"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  setFile(f ?? null)
                }}
                style={{ display: 'none' }}
              />
              <span
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: textPrimary,
                  marginBottom: 4,
                }}
              >
                {file ? file.name : 'Drop file here or tap to browse'}
              </span>
              <span style={{ fontSize: 11, color: textMuted }}>
                {file
                  ? fmtSize(file.size)
                  : 'PDF, JPG, PNG, HEIC, DOC — up to 10MB'}
              </span>
            </label>

            {errorMsg && (
              <p
                style={{
                  fontSize: 12,
                  color: '#DC2626',
                  background: 'rgba(220,38,38,0.1)',
                  padding: '8px 10px',
                  borderRadius: 8,
                }}
              >
                {errorMsg}
              </p>
            )}
            {successMsg && (
              <p
                style={{
                  fontSize: 12,
                  color: '#166534',
                  background: 'rgba(34,197,94,0.14)',
                  padding: '8px 10px',
                  borderRadius: 8,
                }}
              >
                {successMsg}
              </p>
            )}

            <button
              type="submit"
              disabled={uploading || !docType || !file}
              style={{
                padding: '10px 14px',
                borderRadius: 10,
                background: uploading || !docType || !file
                  ? isLight
                    ? 'rgba(26,60,107,0.25)'
                    : 'rgba(170,189,224,0.25)'
                  : isLight
                  ? '#1A3C6B'
                  : '#F0A500',
                color: isLight ? '#fff' : uploading || !docType || !file ? '#fff' : '#0F1B2E',
                border: 'none',
                fontSize: 13,
                fontWeight: 700,
                letterSpacing: '0.04em',
                cursor: uploading || !docType || !file ? 'not-allowed' : 'pointer',
              }}
            >
              {uploading ? 'Uploading…' : 'Upload document'}
            </button>
          </form>

          {/* ─── Existing docs list ─── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <p
              style={{
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: '0.14em',
                textTransform: 'uppercase',
                color: textMuted,
              }}
            >
              Uploaded documents
            </p>
            {loading ? (
              <p style={{ fontSize: 12, color: textMuted, fontStyle: 'italic' }}>
                Loading…
              </p>
            ) : docs.length === 0 ? (
              <p style={{ fontSize: 12, color: textMuted, fontStyle: 'italic' }}>
                No documents uploaded yet.
              </p>
            ) : (
              docs.map((d) => {
                const meta = typeList.find((t) => t.value === d.document_type)
                const label = meta?.label ?? d.document_type
                const isBusy = deletingId === d.id
                return (
                  <div
                    key={d.id}
                    style={{
                      padding: 12,
                      borderRadius: 10,
                      background: innerBg,
                      border: `1px solid ${cardBorder}`,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 4,
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 8,
                      }}
                    >
                      <span
                        style={{
                          fontSize: 14,
                          fontWeight: 600,
                          color: textPrimary,
                        }}
                      >
                        {label}
                      </span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        {d.status === 'drive_synced' && d.drive_file_url ? (
                          <a
                            href={d.drive_file_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            style={{ textDecoration: 'none' }}
                          >
                            <StatusChip status={d.status} variant={variant} />
                          </a>
                        ) : (
                          <StatusChip status={d.status} variant={variant} />
                        )}
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => handleDelete(d.id)}
                          aria-label="Delete document"
                          style={{
                            background: 'transparent',
                            border: 'none',
                            color: textMuted,
                            fontSize: 16,
                            cursor: isBusy ? 'wait' : 'pointer',
                            padding: '0 2px',
                            opacity: isBusy ? 0.5 : 1,
                          }}
                        >
                          ×
                        </button>
                      </div>
                    </div>
                    <div style={{ fontSize: 11, color: textMuted }}>
                      {[
                        d.tax_year ? String(d.tax_year) : null,
                        d.file_name,
                        fmtSize(d.file_size_bytes),
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </div>
                    {d.description && (
                      <p
                        style={{
                          fontSize: 11,
                          color: textMuted,
                          fontStyle: 'italic',
                        }}
                      >
                        {d.description}
                      </p>
                    )}
                    <div
                      style={{
                        fontSize: 10,
                        color: textMuted,
                        display: 'flex',
                        gap: 8,
                      }}
                    >
                      <span>{fmtDate(d.created_at)}</span>
                      {d.linked_invoice_id && (
                        <span
                          style={{
                            background: isLight
                              ? 'rgba(240,165,0,0.14)'
                              : 'rgba(240,165,0,0.18)',
                            color: '#F0A500',
                            padding: '1px 6px',
                            borderRadius: 999,
                            fontWeight: 600,
                            letterSpacing: '0.04em',
                            textTransform: 'uppercase',
                            fontSize: 9,
                          }}
                        >
                          Linked to invoice
                        </span>
                      )}
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>
      )}
    </div>
  )
}

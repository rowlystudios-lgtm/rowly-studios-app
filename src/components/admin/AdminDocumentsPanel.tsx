'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase-browser'
import {
  TALENT_DOCUMENT_TYPES,
  CLIENT_DOCUMENT_TYPES,
} from '@/components/TaxDocumentsSection'
import {
  adminUploadDocument,
  deleteDocument,
  setDocumentAdminNotes,
} from '@/app/actions/documents'

type AdminDocRow = {
  id: string
  document_type: string
  tax_year: number | null
  file_name: string
  file_size_bytes: number | null
  status: string
  drive_file_url: string | null
  upload_error: string | null
  linked_invoice_id: string | null
  admin_notes: string | null
  reviewed_at: string | null
  created_at: string | null
  invoices?: { invoice_number: string | null } | null
}

type Props = {
  ownerId: string
  role: 'talent' | 'client'
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

export function AdminDocumentsPanel({ ownerId, role }: Props) {
  const supabase = createClient()
  const types = role === 'client' ? CLIENT_DOCUMENT_TYPES : TALENT_DOCUMENT_TYPES

  const [docs, setDocs] = useState<AdminDocRow[]>([])
  const [loading, setLoading] = useState(true)

  // Upload form state
  const [addOpen, setAddOpen] = useState(false)
  const [docType, setDocType] = useState('')
  const [taxYear, setTaxYear] = useState('')
  const [description, setDescription] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [busyId, setBusyId] = useState<string | null>(null)
  const [notesDraft, setNotesDraft] = useState<Record<string, string>>({})

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('tax_documents')
      .select(
        `id, document_type, tax_year, file_name, file_size_bytes,
         status, drive_file_url, upload_error, linked_invoice_id,
         admin_notes, reviewed_at, created_at,
         invoices!tax_documents_linked_invoice_id_fkey (invoice_number)`
      )
      .eq('owner_id', ownerId)
      .order('created_at', { ascending: false })
    setDocs(((data ?? []) as unknown as AdminDocRow[]) ?? [])
    setLoading(false)
  }, [ownerId, supabase])

  useEffect(() => {
    void load()
  }, [load])

  const meta = types.find((t) => t.value === docType)
  const needsYear = meta?.needsYear ?? false

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault()
    setErrorMsg('')
    if (!docType || !file) return
    if (file.size > 10 * 1024 * 1024) {
      setErrorMsg('File too large (max 10MB)')
      return
    }
    setUploading(true)
    try {
      const fd = new FormData()
      fd.set('ownerId', ownerId)
      fd.set('documentType', docType)
      if (taxYear.trim()) fd.set('taxYear', taxYear.trim())
      if (description.trim()) fd.set('description', description.trim())
      fd.set('file', file)
      const result = await adminUploadDocument(fd)
      if (result.error) {
        setErrorMsg(result.error)
        return
      }
      setDocType('')
      setTaxYear('')
      setDescription('')
      setFile(null)
      if (fileInputRef.current) fileInputRef.current.value = ''
      setAddOpen(false)
      await load()
      // Drive sync often takes a second or two — re-fetch shortly.
      setTimeout(() => {
        void load()
      }, 2500)
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  async function handleDelete(id: string) {
    if (busyId) return
    if (!window.confirm('Delete this document?')) return
    setBusyId(id)
    const fd = new FormData()
    fd.set('id', id)
    try {
      await deleteDocument(fd)
      setDocs((xs) => xs.filter((x) => x.id !== id))
    } finally {
      setBusyId(null)
    }
  }

  async function handleSaveNotes(id: string) {
    const next = notesDraft[id]
    if (next === undefined) return
    setBusyId(id)
    const fd = new FormData()
    fd.set('documentId', id)
    fd.set('notes', next)
    try {
      await setDocumentAdminNotes(fd)
      setDocs((xs) =>
        xs.map((x) =>
          x.id === id
            ? { ...x, admin_notes: next || null, reviewed_at: new Date().toISOString() }
            : x
        )
      )
      setNotesDraft((d) => {
        const copy = { ...d }
        delete copy[id]
        return copy
      })
    } finally {
      setBusyId(null)
    }
  }

  return (
    <section
      className="rounded-xl bg-[#1A2E4A] border border-white/5"
      style={{ padding: 16 }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 10,
          gap: 10,
        }}
      >
        <p
          style={{
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            color: '#7A90AA',
          }}
        >
          Uploaded documents
        </p>
        <button
          type="button"
          onClick={() => setAddOpen((o) => !o)}
          style={{
            padding: '6px 10px',
            background: 'rgba(240,165,0,0.12)',
            color: '#F0A500',
            border: '1px solid rgba(240,165,0,0.35)',
            borderRadius: 8,
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: '0.04em',
            cursor: 'pointer',
          }}
        >
          {addOpen ? 'Cancel' : `+ Add document on behalf of ${role}`}
        </button>
      </div>

      {/* Inline admin upload form */}
      {addOpen && (
        <form
          onSubmit={handleUpload}
          style={{
            padding: 12,
            marginBottom: 12,
            borderRadius: 10,
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(170,189,224,0.15)',
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
          }}
        >
          <select
            value={docType}
            onChange={(e) => setDocType(e.target.value)}
            style={{
              width: '100%',
              padding: '8px 10px',
              borderRadius: 8,
              background: 'rgba(255,255,255,0.06)',
              color: '#fff',
              border: '1px solid rgba(170,189,224,0.2)',
              fontSize: 13,
            }}
          >
            <option value="">Select document type</option>
            {types.map((t) => (
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
              style={{
                width: '100%',
                padding: '8px 10px',
                borderRadius: 8,
                background: 'rgba(255,255,255,0.06)',
                color: '#fff',
                border: '1px solid rgba(170,189,224,0.2)',
                fontSize: 13,
              }}
            />
          )}

          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Brief description (optional)"
            maxLength={120}
            style={{
              width: '100%',
              padding: '8px 10px',
              borderRadius: 8,
              background: 'rgba(255,255,255,0.06)',
              color: '#fff',
              border: '1px solid rgba(170,189,224,0.2)',
              fontSize: 13,
            }}
          />

          <label
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              padding: '12px 10px',
              borderRadius: 8,
              border: '1px dashed rgba(170,189,224,0.3)',
              background: 'rgba(255,255,255,0.02)',
              cursor: 'pointer',
              textAlign: 'center',
            }}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,.heic,.heif,.doc,.docx,application/pdf,image/*"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              style={{ display: 'none' }}
            />
            <span style={{ fontSize: 13, color: '#fff', fontWeight: 600 }}>
              {file ? file.name : 'Tap to choose file'}
            </span>
            <span style={{ fontSize: 11, color: '#7A90AA', marginTop: 2 }}>
              {file
                ? fmtSize(file.size)
                : 'PDF / JPG / PNG / HEIC / DOC — up to 10MB'}
            </span>
          </label>

          {errorMsg && (
            <p style={{ fontSize: 12, color: '#F87171' }}>{errorMsg}</p>
          )}

          <button
            type="submit"
            disabled={uploading || !docType || !file}
            style={{
              padding: '10px 14px',
              background:
                uploading || !docType || !file
                  ? 'rgba(170,189,224,0.25)'
                  : '#F0A500',
              color: uploading || !docType || !file ? '#fff' : '#0F1B2E',
              border: 'none',
              borderRadius: 8,
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
              cursor:
                uploading || !docType || !file ? 'not-allowed' : 'pointer',
            }}
          >
            {uploading ? 'Uploading…' : 'Upload document'}
          </button>
        </form>
      )}

      {/* Document list */}
      {loading ? (
        <p style={{ fontSize: 12, color: '#7A90AA', fontStyle: 'italic' }}>
          Loading…
        </p>
      ) : docs.length === 0 ? (
        <p style={{ fontSize: 13, color: '#7A90AA', fontStyle: 'italic' }}>
          No documents uploaded.
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {docs.map((d) => {
            const typeLabel = types.find((t) => t.value === d.document_type)?.label ?? d.document_type
            const invoiceNum = d.invoices?.invoice_number ?? null
            const isBusy = busyId === d.id
            const draftNotes = notesDraft[d.id]
            const displayedNotes = draftNotes ?? d.admin_notes ?? ''
            const dirty = draftNotes !== undefined && draftNotes !== (d.admin_notes ?? '')
            return (
              <div
                key={d.id}
                style={{
                  padding: 12,
                  borderRadius: 10,
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.05)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 6,
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
                  <p style={{ fontSize: 14, fontWeight: 600, color: '#fff' }}>
                    {typeLabel}
                    {d.tax_year ? (
                      <span style={{ color: '#7A90AA', fontWeight: 400 }}>
                        {' '}
                        · {d.tax_year}
                      </span>
                    ) : null}
                  </p>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    {d.status === 'drive_synced' && d.drive_file_url ? (
                      <a
                        href={d.drive_file_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          padding: '3px 8px',
                          borderRadius: 999,
                          background: 'rgba(34,197,94,0.15)',
                          color: '#4ADE80',
                          border: '1px solid rgba(34,197,94,0.3)',
                          fontSize: 10,
                          fontWeight: 700,
                          letterSpacing: '0.06em',
                          textTransform: 'uppercase',
                          textDecoration: 'none',
                        }}
                      >
                        In Drive ↗
                      </a>
                    ) : d.status === 'error' ? (
                      <span
                        style={{
                          padding: '3px 8px',
                          borderRadius: 999,
                          background: 'rgba(239,68,68,0.15)',
                          color: '#F87171',
                          border: '1px solid rgba(239,68,68,0.35)',
                          fontSize: 10,
                          fontWeight: 700,
                          letterSpacing: '0.06em',
                          textTransform: 'uppercase',
                        }}
                      >
                        Error
                      </span>
                    ) : (
                      <span
                        style={{
                          padding: '3px 8px',
                          borderRadius: 999,
                          background: 'rgba(170,189,224,0.15)',
                          color: '#AABDE0',
                          border: '1px solid rgba(170,189,224,0.25)',
                          fontSize: 10,
                          fontWeight: 700,
                          letterSpacing: '0.06em',
                          textTransform: 'uppercase',
                        }}
                      >
                        Saved
                      </span>
                    )}
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => handleDelete(d.id)}
                      aria-label="Delete"
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: '#7A90AA',
                        fontSize: 16,
                        cursor: isBusy ? 'wait' : 'pointer',
                        padding: '0 4px',
                        opacity: isBusy ? 0.5 : 1,
                      }}
                    >
                      ×
                    </button>
                  </div>
                </div>
                <p style={{ fontSize: 11, color: '#AABDE0' }}>
                  {d.file_name} · {fmtSize(d.file_size_bytes)}
                </p>
                <div
                  style={{
                    fontSize: 10,
                    color: '#7A90AA',
                    display: 'flex',
                    gap: 10,
                    flexWrap: 'wrap',
                  }}
                >
                  <span>Uploaded {fmtDate(d.created_at)}</span>
                  {invoiceNum && (
                    <span
                      style={{
                        color: '#F0A500',
                        fontWeight: 600,
                      }}
                    >
                      Linked to {invoiceNum}
                    </span>
                  )}
                  {d.upload_error && (
                    <span style={{ color: '#F87171' }}>
                      {d.upload_error}
                    </span>
                  )}
                </div>

                {/* Admin notes inline — dirty-aware save button */}
                <div style={{ marginTop: 4 }}>
                  <textarea
                    value={displayedNotes}
                    onChange={(e) =>
                      setNotesDraft((prev) => ({
                        ...prev,
                        [d.id]: e.target.value,
                      }))
                    }
                    placeholder="Admin notes (private)"
                    rows={1}
                    style={{
                      width: '100%',
                      padding: '6px 8px',
                      borderRadius: 6,
                      background: 'rgba(255,255,255,0.04)',
                      color: '#fff',
                      border: '1px solid rgba(170,189,224,0.2)',
                      fontSize: 12,
                      resize: 'vertical',
                      lineHeight: 1.4,
                    }}
                  />
                  {dirty && (
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'flex-end',
                        gap: 6,
                        marginTop: 4,
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => handleSaveNotes(d.id)}
                        disabled={isBusy}
                        style={{
                          padding: '4px 10px',
                          fontSize: 10,
                          fontWeight: 700,
                          letterSpacing: '0.06em',
                          textTransform: 'uppercase',
                          background: '#F0A500',
                          color: '#0F1B2E',
                          border: 'none',
                          borderRadius: 6,
                          cursor: isBusy ? 'wait' : 'pointer',
                        }}
                      >
                        {isBusy ? '…' : 'Save note'}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}

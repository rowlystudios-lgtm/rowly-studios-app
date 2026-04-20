'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase-browser'
import {
  linkDocumentToInvoice,
  unlinkDocument,
} from '@/app/actions/documents'

type DocRow = {
  id: string
  owner_id: string
  owner_role: string
  document_type: string
  tax_year: number | null
  file_name: string
  status: string
  drive_file_url: string | null
  linked_invoice_id: string | null
  linked_job_id: string | null
  created_at: string | null
  profiles?: {
    full_name: string | null
    role: string | null
  } | null
}

type Props = {
  invoiceId: string
  jobId: string | null
  clientId: string | null
  /** Talent ids pulled from the invoice's line items. */
  talentIds: string[]
  /** Whether the invoice is still a draft — governs link/unlink affordances. */
  canEdit: boolean
}

function typeLabel(value: string): string {
  // Not worth importing the full registry — just pretty-print the slug.
  return value
    .replace(/_/g, ' ')
    .replace(/-/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
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

export function InvoiceDocuments({
  invoiceId,
  jobId,
  clientId,
  talentIds,
  canEdit,
}: Props) {
  const supabase = createClient()
  const [linked, setLinked] = useState<DocRow[]>([])
  const [available, setAvailable] = useState<DocRow[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)

  async function load() {
    setLoading(true)

    // "Linked" set — anything bound to this invoice, or to the job it
    // belongs to (so admin can see the full context of the shoot).
    let linkedQuery = supabase
      .from('tax_documents')
      .select(
        `id, owner_id, owner_role, document_type, tax_year, file_name,
         status, drive_file_url, linked_invoice_id, linked_job_id,
         created_at,
         profiles!tax_documents_owner_id_fkey (full_name, role)`
      )
      .eq('linked_invoice_id', invoiceId)
    const linkedRes = await linkedQuery
    const linkedRows = (linkedRes.data ?? []) as unknown as DocRow[]

    if (jobId) {
      const jobRes = await supabase
        .from('tax_documents')
        .select(
          `id, owner_id, owner_role, document_type, tax_year, file_name,
           status, drive_file_url, linked_invoice_id, linked_job_id,
           created_at,
           profiles!tax_documents_owner_id_fkey (full_name, role)`
        )
        .eq('linked_job_id', jobId)
        .neq('linked_invoice_id', invoiceId)
      const jobRows = (jobRes.data ?? []) as unknown as DocRow[]
      for (const r of jobRows) {
        if (!linkedRows.find((x) => x.id === r.id)) linkedRows.push(r)
      }
    }

    // "Available to link" — anything owned by this client or the talent
    // on the invoice that isn't already linked to THIS invoice.
    const owners: string[] = []
    if (clientId) owners.push(clientId)
    for (const t of talentIds) if (!owners.includes(t)) owners.push(t)

    let availableRows: DocRow[] = []
    if (owners.length > 0) {
      const availRes = await supabase
        .from('tax_documents')
        .select(
          `id, owner_id, owner_role, document_type, tax_year, file_name,
           status, drive_file_url, linked_invoice_id, linked_job_id,
           created_at,
           profiles!tax_documents_owner_id_fkey (full_name, role)`
        )
        .in('owner_id', owners)
        .order('created_at', { ascending: false })
      availableRows = ((availRes.data ?? []) as unknown as DocRow[]).filter(
        (r) => r.linked_invoice_id !== invoiceId
      )
    }

    setLinked(linkedRows)
    setAvailable(availableRows)
    setLoading(false)
  }
  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invoiceId, jobId, clientId, talentIds.join(',')])

  // Derived view: does the client have a W-9 on file? Used for the
  // verification checklist hint on the invoice page.
  const clientHasW9 =
    clientId != null &&
    [...linked, ...available].some(
      (d) => d.owner_id === clientId && d.document_type === 'w9'
    )

  async function doLink(docId: string) {
    setBusyId(docId)
    const fd = new FormData()
    fd.set('documentId', docId)
    fd.set('invoiceId', invoiceId)
    try {
      await linkDocumentToInvoice(fd)
      await load()
    } finally {
      setBusyId(null)
    }
  }

  async function doUnlink(docId: string) {
    setBusyId(docId)
    const fd = new FormData()
    fd.set('documentId', docId)
    try {
      await unlinkDocument(fd)
      await load()
    } finally {
      setBusyId(null)
    }
  }

  return (
    <section
      className="mt-4 rounded-xl bg-[#1A2E4A] border border-white/5"
      style={{ padding: 16 }}
    >
      <div
        className="flex items-center justify-between gap-3"
        style={{ marginBottom: 10 }}
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
          Supporting documents
        </p>
        {canEdit && (
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            style={{
              padding: '6px 10px',
              background: 'rgba(170,189,224,0.1)',
              color: '#AABDE0',
              border: '1px solid rgba(170,189,224,0.25)',
              borderRadius: 8,
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: '0.04em',
              cursor: 'pointer',
            }}
          >
            + Link existing document
          </button>
        )}
      </div>

      {/* Compliance hint — W-9 on file for this client */}
      {clientId && (
        <div
          style={{
            marginBottom: 10,
            padding: '6px 10px',
            borderRadius: 8,
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: '0.02em',
            background: clientHasW9
              ? 'rgba(34,197,94,0.12)'
              : 'rgba(240,165,0,0.12)',
            color: clientHasW9 ? '#4ADE80' : '#F0A500',
            border: clientHasW9
              ? '1px solid rgba(34,197,94,0.25)'
              : '1px solid rgba(240,165,0,0.3)',
            display: 'inline-block',
          }}
        >
          {clientHasW9 ? '✓ W-9 on file' : '⚠ No W-9 on file for this client'}
        </div>
      )}

      {loading ? (
        <p style={{ fontSize: 12, color: '#7A90AA', fontStyle: 'italic' }}>
          Loading documents…
        </p>
      ) : linked.length === 0 ? (
        <p style={{ fontSize: 13, color: '#7A90AA', fontStyle: 'italic' }}>
          No supporting documents linked.
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {linked.map((d) => (
            <div
              key={d.id}
              style={{
                padding: 10,
                borderRadius: 8,
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.05)',
                display: 'flex',
                alignItems: 'center',
                gap: 10,
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <p
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: '#fff',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {typeLabel(d.document_type)}
                  {d.tax_year ? (
                    <span style={{ color: '#7A90AA', fontWeight: 400 }}>
                      {' '}
                      · {d.tax_year}
                    </span>
                  ) : null}
                </p>
                <p
                  style={{
                    fontSize: 11,
                    color: '#AABDE0',
                    marginTop: 2,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {d.file_name} · {d.profiles?.full_name ?? 'Unknown'} (
                  {d.owner_role})
                </p>
                <p style={{ fontSize: 10, color: '#7A90AA', marginTop: 2 }}>
                  Uploaded {fmtDate(d.created_at)}
                  {d.linked_invoice_id === invoiceId
                    ? ' · Linked to this invoice'
                    : d.linked_job_id === jobId
                    ? ' · From this job'
                    : ''}
                </p>
              </div>
              {d.drive_file_url && (
                <a
                  href={d.drive_file_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    color: '#F0A500',
                    textDecoration: 'underline',
                    whiteSpace: 'nowrap',
                  }}
                >
                  Open ↗
                </a>
              )}
              {canEdit && d.linked_invoice_id === invoiceId && (
                <button
                  type="button"
                  onClick={() => doUnlink(d.id)}
                  disabled={busyId === d.id}
                  style={{
                    fontSize: 11,
                    padding: '4px 8px',
                    borderRadius: 6,
                    background: 'transparent',
                    color: '#F87171',
                    border: '1px solid rgba(239,68,68,0.3)',
                    cursor: busyId === d.id ? 'wait' : 'pointer',
                  }}
                >
                  Unlink
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {modalOpen && (
        <div
          onClick={() => setModalOpen(false)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.7)',
            zIndex: 80,
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'center',
            padding: '40px 16px',
            overflowY: 'auto',
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              maxWidth: 520,
              width: '100%',
              background: '#1A2E4A',
              borderRadius: 14,
              border: '1px solid rgba(170,189,224,0.15)',
              padding: 20,
              color: '#fff',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 14,
              }}
            >
              <p
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  letterSpacing: '0.14em',
                  textTransform: 'uppercase',
                  color: '#F0A500',
                }}
              >
                Link an existing document
              </p>
              <button
                type="button"
                aria-label="Close"
                onClick={() => setModalOpen(false)}
                style={{
                  background: 'transparent',
                  color: '#AABDE0',
                  border: 'none',
                  fontSize: 18,
                  cursor: 'pointer',
                }}
              >
                ×
              </button>
            </div>
            {available.length === 0 ? (
              <p
                style={{
                  fontSize: 13,
                  color: '#AABDE0',
                  fontStyle: 'italic',
                }}
              >
                No unlinked documents found for this client or talent.
              </p>
            ) : (
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                  maxHeight: '60vh',
                  overflowY: 'auto',
                }}
              >
                {available.map((d) => (
                  <div
                    key={d.id}
                    style={{
                      padding: 10,
                      borderRadius: 8,
                      background: 'rgba(255,255,255,0.04)',
                      border: '1px solid rgba(255,255,255,0.06)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p
                        style={{
                          fontSize: 13,
                          fontWeight: 600,
                          color: '#fff',
                        }}
                      >
                        {typeLabel(d.document_type)}
                        {d.tax_year ? (
                          <span
                            style={{
                              color: '#7A90AA',
                              fontWeight: 400,
                            }}
                          >
                            {' '}
                            · {d.tax_year}
                          </span>
                        ) : null}
                      </p>
                      <p
                        style={{
                          fontSize: 11,
                          color: '#AABDE0',
                          marginTop: 2,
                        }}
                      >
                        {d.profiles?.full_name ?? 'Unknown'} ({d.owner_role}) ·{' '}
                        {d.file_name}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => doLink(d.id)}
                      disabled={busyId === d.id}
                      style={{
                        padding: '6px 10px',
                        background: '#F0A500',
                        color: '#0F1B2E',
                        border: 'none',
                        borderRadius: 8,
                        fontSize: 11,
                        fontWeight: 700,
                        letterSpacing: '0.04em',
                        cursor: busyId === d.id ? 'wait' : 'pointer',
                      }}
                    >
                      {busyId === d.id ? '…' : 'Link'}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  )
}

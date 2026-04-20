'use client'

import { useEffect, useState } from 'react'

export type PreviewInvoice = {
  invoiceNumber: string
  dateLabel: string
  dueLabel: string | null
  companyName: string
  billingEmail: string | null
  jobTitle: string | null
  jobDateLabel: string | null
  jobLocation: string | null
  items: Array<{
    description: string
    quantity: number
    unitPriceCents: number
    totalCents: number
  }>
  subtotalCents: number
  taxCents: number
  totalCents: number
  notes: string | null
}

function fmtCents(c: number): string {
  return `$${(c / 100).toLocaleString('en-US', {
    maximumFractionDigits: 2,
  })}`
}

export function InvoicePreviewButton({
  invoice,
  variant = 'secondary',
}: {
  invoice: PreviewInvoice
  variant?: 'primary' | 'secondary'
}) {
  const [open, setOpen] = useState(false)

  // Lock body scroll while modal is open.
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [open])

  const btnStyle: React.CSSProperties =
    variant === 'primary'
      ? {
          padding: '9px 14px',
          fontSize: 12,
          fontWeight: 700,
          letterSpacing: '0.04em',
          textTransform: 'uppercase',
          background: '#1E3A6B',
          color: '#fff',
          border: 'none',
          borderRadius: 10,
          cursor: 'pointer',
        }
      : {
          padding: '9px 14px',
          fontSize: 12,
          fontWeight: 600,
          letterSpacing: '0.04em',
          background: 'rgba(255,255,255,0.06)',
          color: '#AABDE0',
          border: '1px solid rgba(170,189,224,0.2)',
          borderRadius: 10,
          cursor: 'pointer',
        }

  return (
    <>
      <button type="button" style={btnStyle} onClick={() => setOpen(true)}>
        Preview invoice
      </button>

      {open && (
        <>
          <style>{`
            @media print {
              body > *:not(#rs-invoice-print-root) { display: none !important; }
              #rs-invoice-print-root, #rs-invoice-print-root * { visibility: visible; }
              #rs-invoice-print-root {
                position: absolute !important;
                inset: 0 !important;
                background: white !important;
              }
              .rs-invoice-chrome { display: none !important; }
              .rs-invoice-doc {
                box-shadow: none !important;
                border: none !important;
                margin: 0 !important;
                max-width: none !important;
                width: 100% !important;
                padding: 20px !important;
              }
            }
          `}</style>
          <div
            id="rs-invoice-print-root"
            onClick={() => setOpen(false)}
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(0,0,0,0.8)',
              zIndex: 100,
              overflowY: 'auto',
              padding: '40px 16px',
            }}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="rs-invoice-doc"
              style={{
                maxWidth: 640,
                margin: '0 auto',
                background: '#fff',
                borderRadius: 16,
                padding: 40,
                color: '#0F1B2E',
                boxShadow: '0 20px 60px rgba(0,0,0,0.4)',
                position: 'relative',
                fontFamily:
                  '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
              }}
            >
              {/* Chrome: close + print */}
              <div
                className="rs-invoice-chrome"
                style={{
                  position: 'absolute',
                  top: 12,
                  right: 12,
                  display: 'flex',
                  gap: 8,
                }}
              >
                <button
                  type="button"
                  onClick={() => window.print()}
                  style={{
                    padding: '6px 12px',
                    fontSize: 12,
                    fontWeight: 600,
                    background: '#1E3A6B',
                    color: '#fff',
                    border: 'none',
                    borderRadius: 8,
                    cursor: 'pointer',
                  }}
                >
                  Print / Save as PDF
                </button>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label="Close"
                  style={{
                    width: 28,
                    height: 28,
                    background: '#F3F4F6',
                    color: '#374151',
                    border: 'none',
                    borderRadius: 999,
                    fontSize: 18,
                    lineHeight: 1,
                    cursor: 'pointer',
                  }}
                >
                  ×
                </button>
              </div>

              {/* Invoice document */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  gap: 16,
                  paddingBottom: 20,
                  borderBottom: '2px solid #0F1B2E',
                }}
              >
                <div>
                  <p
                    style={{
                      fontSize: 24,
                      fontWeight: 700,
                      letterSpacing: '0.02em',
                      color: '#0F1B2E',
                      lineHeight: 1,
                    }}
                  >
                    ROWLY STUDIOS
                  </p>
                  <p style={{ fontSize: 12, color: '#6B7280', marginTop: 4 }}>
                    rowlystudios.com · Los Angeles, CA
                  </p>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <p
                    style={{
                      fontSize: 20,
                      fontWeight: 700,
                      color: '#0F1B2E',
                      fontFamily:
                        'ui-monospace, SFMono-Regular, Menlo, monospace',
                      letterSpacing: '0.02em',
                    }}
                  >
                    {invoice.invoiceNumber}
                  </p>
                  <p style={{ fontSize: 12, color: '#6B7280', marginTop: 4 }}>
                    Invoice date: {invoice.dateLabel}
                  </p>
                  {invoice.dueLabel && (
                    <p style={{ fontSize: 12, color: '#6B7280', marginTop: 2 }}>
                      Due: {invoice.dueLabel}
                    </p>
                  )}
                </div>
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: 24,
                  marginTop: 24,
                }}
              >
                <div>
                  <p
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      letterSpacing: '0.12em',
                      color: '#6B7280',
                      marginBottom: 6,
                    }}
                  >
                    Billed to
                  </p>
                  <p
                    style={{
                      fontSize: 15,
                      fontWeight: 600,
                      color: '#0F1B2E',
                    }}
                  >
                    {invoice.companyName}
                  </p>
                  {invoice.billingEmail && (
                    <p style={{ fontSize: 13, color: '#374151', marginTop: 2 }}>
                      {invoice.billingEmail}
                    </p>
                  )}
                </div>
                {invoice.jobTitle && (
                  <div>
                    <p
                      style={{
                        fontSize: 10,
                        fontWeight: 700,
                        textTransform: 'uppercase',
                        letterSpacing: '0.12em',
                        color: '#6B7280',
                        marginBottom: 6,
                      }}
                    >
                      Job
                    </p>
                    <p
                      style={{
                        fontSize: 15,
                        fontWeight: 600,
                        color: '#0F1B2E',
                      }}
                    >
                      {invoice.jobTitle}
                    </p>
                    {invoice.jobDateLabel && (
                      <p
                        style={{ fontSize: 13, color: '#374151', marginTop: 2 }}
                      >
                        {invoice.jobDateLabel}
                      </p>
                    )}
                    {invoice.jobLocation && (
                      <p
                        style={{ fontSize: 13, color: '#6B7280', marginTop: 2 }}
                      >
                        {invoice.jobLocation}
                      </p>
                    )}
                  </div>
                )}
              </div>

              <table
                style={{
                  width: '100%',
                  marginTop: 28,
                  borderCollapse: 'collapse',
                  fontSize: 13,
                }}
              >
                <thead>
                  <tr
                    style={{
                      textAlign: 'left',
                      borderBottom: '1px solid #E5E7EB',
                    }}
                  >
                    <th style={{ padding: '10px 8px', color: '#6B7280', fontWeight: 700, fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase' }}>
                      Description
                    </th>
                    <th style={{ padding: '10px 8px', color: '#6B7280', fontWeight: 700, fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', textAlign: 'center', width: 60 }}>
                      Days
                    </th>
                    <th style={{ padding: '10px 8px', color: '#6B7280', fontWeight: 700, fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', textAlign: 'right', width: 100 }}>
                      Rate
                    </th>
                    <th style={{ padding: '10px 8px', color: '#6B7280', fontWeight: 700, fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', textAlign: 'right', width: 100 }}>
                      Total
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {invoice.items.map((li, idx) => (
                    <tr
                      key={idx}
                      style={{ borderBottom: '1px solid #F3F4F6' }}
                    >
                      <td style={{ padding: '12px 8px', color: '#0F1B2E' }}>
                        {li.description}
                      </td>
                      <td
                        style={{
                          padding: '12px 8px',
                          color: '#374151',
                          textAlign: 'center',
                        }}
                      >
                        {Number.isInteger(li.quantity)
                          ? li.quantity
                          : li.quantity.toFixed(2)}
                      </td>
                      <td
                        style={{
                          padding: '12px 8px',
                          color: '#374151',
                          textAlign: 'right',
                        }}
                      >
                        {fmtCents(li.unitPriceCents)}
                      </td>
                      <td
                        style={{
                          padding: '12px 8px',
                          color: '#0F1B2E',
                          fontWeight: 600,
                          textAlign: 'right',
                        }}
                      >
                        {fmtCents(li.totalCents)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div
                style={{
                  marginLeft: 'auto',
                  marginTop: 12,
                  maxWidth: 280,
                  fontSize: 13,
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    padding: '6px 8px',
                    color: '#374151',
                  }}
                >
                  <span>Subtotal</span>
                  <span>{fmtCents(invoice.subtotalCents)}</span>
                </div>
                {invoice.taxCents > 0 && (
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      padding: '6px 8px',
                      color: '#374151',
                    }}
                  >
                    <span>Tax</span>
                    <span>{fmtCents(invoice.taxCents)}</span>
                  </div>
                )}
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    padding: '12px 8px',
                    marginTop: 4,
                    borderTop: '2px solid #0F1B2E',
                    fontWeight: 700,
                    fontSize: 16,
                    color: '#0F1B2E',
                  }}
                >
                  <span>Total</span>
                  <span>{fmtCents(invoice.totalCents)}</span>
                </div>
              </div>

              {invoice.notes && (
                <div
                  style={{
                    marginTop: 28,
                    padding: '12px 14px',
                    background: '#F9FAFB',
                    borderRadius: 10,
                    fontSize: 13,
                    color: '#374151',
                    lineHeight: 1.55,
                    whiteSpace: 'pre-wrap',
                  }}
                >
                  {invoice.notes}
                </div>
              )}

              <div
                style={{
                  marginTop: 32,
                  paddingTop: 20,
                  borderTop: '1px solid #E5E7EB',
                  fontSize: 12,
                  color: '#6B7280',
                  lineHeight: 1.7,
                }}
              >
                <p style={{ fontWeight: 600, color: '#374151' }}>
                  Payment terms: Net 14 days
                </p>
                <p>Thank you for working with us.</p>
                <p style={{ marginTop: 8 }}>
                  Rowly Studios — rowlystudios@gmail.com
                </p>
              </div>
            </div>
          </div>
        </>
      )}
    </>
  )
}

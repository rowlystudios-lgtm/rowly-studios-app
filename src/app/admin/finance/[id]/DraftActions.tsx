'use client'

import { useState } from 'react'
import { addLineItem, removeLineItem, deleteInvoice, voidInvoice } from '../actions'

export function AddLineItemForm({ invoiceId }: { invoiceId: string }) {
  const [busy, setBusy] = useState(false)
  return (
    <form
      action={async (fd: FormData) => {
        setBusy(true)
        fd.set('invoiceId', invoiceId)
        await addLineItem(fd)
        setBusy(false)
        // Reset form inputs via key bump on the description input.
        const form = document.getElementById(
          `add-line-${invoiceId}`
        ) as HTMLFormElement | null
        form?.reset()
      }}
      id={`add-line-${invoiceId}`}
      className="flex gap-2 flex-wrap mt-3 pt-3"
      style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}
    >
      <input
        type="text"
        name="description"
        required
        placeholder="Description"
        style={{ ...inputStyle, flex: '2 1 220px', minWidth: 180 }}
      />
      <input
        type="number"
        name="quantity"
        min={0.5}
        step={0.5}
        defaultValue={1}
        placeholder="Qty"
        style={{ ...inputStyle, width: 70, flex: '0 0 70px' }}
      />
      <input
        type="number"
        name="rate"
        min={0}
        step={25}
        required
        placeholder="Rate ($)"
        style={{ ...inputStyle, width: 110, flex: '0 0 110px' }}
      />
      <button
        type="submit"
        disabled={busy}
        style={{
          padding: '9px 14px',
          borderRadius: 8,
          background: '#F0A500',
          color: '#0F1B2E',
          border: 'none',
          fontSize: 12,
          fontWeight: 700,
          letterSpacing: '0.04em',
          textTransform: 'uppercase',
          cursor: busy ? 'wait' : 'pointer',
          opacity: busy ? 0.7 : 1,
          whiteSpace: 'nowrap',
        }}
      >
        {busy ? '…' : '+ Add item'}
      </button>
    </form>
  )
}

export function RemoveLineItemButton({
  lineItemId,
  invoiceId,
}: {
  lineItemId: string
  invoiceId: string
}) {
  const [busy, setBusy] = useState(false)
  return (
    <form
      action={async (fd: FormData) => {
        setBusy(true)
        fd.set('lineId', lineItemId)
        fd.set('invoiceId', invoiceId)
        await removeLineItem(fd)
        setBusy(false)
      }}
    >
      <button
        type="submit"
        aria-label="Remove line item"
        disabled={busy}
        style={{
          background: 'transparent',
          border: '1px solid rgba(239,68,68,0.35)',
          color: '#F87171',
          fontSize: 13,
          fontWeight: 600,
          width: 28,
          height: 28,
          borderRadius: 6,
          cursor: busy ? 'wait' : 'pointer',
          lineHeight: 1,
        }}
      >
        {busy ? '…' : '×'}
      </button>
    </form>
  )
}

export function DeleteDraftButton({ invoiceId }: { invoiceId: string }) {
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  return (
    <form
      action={async (fd: FormData) => {
        if (!confirming) {
          setConfirming(true)
          setTimeout(() => setConfirming(false), 3000)
          return
        }
        setBusy(true)
        fd.set('invoiceId', invoiceId)
        await deleteInvoice(fd)
      }}
    >
      <button
        type="submit"
        disabled={busy}
        style={{
          padding: '9px 14px',
          fontSize: 12,
          fontWeight: 600,
          letterSpacing: '0.04em',
          background: confirming
            ? 'rgba(239,68,68,0.3)'
            : 'rgba(239,68,68,0.15)',
          color: '#F87171',
          border: '1px solid rgba(239,68,68,0.35)',
          borderRadius: 10,
          cursor: busy ? 'wait' : 'pointer',
        }}
      >
        {busy ? '…' : confirming ? 'Tap again to delete' : 'Delete'}
      </button>
    </form>
  )
}

export function VoidButton({ invoiceId }: { invoiceId: string }) {
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  return (
    <form
      action={async (fd: FormData) => {
        if (!confirming) {
          setConfirming(true)
          setTimeout(() => setConfirming(false), 3000)
          return
        }
        setBusy(true)
        fd.set('invoiceId', invoiceId)
        await voidInvoice(fd)
        setBusy(false)
      }}
    >
      <button
        type="submit"
        disabled={busy}
        style={{
          padding: '9px 14px',
          fontSize: 12,
          fontWeight: 600,
          letterSpacing: '0.04em',
          background: confirming
            ? 'rgba(239,68,68,0.3)'
            : 'rgba(239,68,68,0.15)',
          color: '#F87171',
          border: '1px solid rgba(239,68,68,0.35)',
          borderRadius: 10,
          cursor: busy ? 'wait' : 'pointer',
        }}
      >
        {busy ? '…' : confirming ? 'Tap again to void' : 'Void invoice'}
      </button>
    </form>
  )
}

const inputStyle: React.CSSProperties = {
  boxSizing: 'border-box',
  padding: '9px 12px',
  borderRadius: 8,
  border: '1px solid rgba(170,189,224,0.2)',
  background: 'rgba(255,255,255,0.05)',
  color: '#fff',
  fontSize: 13,
  outline: 'none',
}

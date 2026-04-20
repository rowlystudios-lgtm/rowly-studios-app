export type GmailInvoicePayload = {
  invoiceNumber: string
  todayLabel: string
  dueLabel: string | null
  companyName: string
  billingEmail: string
  jobTitle: string | null
  jobDateLabel: string | null
  items: Array<{
    description: string
    quantity: number
    unitPriceCents: number
    totalCents: number
  }>
  subtotalCents: number
  taxCents: number
  // totalCents = what talent get paid (subtotal + tax)
  totalCents: number
  rsFeeCents: number
  rsFeePercent: number
  // clientTotalCents = talent total + RS production fee — what the client pays
  clientTotalCents: number
  notes: string | null
  reminder?: boolean
}

function fmtCents(c: number): string {
  return `$${(c / 100).toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`
}

/**
 * Build the plain-text invoice body that Gmail compose will pre-fill.
 * Every line is kept short so it reads cleanly on desktop + mobile.
 */
export function buildInvoiceBody(p: GmailInvoicePayload): string {
  const lines: string[] = []
  lines.push('-----------------------------------')
  lines.push('ROWLY STUDIOS')
  lines.push('rowlystudios.com · Los Angeles, CA')
  lines.push('-----------------------------------')
  lines.push('')
  if (p.reminder) {
    lines.push(
      "Hi — friendly reminder that this invoice is now past due. Could you confirm next steps when you get a moment? Details below."
    )
    lines.push('')
  }
  lines.push(`Invoice ${p.invoiceNumber}`)
  lines.push(`Date: ${p.todayLabel}`)
  if (p.dueLabel) lines.push(`Due: ${p.dueLabel}`)
  lines.push('')
  lines.push('BILLED TO:')
  lines.push(p.companyName)
  lines.push(p.billingEmail)
  lines.push('')
  if (p.jobTitle) {
    lines.push(`JOB: ${p.jobTitle}`)
    if (p.jobDateLabel) lines.push(p.jobDateLabel)
    lines.push('')
  }
  lines.push('-----------------------------------')
  lines.push('SERVICES')
  lines.push('-----------------------------------')
  for (const it of p.items) {
    lines.push(it.description)
    const qtyLabel = `${Number.isInteger(it.quantity) ? it.quantity : it.quantity.toFixed(2)} day${
      it.quantity === 1 ? '' : 's'
    }`
    lines.push(`${qtyLabel} × ${fmtCents(it.unitPriceCents)}/day = ${fmtCents(it.totalCents)}`)
    lines.push('')
  }
  if (p.items.length > 1 || p.taxCents > 0) {
    lines.push(`Subtotal: ${fmtCents(p.subtotalCents)}`)
    if (p.taxCents > 0) lines.push(`Tax: ${fmtCents(p.taxCents)}`)
  }
  lines.push(`Talent services total: ${fmtCents(p.totalCents)}`)
  lines.push(`Production fee (${p.rsFeePercent}%): ${fmtCents(p.rsFeeCents)}`)
  lines.push('')
  lines.push(`TOTAL DUE: ${fmtCents(p.clientTotalCents)}`)
  lines.push('-----------------------------------')
  lines.push('')
  lines.push(
    `Amount due includes a ${p.rsFeePercent}% Rowly Studios production fee.`
  )
  lines.push('')
  if (p.notes) {
    lines.push(p.notes)
    lines.push('')
  }
  lines.push('Payment terms: Net 14 days')
  lines.push(`Please reference invoice ${p.invoiceNumber} with payment.`)
  lines.push('')
  lines.push('Bank transfer details or payment link to follow separately.')
  lines.push('')
  lines.push('Thank you for working with us.')
  lines.push('')
  lines.push('Rowly Studios')
  lines.push('rowlystudios@gmail.com')
  lines.push('-----------------------------------')
  return lines.join('\n')
}

export function buildGmailUrl(
  to: string,
  subject: string,
  body: string
): string {
  const params = new URLSearchParams({
    view: 'cm',
    fur: 'cf',
    to,
    su: subject,
    body,
  })
  return `https://mail.google.com/mail/?${params.toString()}`
}

export function buildInvoiceSubject(
  invoiceNumber: string,
  companyName: string,
  jobTitle: string | null,
  reminder: boolean = false
): string {
  const base = `Invoice ${invoiceNumber} — ${companyName}${
    jobTitle ? ` — ${jobTitle}` : ''
  }`
  return reminder ? `Reminder: ${base}` : base
}

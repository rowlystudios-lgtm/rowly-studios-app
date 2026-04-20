export type InvoicePdfInvoice = {
  invoice_number: string | null
  created_at: string | null
  due_date: string | null
  total_cents: number | null
  tax_cents: number | null
  notes: string | null
}

export type InvoicePdfLine = {
  description: string | null
  quantity: number | null
  unit_price_cents: number | null
  total_cents: number | null
}

export type InvoicePdfClient = {
  company_name?: string | null
  full_name?: string | null
  billing_email?: string | null
  email?: string | null
}

export type InvoicePdfJob = {
  title?: string | null
  start_date?: string | null
  end_date?: string | null
} | null

function fmtCents(c: number | null | undefined): string {
  if (!c && c !== 0) return '$0'
  return (c / 100).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  })
}

function longDate(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
}

function escapeHtml(v: string | null | undefined): string {
  if (!v) return ''
  return v
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** Render a print-ready invoice document as an HTML string. */
export function generateInvoiceHTML(
  invoice: InvoicePdfInvoice,
  lineItems: InvoicePdfLine[],
  client: InvoicePdfClient,
  job: InvoicePdfJob
): string {
  const fmt = fmtCents
  const total = invoice.total_cents ?? 0
  const tax = invoice.tax_cents ?? 0
  const subtotal = total - tax

  const lineRows = lineItems
    .map(
      (li) => `
      <tr>
        <td style="padding:10px 0;border-bottom:1px solid #eee">${escapeHtml(
          li.description ?? 'Line item'
        )}</td>
        <td style="padding:10px 0;border-bottom:1px solid #eee;text-align:center">${
          li.quantity != null ? li.quantity : 1
        }</td>
        <td style="padding:10px 0;border-bottom:1px solid #eee;text-align:right">${fmt(
          li.unit_price_cents
        )}</td>
        <td style="padding:10px 0;border-bottom:1px solid #eee;text-align:right;font-weight:600">${fmt(
          li.total_cents
        )}</td>
      </tr>`
    )
    .join('')

  const dueDate = invoice.due_date ? longDate(invoice.due_date) : 'Net 14 days'
  const issued = invoice.created_at ? longDate(invoice.created_at) : ''
  const clientName = client.company_name ?? client.full_name ?? 'Client'
  const clientEmail = client.billing_email ?? client.email ?? ''
  const jobTitle = job?.title ?? ''
  const jobStart = job?.start_date ? longDate(job.start_date) : ''
  const taxBlock =
    tax > 0
      ? `<tr><td colspan="3" style="padding:10px 0;text-align:right;color:#888">Subtotal</td>
            <td style="padding:10px 0;text-align:right">${fmt(subtotal)}</td></tr>
         <tr><td colspan="3" style="padding:4px 0;text-align:right;color:#888">Tax</td>
            <td style="padding:4px 0;text-align:right">${fmt(tax)}</td></tr>`
      : ''
  const notesBlock = invoice.notes
    ? `<p style="margin-top:24px;font-size:13px;color:#555">${escapeHtml(
        invoice.notes
      )}</p>`
    : ''

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
         color: #1a1a1a; padding: 60px; max-width: 800px; margin: 0 auto; }
  .header { display: flex; justify-content: space-between; margin-bottom: 40px; }
  .company { font-size: 22px; font-weight: 700; color: #1E3A6B; letter-spacing: 0.02em; }
  .tagline { font-size: 12px; color: #888; margin-top: 4px; }
  .invoice-meta { text-align: right; }
  .invoice-num { font-size: 24px; font-weight: 700; color: #1E3A6B;
                 font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
  .divider { border: none; border-top: 2px solid #1E3A6B; margin: 24px 0; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 32px; margin-bottom: 32px; }
  .label { font-size: 10px; text-transform: uppercase; letter-spacing: 1px;
           color: #888; margin-bottom: 6px; }
  .value { font-size: 14px; color: #1a1a1a; }
  table { width: 100%; border-collapse: collapse; }
  thead th { font-size: 10px; text-transform: uppercase; letter-spacing: 1px;
             color: #888; text-align: left; padding-bottom: 10px;
             border-bottom: 2px solid #1E3A6B; }
  thead th:not(:first-child) { text-align: right; }
  .total-row td { padding: 14px 0 0; font-size: 18px; font-weight: 700;
                  color: #1E3A6B; border-top: 2px solid #1E3A6B; }
  .footer { margin-top: 48px; padding-top: 24px; border-top: 1px solid #eee;
            font-size: 12px; color: #888; }
</style>
</head>
<body>
  <div class="header">
    <div>
      <div class="company">ROWLY STUDIOS</div>
      <div class="tagline">rowlystudios.com · Los Angeles, CA</div>
    </div>
    <div class="invoice-meta">
      <div class="invoice-num">${escapeHtml(invoice.invoice_number ?? 'DRAFT')}</div>
      <div style="font-size:13px;color:#888;margin-top:4px">Issued: ${issued}</div>
      <div style="font-size:13px;color:#888">Due: ${dueDate}</div>
    </div>
  </div>

  <hr class="divider">

  <div class="grid">
    <div>
      <div class="label">Billed to</div>
      <div class="value" style="font-weight:600">${escapeHtml(clientName)}</div>
      <div class="value" style="color:#888">${escapeHtml(clientEmail)}</div>
    </div>
    <div>
      <div class="label">Job</div>
      <div class="value" style="font-weight:600">${escapeHtml(jobTitle || 'N/A')}</div>
      <div class="value" style="color:#888">${escapeHtml(jobStart)}</div>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th>Description</th>
        <th style="text-align:center">Days</th>
        <th style="text-align:right">Rate</th>
        <th style="text-align:right">Total</th>
      </tr>
    </thead>
    <tbody>${lineRows}</tbody>
    <tfoot>
      ${taxBlock}
      <tr class="total-row">
        <td colspan="3" style="text-align:right">Total Due</td>
        <td style="text-align:right">${fmt(total)}</td>
      </tr>
    </tfoot>
  </table>

  ${notesBlock}

  <div class="footer">
    <p>Payment terms: Net 14 days. Please reference ${escapeHtml(
      invoice.invoice_number ?? 'this invoice'
    )} with payment.</p>
    <p style="margin-top:6px">Rowly Studios · rowlystudios@gmail.com · Los Angeles, CA</p>
  </div>
</body></html>`
}

/**
 * Render the HTML to PDF via puppeteer-core + @sparticuz/chromium so it
 * works on Vercel's serverless runtime. Returns `null` on any failure so
 * the calling action can treat PDF generation as best-effort.
 */
export async function generateInvoicePDF(html: string): Promise<Buffer | null> {
  try {
    // Dynamic imports to keep these heavy modules out of the edge bundle
    // and only loaded when this action actually runs.
    const chromium = (await import('@sparticuz/chromium')).default
    const puppeteer = await import('puppeteer-core')
    const browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: { width: 1240, height: 1754 },
      executablePath: await chromium.executablePath(),
      headless: true,
    })
    try {
      const page = await browser.newPage()
      await page.setContent(html, { waitUntil: 'networkidle0' })
      const pdf = await page.pdf({ format: 'A4', printBackground: true })
      return Buffer.from(pdf)
    } finally {
      await browser.close()
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('PDF generation failed:', err)
    return null
  }
}

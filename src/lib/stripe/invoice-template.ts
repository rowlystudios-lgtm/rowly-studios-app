/**
 * Phase D — invoice email template generator.
 *
 * Renders the Rowly Studios branded invoice email HTML from structured data.
 * Produces both `html` (for the email body) and `subject` (for the header).
 *
 * Brand language pulled from rowlystudios.com:
 *   - Deep navy gradient (#0F2540 → #1A3C6B) for top/bottom bands
 *   - Cyan accent (#5DD5DA) for eyebrow text, dividers, talent ID separators
 *   - Playfair Display serif for headline numbers (RS-INV-NNNN, $X.XX)
 *   - White card body for readability
 *   - Stripe Indigo (#635BFF) CTA — distinct from brand teal, recognized "trust" color
 *
 * Email-client-safe HTML: tables for layout, inline styles, no flexbox/grid.
 * Fonts gracefully degrade (Playfair → Georgia → serif fallback chain).
 */

export interface InvoiceCrewMember {
  fullName: string;
  /** 2-letter initials like "RD" for "Rowly Dennis" */
  initials: string;
  department: string;
  /** Talent's RS-T-XXXX code */
  talentIdCode: string;
  /** Amount displayed to client (talent rate × 1.15, rounded up). */
  displayedAmountDollars: number;
}

export interface InvoiceEmailData {
  invoiceNumber: string;
  /** ISO date string or "April 26, 2026" */
  issuedDateText: string;
  dueText: string;
  clientCompanyName: string;
  jobTitle: string;
  jobCode: string;
  /** Long-form: "Sunday, April 26, 2026" */
  jobDateText: string;
  /** "10:00 AM – 2:00 PM" */
  jobTimeText: string;
  jobDurationHours: number;
  jobLocationText: string;
  crew: InvoiceCrewMember[];
  /** "Bank transfer fee" or "Card processing fee" */
  processingFeeLabel: string;
  /** "STRIPE TEST BANK ····6789" or "Visa ····4242" */
  paymentMethodLabel: string;
  processingFeeDollars: number;
  totalDollars: number;
  /** The Stripe Checkout Session URL for the "Pay" button. */
  paymentUrl: string;
  contactEmail: string;
  /**
   * Optional logo URL (HTTPS, hosted somewhere accessible by Gmail/email clients).
   * If omitted, a text wordmark is rendered in its place.
   */
  logoUrl?: string;
}

const fmt = (dollars: number): string =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(dollars);

/** Tiny HTML-attribute encoder for user-supplied strings. */
const esc = (s: string): string =>
  String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

export function renderInvoiceEmail(data: InvoiceEmailData): { html: string; subject: string } {
  const subject = `Invoice ${data.invoiceNumber} — ${data.jobTitle} — Rowly Studios`;

  const logoCell = data.logoUrl
    ? `<img src="${esc(data.logoUrl)}" alt="Rowly Studios" width="48" height="48" style="display:block;border-radius:50%;border:0;">`
    : `<div style="width:48px;height:48px;border-radius:50%;background-color:#1a3c6b;color:#5DD5DA;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:16px;font-weight:600;text-align:center;line-height:48px;">RS</div>`;

  const crewRows = data.crew
    .map(
      (member) => `
      <tr><td style="padding:0 0 10px 0;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:#ffffff;border:1px solid #e5ecf4;border-radius:10px;">
          <tr><td style="padding:16px 18px;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
              <tr>
                <td style="vertical-align:middle;width:48px;padding-right:14px;">
                  <div style="width:40px;height:40px;border-radius:50%;background-color:#1a3c6b;color:#5DD5DA;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:14px;font-weight:600;text-align:center;line-height:40px;letter-spacing:-0.01em;">
                    ${esc(member.initials)}
                  </div>
                </td>
                <td style="vertical-align:middle;">
                  <div style="font-size:16px;font-weight:600;color:#0f2540;line-height:1.2;">${esc(member.fullName)}</div>
                  <div style="font-size:12px;color:#7a8a9d;margin-top:3px;">
                    ${esc(member.department)}
                    <span style="color:#5DD5DA;margin:0 6px;">·</span>
                    <span style="font-family:'SF Mono',Monaco,Consolas,monospace;font-size:11px;letter-spacing:0.04em;">${esc(member.talentIdCode)}</span>
                  </div>
                </td>
                <td align="right" style="vertical-align:middle;">
                  <div style="font-family:'Playfair Display',Georgia,serif;font-size:22px;font-weight:700;color:#0f2540;font-variant-numeric:tabular-nums;line-height:1;">
                    ${fmt(member.displayedAmountDollars)}
                  </div>
                  <div style="font-size:10px;color:#7a8a9d;margin-top:5px;font-style:italic;letter-spacing:0.02em;">
                    service fee included
                  </div>
                </td>
              </tr>
            </table>
          </td></tr>
        </table>
      </td></tr>`,
    )
    .join('');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>${esc(subject)}</title>
</head>
<body style="margin:0;padding:0;background-color:#0a1929;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased;">

<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:#0a1929;">
<tr><td align="center" style="padding:32px 16px;">

<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:640px;background-color:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 8px 24px rgba(0,0,0,0.18);">

  <!-- HEADER BAND -->
  <tr><td style="background:linear-gradient(135deg,#0f2540 0%,#1a3c6b 100%);padding:32px 36px 28px 36px;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
      <tr>
        <td style="vertical-align:middle;">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0">
            <tr>
              <td style="vertical-align:middle;padding-right:14px;">
                ${logoCell}
              </td>
              <td style="vertical-align:middle;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:18px;font-weight:300;letter-spacing:0.2em;color:#ffffff;">
                ROWLY&nbsp;STUDIOS
              </td>
            </tr>
          </table>
        </td>
        <td align="right" style="vertical-align:middle;font-size:11px;font-weight:600;letter-spacing:0.16em;color:#5DD5DA;text-transform:uppercase;">
          Invoice
        </td>
      </tr>
    </table>

    <div style="margin-top:24px;font-family:'Playfair Display',Georgia,'Times New Roman',serif;font-size:34px;line-height:1.1;font-weight:700;color:#ffffff;letter-spacing:-0.01em;">
      ${esc(data.invoiceNumber)}
    </div>
    <div style="margin-top:6px;font-size:13px;color:#aabde0;">
      Issued ${esc(data.issuedDateText)} &middot; ${esc(data.dueText)}
    </div>
  </td></tr>

  <!-- GREETING -->
  <tr><td style="padding:32px 36px 0 36px;">
    <p style="margin:0;font-size:16px;line-height:1.6;color:#1a1a1a;">
      Hi <strong>${esc(data.clientCompanyName)}</strong>,
    </p>
    <p style="margin:10px 0 0 0;font-size:15px;line-height:1.6;color:#3a4654;">
      Thank you for booking with Rowly Studios. Your invoice for the shoot below
      is ready for payment. Click <strong style="color:#1a3c6b;">Pay Invoice with Stripe</strong>
      whenever you&rsquo;re ready &mdash; payment is processed securely on Stripe&rsquo;s servers.
    </p>
  </td></tr>

  <!-- JOB CARD -->
  <tr><td style="padding:24px 36px 0 36px;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:#f5f9ff;border:1px solid #d6e4f5;border-radius:10px;border-left:4px solid #5DD5DA;">
      <tr><td style="padding:18px 20px;">
        <div style="font-size:11px;font-weight:600;color:#5DD5DA;text-transform:uppercase;letter-spacing:0.12em;margin-bottom:8px;">
          The Shoot
        </div>
        <div style="font-family:'Playfair Display',Georgia,serif;font-size:22px;font-weight:700;color:#0f2540;line-height:1.2;margin-bottom:2px;">
          ${esc(data.jobTitle)}
        </div>
        <div style="font-size:12px;color:#7a8a9d;font-family:'SF Mono',Monaco,Consolas,monospace;letter-spacing:0.04em;margin-bottom:14px;">
          JOB&nbsp;#${esc(data.jobCode.replace(/-/g, '\u2011'))}
        </div>
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="font-size:14px;color:#3a4654;">
          <tr>
            <td style="padding:4px 0;width:90px;color:#7a8a9d;font-weight:500;">Date</td>
            <td style="padding:4px 0;">${esc(data.jobDateText)}</td>
          </tr>
          <tr>
            <td style="padding:4px 0;color:#7a8a9d;font-weight:500;">Time</td>
            <td style="padding:4px 0;">${esc(data.jobTimeText)} <span style="color:#7a8a9d;">(${data.jobDurationHours} hour${data.jobDurationHours === 1 ? '' : 's'})</span></td>
          </tr>
          <tr>
            <td style="padding:4px 0;color:#7a8a9d;font-weight:500;vertical-align:top;">Location</td>
            <td style="padding:4px 0;">${esc(data.jobLocationText).replace(/\n/g, '<br>')}</td>
          </tr>
        </table>
      </td></tr>
    </table>
  </td></tr>

  <!-- CREW -->
  <tr><td style="padding:28px 36px 0 36px;">
    <div style="font-size:11px;font-weight:600;color:#1a3c6b;text-transform:uppercase;letter-spacing:0.16em;margin-bottom:14px;border-bottom:2px solid #5DD5DA;padding-bottom:6px;display:inline-block;">
      Crew &middot; ${data.crew.length} Person${data.crew.length === 1 ? '' : 's'}
    </div>
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
      ${crewRows}
    </table>
  </td></tr>

  <!-- PROCESSING FEE -->
  <tr><td style="padding:14px 36px 0 36px;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
      <tr>
        <td style="font-size:13px;color:#3a4654;padding:14px 18px;background-color:#f5f9ff;border-radius:8px;">
          <strong style="color:#1a3c6b;">${esc(data.processingFeeLabel)}</strong>
          <span style="color:#7a8a9d;margin-left:6px;font-size:12px;">via ${esc(data.paymentMethodLabel)}</span>
        </td>
        <td align="right" style="font-size:14px;color:#1a3c6b;font-weight:600;font-variant-numeric:tabular-nums;padding:14px 18px;background-color:#f5f9ff;border-radius:8px;">
          ${fmt(data.processingFeeDollars)}
        </td>
      </tr>
    </table>
  </td></tr>

  <!-- TOTAL + PAY BUTTON -->
  <tr><td style="padding:24px 36px 0 36px;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:linear-gradient(135deg,#0f2540 0%,#1a3c6b 100%);border-radius:12px;">
      <tr><td style="padding:22px 24px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
          <tr>
            <td style="vertical-align:middle;">
              <div style="font-size:11px;font-weight:600;color:#5DD5DA;text-transform:uppercase;letter-spacing:0.16em;margin-bottom:4px;">
                Total Due
              </div>
              <div style="font-family:'Playfair Display',Georgia,serif;font-size:36px;font-weight:700;color:#ffffff;line-height:1;font-variant-numeric:tabular-nums;letter-spacing:-0.01em;">
                ${fmt(data.totalDollars)}
              </div>
            </td>
            <td align="right" style="vertical-align:middle;">
              <a href="${esc(data.paymentUrl)}"
                 style="display:inline-block;padding:14px 22px;background-color:#635BFF;color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;border-radius:8px;letter-spacing:-0.01em;box-shadow:0 4px 14px rgba(99,91,255,0.45);">
                Pay with Stripe&nbsp;&rarr;
              </a>
            </td>
          </tr>
        </table>
      </td></tr>
    </table>
  </td></tr>

  <!-- FOOTER NOTE -->
  <tr><td style="padding:22px 36px 8px 36px;">
    <p style="margin:0;font-size:12px;line-height:1.6;color:#7a8a9d;">
      Payment is processed securely by Stripe &mdash; your bank or card details never
      touch Rowly Studios servers. Talent payments are released 5 business days after
      settlement.
    </p>
  </td></tr>

  <!-- DECORATIVE DIVIDER -->
  <tr><td style="padding:0 36px;">
    <div style="height:1px;background:linear-gradient(90deg,transparent,#5DD5DA,transparent);opacity:0.4;"></div>
  </td></tr>

  <!-- BOTTOM BAND -->
  <tr><td style="background:linear-gradient(135deg,#0f2540 0%,#1a3c6b 100%);padding:20px 36px;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
      <tr>
        <td style="font-size:11px;color:#aabde0;line-height:1.6;">
          Questions? Reply to this email or contact
          <a href="mailto:${esc(data.contactEmail)}" style="color:#5DD5DA;text-decoration:none;">${esc(data.contactEmail)}</a>
          <br>
          <span style="color:#7a8a9d;">20+ years in LA &middot; Startups &middot; Corporates &middot; Luxury</span>
        </td>
        <td align="right" style="font-family:'Playfair Display',Georgia,serif;font-size:14px;font-style:italic;color:#5DD5DA;letter-spacing:-0.01em;">
          Built for both worlds.
        </td>
      </tr>
    </table>
  </td></tr>

</table>

<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:640px;margin-top:18px;">
  <tr>
    <td align="center" style="font-size:11px;color:#5a7090;letter-spacing:0.06em;">
      Secured by <span style="font-weight:600;color:#aabde0;">Stripe</span>
    </td>
  </tr>
</table>

</td></tr>
</table>

</body>
</html>`;

  return { html, subject };
}

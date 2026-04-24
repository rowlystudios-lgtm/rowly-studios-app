/**
 * Shared branded email builder. Every transactional email renders through
 * renderBrandedEmail() so headline, header band, CTA styling, preheader,
 * and fonts stay consistent with the welcome email
 * (see src/lib/emails/welcome-email.ts).
 */

export type BrandedEmailBlock =
  | { type: 'paragraph'; body: string }
  | { type: 'heading'; body: string }
  | {
      type: 'job_card'
      title: string
      dateLabel: string
      location: string | null
      rateLabel?: string | null
    }
  | { type: 'cta'; label: string; url: string }
  | { type: 'calendar_cta'; label: string; icsUrl: string }
  | { type: 'callout'; heading: string; body: string }
  | { type: 'bullets'; heading: string; items: Array<{ title: string; body: string }> }
  | { type: 'divider' }
  | { type: 'fallback_link'; url: string }

export type BrandedEmailArgs = {
  firstName: string
  preheader: string
  eyebrow: string
  headline: string
  intro: string
  blocks: BrandedEmailBlock[]
}

const FONT_SANS =
  "'DM Sans','Helvetica Neue',Helvetica,Arial,sans-serif"
const FONT_HEAD =
  "'Playfair Display',Georgia,'Times New Roman',serif"
const FONT_LABEL =
  "'brandon-grotesque','Helvetica Neue',Helvetica,Arial,sans-serif"

export function renderBrandedEmail(args: BrandedEmailArgs): {
  html: string
  text: string
} {
  const cleanFirst = (args.firstName || '').trim()
  const greeting = cleanFirst ? `Hi ${cleanFirst},` : 'Hi,'

  const blocksHtml = args.blocks.map(renderBlock).join('')
  const blocksText = args.blocks.map(renderBlockText).filter(Boolean).join('\n\n')

  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <meta name="color-scheme" content="light only" />
    <meta name="supported-color-schemes" content="light" />
    <title>${escapeHtml(args.headline)}</title>
    <!--[if mso]>
      <style>
        * { font-family: Arial, Helvetica, sans-serif !important; }
      </style>
    <![endif]-->
  </head>
  <body style="margin:0;padding:0;background:#F4F7FC;font-family:${FONT_SANS};color:#1A2030;-webkit-font-smoothing:antialiased;">
    <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;opacity:0;color:transparent;">
      ${escapeHtml(args.preheader)}
    </div>

    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#F4F7FC;">
      <tr>
        <td align="center" style="padding:32px 16px;">
          <table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="max-width:600px;width:100%;background:#FFFFFF;border-radius:10px;overflow:hidden;border:1px solid #E8EDF5;">

            <tr>
              <td style="background:#0F1B2E;padding:36px 40px 32px 40px;" align="left">
                <div style="font-family:${FONT_LABEL};font-size:11px;letter-spacing:0.22em;text-transform:uppercase;color:#8A96AA;font-weight:700;margin-bottom:14px;">
                  ${escapeHtml(args.eyebrow)}
                </div>
                <h1 style="margin:0 0 10px 0;font-family:${FONT_HEAD};font-size:26px;line-height:1.25;color:#FFFFFF;font-weight:500;letter-spacing:-0.01em;">
                  ${escapeHtml(args.headline)}
                </h1>
                <p style="margin:0;font-family:${FONT_SANS};font-size:15px;line-height:1.55;color:#C7D1E0;">
                  ${escapeHtml(greeting)} ${escapeHtml(args.intro)}
                </p>
              </td>
            </tr>

            ${blocksHtml}

            <tr>
              <td style="padding:24px 40px 32px 40px;font-family:${FONT_SANS};font-size:12px;line-height:1.55;color:#8A96AA;border-top:1px solid #E8EDF5;">
                <strong style="color:#1A2030;">Rowly Studios</strong> — Los Angeles, California<br />
                Questions? Reply to this email — or write directly to
                <a href="mailto:rowlystudios@gmail.com" style="color:#2B4780;text-decoration:none;">rowlystudios@gmail.com</a>
              </td>
            </tr>

          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`

  const textLines = [
    greeting,
    '',
    args.intro,
    '',
    blocksText,
    '',
    'Rowly Studios — Los Angeles, California',
    'rowlystudios@gmail.com',
  ]

  return { html, text: textLines.filter((l) => l !== undefined).join('\n') }
}

function renderBlock(block: BrandedEmailBlock): string {
  switch (block.type) {
    case 'paragraph':
      return `
            <tr>
              <td style="padding:22px 40px 4px 40px;" align="left">
                <p style="margin:0;font-family:${FONT_SANS};font-size:14.5px;line-height:1.6;color:#4A5368;">
                  ${escapeHtml(block.body)}
                </p>
              </td>
            </tr>`
    case 'heading':
      return `
            <tr>
              <td style="padding:26px 40px 6px 40px;" align="left">
                <h2 style="margin:0;font-family:${FONT_HEAD};font-size:20px;line-height:1.3;color:#1A2030;font-weight:500;">
                  ${escapeHtml(block.body)}
                </h2>
              </td>
            </tr>`
    case 'job_card': {
      const locLine = block.location
        ? `<div style="margin-top:4px;">📍 ${escapeHtml(block.location)}</div>`
        : ''
      const rateLine = block.rateLabel
        ? `<div style="margin-top:4px;">💰 ${escapeHtml(block.rateLabel)}</div>`
        : ''
      return `
            <tr>
              <td style="padding:18px 40px 6px 40px;" align="left">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#F4F7FC;border-radius:8px;">
                  <tr>
                    <td style="padding:18px 22px;">
                      <div style="font-family:${FONT_HEAD};font-size:18px;line-height:1.3;color:#1A2030;font-weight:500;">
                        ${escapeHtml(block.title)}
                      </div>
                      <div style="margin-top:8px;font-family:${FONT_SANS};font-size:13px;line-height:1.6;color:#4A5368;">
                        <div>📅 ${escapeHtml(block.dateLabel)}</div>
                        ${locLine}
                        ${rateLine}
                      </div>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>`
    }
    case 'cta':
      return `
            <tr>
              <td style="padding:22px 40px 6px 40px;" align="left">
                <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                  <tr>
                    <td align="center" bgcolor="#2B4780" style="background:#2B4780;border-radius:6px;">
                      <a href="${escapeAttr(block.url)}"
                         target="_blank"
                         style="display:inline-block;padding:15px 36px;font-family:${FONT_LABEL};font-size:13px;font-weight:700;color:#FFFFFF;text-decoration:none;letter-spacing:0.08em;text-transform:uppercase;line-height:1;">
                        ${escapeHtml(block.label)}
                      </a>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>`
    case 'calendar_cta':
      return `
            <tr>
              <td style="padding:12px 40px 6px 40px;" align="left">
                <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                  <tr>
                    <td align="center" style="border:1.5px solid #2B4780;border-radius:6px;background:#FFFFFF;">
                      <a href="${escapeAttr(block.icsUrl)}"
                         target="_blank"
                         style="display:inline-block;padding:12px 28px;font-family:${FONT_LABEL};font-size:12px;font-weight:700;color:#2B4780;text-decoration:none;letter-spacing:0.08em;text-transform:uppercase;line-height:1;">
                        📅 ${escapeHtml(block.label)}
                      </a>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>`
    case 'callout':
      return `
            <tr>
              <td style="padding:22px 40px 6px 40px;" align="left">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border-left:3px solid #4A90E2;background:#F4F7FC;border-radius:0 8px 8px 0;">
                  <tr>
                    <td style="padding:14px 18px;">
                      <div style="font-family:${FONT_SANS};font-size:13px;font-weight:700;color:#0F1B2E;margin-bottom:4px;">
                        ${escapeHtml(block.heading)}
                      </div>
                      <div style="font-family:${FONT_SANS};font-size:13px;line-height:1.6;color:#4A5368;">
                        ${escapeHtml(block.body)}
                      </div>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>`
    case 'bullets': {
      const rows = block.items
        .map(
          (item, i) => `
                  <tr>
                    <td valign="top" width="32" style="padding:0 12px 14px 0;">
                      <div style="width:24px;height:24px;border-radius:50%;background:#4A90E2;color:#FFFFFF;font-family:${FONT_LABEL};font-size:12px;font-weight:700;line-height:24px;text-align:center;">
                        ${i + 1}
                      </div>
                    </td>
                    <td valign="top" style="padding:0 0 14px 0;">
                      <div style="font-family:${FONT_SANS};font-size:14.5px;font-weight:600;color:#1A2030;line-height:1.35;margin-bottom:3px;">
                        ${escapeHtml(item.title)}
                      </div>
                      <div style="font-family:${FONT_SANS};font-size:13.5px;line-height:1.55;color:#4A5368;">
                        ${escapeHtml(item.body)}
                      </div>
                    </td>
                  </tr>`
        )
        .join('')
      return `
            <tr>
              <td style="padding:24px 40px 6px 40px;" align="left">
                <div style="font-family:${FONT_LABEL};font-size:11px;letter-spacing:0.2em;text-transform:uppercase;color:#2B4780;font-weight:700;margin-bottom:12px;">
                  ${escapeHtml(block.heading)}
                </div>
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                  ${rows}
                </table>
              </td>
            </tr>`
    }
    case 'divider':
      return `
            <tr>
              <td style="padding:8px 40px;">
                <div style="height:1px;background:#D0D3DC;"></div>
              </td>
            </tr>`
    case 'fallback_link':
      return `
            <tr>
              <td style="padding:20px 40px 8px 40px;font-family:${FONT_SANS};font-size:12px;line-height:1.55;color:#8A96AA;">
                Button not working? Paste this link into your browser:<br />
                <span style="word-break:break-all;color:#2B4780;">${escapeHtml(block.url)}</span>
              </td>
            </tr>`
  }
}

function renderBlockText(block: BrandedEmailBlock): string {
  switch (block.type) {
    case 'paragraph':
      return block.body
    case 'heading':
      return `— ${block.body} —`
    case 'job_card':
      return [
        block.title,
        `Date: ${block.dateLabel}`,
        block.location ? `Location: ${block.location}` : null,
        block.rateLabel ? `Rate: ${block.rateLabel}` : null,
      ]
        .filter(Boolean)
        .join('\n')
    case 'cta':
      return `${block.label}: ${block.url}`
    case 'calendar_cta':
      return `${block.label}: ${block.icsUrl}`
    case 'callout':
      return `${block.heading}\n${block.body}`
    case 'bullets':
      return [
        `— ${block.heading} —`,
        ...block.items.map((it, i) => `${i + 1}. ${it.title}. ${it.body}`),
      ].join('\n')
    case 'divider':
      return ''
    case 'fallback_link':
      return `Link: ${block.url}`
  }
}

export function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function escapeAttr(s: string): string {
  return escapeHtml(s)
}

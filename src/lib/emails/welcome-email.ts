/**
 * Branded welcome email — aligns with rowlystudios.com (navy palette,
 * DM Sans body, Playfair Display headlines, Brandon Grotesque CTA).
 * External fonts won't load in Outlook/Gmail, so we layer safe fallbacks.
 *
 * Button URL is the Supabase magic link: clicking it sets a session,
 * lands on /welcome, user sets a password, and is signed into /app.
 */

type WelcomeEmailArgs = {
  firstName: string
  applicationType: 'talent' | 'client' | string
  actionLink: string
}

export function renderWelcomeEmail({
  firstName,
  applicationType,
  actionLink,
}: WelcomeEmailArgs): { subject: string; html: string; text: string } {
  const isTalent = applicationType === 'talent'
  const roleLine = isTalent
    ? 'as talent on the Rowly Studios roster'
    : 'as a client of Rowly Studios'
  const cleanFirst = (firstName || '').trim()
  const greeting = cleanFirst ? `Hi ${cleanFirst},` : 'Hi,'
  const subject = cleanFirst
    ? `${cleanFirst}, your Rowly Studios application has been accepted`
    : 'Your Rowly Studios application has been accepted'

  const gettingStartedItems = isTalent
    ? [
        {
          title: 'Complete your profile',
          body:
            'Add your bio, headshot, portfolio samples, and the crew roles you cover.',
        },
        {
          title: 'Set your rates and floor',
          body:
            'Tell us your day rate and minimum floor — we handle the client-side markup.',
        },
        {
          title: 'Keep your calendar current',
          body:
            'Mark unavailable dates so you only get booked when you can shoot.',
        },
        {
          title: 'Get booked',
          body:
            'We send jobs that match your skills. Accept, counter, or decline in one tap.',
        },
      ]
    : [
        {
          title: 'Set up your brand profile',
          body:
            'Add your company details and primary contact so talent know who they are working with.',
        },
        {
          title: 'Post your first job',
          body:
            'Share dates, location, crew roles, and budget — we handle sourcing.',
        },
        {
          title: 'Review proposed talent',
          body:
            'See curated profiles with rates, availability, and past work before confirming.',
        },
        {
          title: 'Track budget and invoices',
          body:
            'Live spend tracking, call sheets, and invoicing all in one place.',
        },
      ]

  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <meta name="color-scheme" content="light only" />
    <meta name="supported-color-schemes" content="light" />
    <title>${escapeHtml(subject)}</title>
    <!--[if mso]>
      <style>
        * { font-family: Arial, Helvetica, sans-serif !important; }
      </style>
    <![endif]-->
  </head>
  <body style="margin:0;padding:0;background:#F4F7FC;font-family:'DM Sans','Helvetica Neue',Helvetica,Arial,sans-serif;color:#1A2030;-webkit-font-smoothing:antialiased;">
    <!-- Preheader (hidden preview text in inbox list) -->
    <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;opacity:0;color:transparent;">
      Welcome to Rowly Studios. Create your account and get started.
    </div>

    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#F4F7FC;">
      <tr>
        <td align="center" style="padding:32px 16px;">
          <table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="max-width:600px;width:100%;background:#FFFFFF;border-radius:10px;overflow:hidden;border:1px solid #E8EDF5;">

            <!-- ═══ NAVY HEADER BAND WITH CTA ═══ -->
            <tr>
              <td style="background:#0F1B2E;padding:36px 40px 32px 40px;" align="left">
                <div style="font-family:'brandon-grotesque','Helvetica Neue',Helvetica,Arial,sans-serif;font-size:11px;letter-spacing:0.22em;text-transform:uppercase;color:#8A96AA;font-weight:700;margin-bottom:18px;">
                  Rowly Studios
                </div>
                <h1 style="margin:0 0 8px 0;font-family:'Playfair Display',Georgia,'Times New Roman',serif;font-size:26px;line-height:1.25;color:#FFFFFF;font-weight:500;letter-spacing:-0.01em;">
                  Your application has been accepted
                </h1>
                <p style="margin:0 0 24px 0;font-family:'DM Sans','Helvetica Neue',Helvetica,Arial,sans-serif;font-size:15px;line-height:1.55;color:#C7D1E0;">
                  ${escapeHtml(greeting)} we're thrilled to welcome you ${escapeHtml(roleLine)}.
                </p>

                <!-- PRIMARY CTA — bulletproof email button -->
                <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                  <tr>
                    <td align="center" bgcolor="#2B4780" style="background:#2B4780;border-radius:6px;">
                      <a href="${escapeAttr(actionLink)}"
                         target="_blank"
                         style="display:inline-block;padding:15px 36px;font-family:'brandon-grotesque','Helvetica Neue',Helvetica,Arial,sans-serif;font-size:13px;font-weight:700;color:#FFFFFF;text-decoration:none;letter-spacing:0.08em;text-transform:uppercase;line-height:1;">
                        Create your account
                      </a>
                    </td>
                  </tr>
                </table>
                <p style="margin:14px 0 0 0;font-family:'DM Sans','Helvetica Neue',Helvetica,Arial,sans-serif;font-size:12.5px;line-height:1.5;color:#8A96AA;">
                  One tap. Set a password and you're in — no extra sign-in step.
                </p>
              </td>
            </tr>

            <!-- ═══ GETTING STARTED ═══ -->
            <tr>
              <td style="padding:32px 40px 8px 40px;" align="left">
                <div style="font-family:'brandon-grotesque','Helvetica Neue',Helvetica,Arial,sans-serif;font-size:11px;letter-spacing:0.2em;text-transform:uppercase;color:#2B4780;font-weight:700;margin-bottom:10px;">
                  Getting started
                </div>
                <h2 style="margin:0 0 20px 0;font-family:'Playfair Display',Georgia,'Times New Roman',serif;font-size:20px;line-height:1.3;color:#1A2030;font-weight:500;">
                  ${isTalent ? "Once you're in, here's the sequence" : "Here's what happens next"}
                </h2>

                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                  ${gettingStartedItems
                    .map(
                      (item, i) => `
                  <tr>
                    <td valign="top" width="32" style="padding:0 12px 18px 0;">
                      <div style="width:24px;height:24px;border-radius:50%;background:#4A90E2;color:#FFFFFF;font-family:'brandon-grotesque','Helvetica Neue',Helvetica,Arial,sans-serif;font-size:12px;font-weight:700;line-height:24px;text-align:center;">
                        ${i + 1}
                      </div>
                    </td>
                    <td valign="top" style="padding:0 0 18px 0;">
                      <div style="font-family:'DM Sans','Helvetica Neue',Helvetica,Arial,sans-serif;font-size:14.5px;font-weight:600;color:#1A2030;line-height:1.35;margin-bottom:3px;">
                        ${escapeHtml(item.title)}
                      </div>
                      <div style="font-family:'DM Sans','Helvetica Neue',Helvetica,Arial,sans-serif;font-size:13.5px;line-height:1.55;color:#4A5368;">
                        ${escapeHtml(item.body)}
                      </div>
                    </td>
                  </tr>`
                    )
                    .join('')}
                </table>
              </td>
            </tr>

            <!-- ═══ DIVIDER ═══ -->
            <tr>
              <td style="padding:8px 40px;">
                <div style="height:1px;background:#D0D3DC;"></div>
              </td>
            </tr>

            <!-- ═══ INSTALL ON MOBILE ═══ -->
            <tr>
              <td style="padding:28px 40px 8px 40px;" align="left">
                <div style="font-family:'brandon-grotesque','Helvetica Neue',Helvetica,Arial,sans-serif;font-size:11px;letter-spacing:0.2em;text-transform:uppercase;color:#2B4780;font-weight:700;margin-bottom:10px;">
                  Install on your phone
                </div>
                <h2 style="margin:0 0 16px 0;font-family:'Playfair Display',Georgia,'Times New Roman',serif;font-size:20px;line-height:1.3;color:#1A2030;font-weight:500;">
                  Put Rowly Studios on your home screen
                </h2>
                <p style="margin:0 0 20px 0;font-family:'DM Sans','Helvetica Neue',Helvetica,Arial,sans-serif;font-size:14px;line-height:1.6;color:#4A5368;">
                  After you create your account, install the app for push notifications, camera uploads, and calendar on the go.
                </p>

                <!-- iPhone card -->
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#F4F7FC;border-radius:8px;margin-bottom:12px;">
                  <tr>
                    <td style="padding:16px 20px;">
                      <div style="font-family:'DM Sans','Helvetica Neue',Helvetica,Arial,sans-serif;font-size:13px;font-weight:700;color:#0F1B2E;margin-bottom:8px;">
                        iPhone — Safari
                      </div>
                      <div style="font-family:'DM Sans','Helvetica Neue',Helvetica,Arial,sans-serif;font-size:13px;line-height:1.7;color:#4A5368;">
                        1. Open <strong style="color:#1A2030;">app.rowlystudios.com</strong> in Safari<br/>
                        2. Tap the <strong style="color:#1A2030;">Share</strong> icon at the bottom<br/>
                        3. Scroll and tap <strong style="color:#1A2030;">Add to Home Screen</strong> → <strong style="color:#1A2030;">Add</strong>
                      </div>
                    </td>
                  </tr>
                </table>

                <!-- Android card -->
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#F4F7FC;border-radius:8px;">
                  <tr>
                    <td style="padding:16px 20px;">
                      <div style="font-family:'DM Sans','Helvetica Neue',Helvetica,Arial,sans-serif;font-size:13px;font-weight:700;color:#0F1B2E;margin-bottom:8px;">
                        Android — Chrome
                      </div>
                      <div style="font-family:'DM Sans','Helvetica Neue',Helvetica,Arial,sans-serif;font-size:13px;line-height:1.7;color:#4A5368;">
                        1. Open <strong style="color:#1A2030;">app.rowlystudios.com</strong> in Chrome<br/>
                        2. Tap the <strong style="color:#1A2030;">⋮ menu</strong> (top right)<br/>
                        3. Tap <strong style="color:#1A2030;">Install app</strong> or <strong style="color:#1A2030;">Add to Home screen</strong>
                      </div>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>

            <!-- ═══ DESKTOP NOTICE ═══ -->
            <tr>
              <td style="padding:22px 40px 8px 40px;" align="left">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border-left:3px solid #4A90E2;background:#F4F7FC;border-radius:0 8px 8px 0;">
                  <tr>
                    <td style="padding:14px 18px;">
                      <div style="font-family:'DM Sans','Helvetica Neue',Helvetica,Arial,sans-serif;font-size:13px;font-weight:700;color:#0F1B2E;margin-bottom:4px;">
                        Reading this on your desktop?
                      </div>
                      <div style="font-family:'DM Sans','Helvetica Neue',Helvetica,Arial,sans-serif;font-size:13px;line-height:1.6;color:#4A5368;">
                        That's fine — the web version works on any browser. But the full experience (notifications, on-set uploads, calendar) lives on mobile. Click the button above to create your account now, then open <strong style="color:#1A2030;">app.rowlystudios.com</strong> on your phone to install.
                      </div>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>

            <!-- ═══ FALLBACK LINK ═══ -->
            <tr>
              <td style="padding:24px 40px 8px 40px;font-family:'DM Sans','Helvetica Neue',Helvetica,Arial,sans-serif;font-size:12px;line-height:1.55;color:#8A96AA;">
                Button not working? Paste this link into your browser:<br />
                <span style="word-break:break-all;color:#2B4780;">${escapeHtml(actionLink)}</span>
              </td>
            </tr>

            <!-- ═══ FOOTER ═══ -->
            <tr>
              <td style="padding:24px 40px 32px 40px;font-family:'DM Sans','Helvetica Neue',Helvetica,Arial,sans-serif;font-size:12px;line-height:1.55;color:#8A96AA;border-top:1px solid #E8EDF5;">
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
    `Your Rowly Studios application has been accepted — welcome ${roleLine}.`,
    '',
    'Create your account:',
    actionLink,
    '',
    "One tap — set a password and you're in. No extra sign-in step.",
    '',
    '— Getting started —',
    ...gettingStartedItems.map(
      (it, i) => `${i + 1}. ${it.title}. ${it.body}`
    ),
    '',
    '— Install on your phone —',
    'iPhone (Safari): app.rowlystudios.com → Share → Add to Home Screen',
    'Android (Chrome): app.rowlystudios.com → ⋮ → Install app',
    '',
    'Reading this on desktop? The web version works on any browser, but the',
    'full experience is on mobile. Create your account now, then open',
    'app.rowlystudios.com on your phone to install.',
    '',
    'Rowly Studios — Los Angeles, California',
    'rowlystudios@gmail.com',
  ]

  return { subject, html, text: textLines.join('\n') }
}

function escapeHtml(s: string): string {
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

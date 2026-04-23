/**
 * Branded welcome email for accepted talent / client applications.
 *
 * Pure HTML template — no DB / auth access. Returns subject + html + text
 * for use with sendTransactionalEmail (Resend). NOT a 'use server' file:
 * Next 14 forbids non-async exports from 'use server' files, and this is
 * a synchronous render. It's only imported server-side via dynamic import
 * in admin/applications/actions.ts so it never ends up in client bundles.
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
  const roleLine = isTalent ? 'as talent on our roster' : 'as a client'
  const greeting = firstName?.trim() ? `Hi ${firstName.trim()},` : 'Hi,'
  const subject = firstName?.trim()
    ? `${firstName.trim()}, welcome to Rowly Studios — create your account`
    : 'Welcome to Rowly Studios — create your account'

  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <meta name="color-scheme" content="light only" />
    <meta name="supported-color-schemes" content="light" />
    <title>${escapeHtml(subject)}</title>
  </head>
  <body style="margin:0;padding:0;background:#f4f1ea;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1A2030;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f4f1ea;">
      <tr>
        <td align="center" style="padding:32px 16px;">
          <table role="presentation" width="560" cellspacing="0" cellpadding="0" border="0" style="max-width:560px;width:100%;background:#ffffff;border-radius:14px;overflow:hidden;box-shadow:0 2px 12px rgba(26,60,107,0.08);">

            <!-- Header -->
            <tr>
              <td align="left" style="padding:28px 32px 0 32px;">
                <div style="font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:#1A3C6B;font-weight:700;">Rowly Studios</div>
              </td>
            </tr>

            <!-- Headline -->
            <tr>
              <td style="padding:24px 32px 8px 32px;">
                <h1 style="margin:0;font-size:22px;line-height:1.25;color:#1A2030;font-weight:600;">
                  Rowly Studios accepted your application
                </h1>
              </td>
            </tr>

            <!-- Body copy -->
            <tr>
              <td style="padding:12px 32px 20px 32px;font-size:15px;line-height:1.55;color:#3a3f4a;">
                ${escapeHtml(greeting)}<br /><br />
                We've reviewed your application to join Rowly Studios ${escapeHtml(roleLine)} — and we'd love to have you on board.
                <br /><br />
                Tap the button below to create your account. After you set a password, you're signed in — no extra sign-in step.
              </td>
            </tr>

            <!-- CTA button -->
            <tr>
              <td align="center" style="padding:8px 32px 28px 32px;">
                <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                  <tr>
                    <td align="center" bgcolor="#1A3C6B" style="background:#1A3C6B;border-radius:10px;">
                      <a href="${escapeAttr(actionLink)}"
                         style="display:inline-block;padding:14px 36px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;letter-spacing:0.02em;">
                        Create your account
                      </a>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>

            <!-- Divider -->
            <tr>
              <td style="padding:0 32px;">
                <div style="height:1px;background:#e8e3d8;"></div>
              </td>
            </tr>

            <!-- Mobile install instructions -->
            <tr>
              <td style="padding:24px 32px 8px 32px;">
                <h2 style="margin:0 0 6px 0;font-size:14px;line-height:1.3;color:#1A3C6B;font-weight:700;letter-spacing:0.02em;">
                  📱 Opening this on your phone?
                </h2>
                <p style="margin:0 0 14px 0;font-size:14px;line-height:1.55;color:#3a3f4a;">
                  Create your account first, then install Rowly Studios as an app on your home screen:
                </p>
                <div style="font-size:13.5px;line-height:1.55;color:#3a3f4a;">
                  <strong style="color:#1A2030;">iPhone (Safari)</strong><br />
                  1. After creating your account, tap the <strong>Share</strong> icon at the bottom of Safari.<br />
                  2. Scroll down and tap <strong>Add to Home Screen</strong>.<br />
                  3. Tap <strong>Add</strong>. Rowly Studios is now an app on your home screen.
                </div>
                <div style="font-size:13.5px;line-height:1.55;color:#3a3f4a;margin-top:14px;">
                  <strong style="color:#1A2030;">Android (Chrome)</strong><br />
                  1. Tap the <strong>⋮ menu</strong> in the top right of Chrome.<br />
                  2. Tap <strong>Install app</strong> or <strong>Add to Home screen</strong>.<br />
                  3. Confirm. Rowly Studios is now an app on your home screen.
                </div>
              </td>
            </tr>

            <!-- Desktop note -->
            <tr>
              <td style="padding:20px 32px 8px 32px;">
                <div style="background:#f4f1ea;border-radius:10px;padding:16px 18px;">
                  <div style="font-size:13px;line-height:1.5;color:#1A2030;">
                    <strong>💻 Reading this on your desktop?</strong><br />
                    That's fine — the web version works on a laptop too. For the full experience (mobile notifications, camera uploads, on-the-go calendar), open <strong>app.rowlystudios.com</strong> on your phone after creating your account, or forward this email to yourself and open it on mobile.
                  </div>
                </div>
              </td>
            </tr>

            <!-- Fallback link -->
            <tr>
              <td style="padding:18px 32px 8px 32px;font-size:12px;line-height:1.5;color:#8a8f99;">
                Button not working? Paste this link into your browser:<br />
                <span style="word-break:break-all;color:#1A3C6B;">${escapeHtml(actionLink)}</span>
              </td>
            </tr>

            <!-- Footer -->
            <tr>
              <td style="padding:20px 32px 32px 32px;font-size:12px;line-height:1.5;color:#8a8f99;border-top:1px solid #e8e3d8;margin-top:16px;">
                Rowly Studios · Los Angeles, CA<br />
                Questions? Reply to this email or write to
                <a href="mailto:hello@rowlystudios.com" style="color:#1A3C6B;text-decoration:none;">hello@rowlystudios.com</a>
              </td>
            </tr>

          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`

  const text = [
    `${greeting}`,
    ``,
    `Rowly Studios accepted your application ${roleLine}.`,
    ``,
    `Create your account:`,
    `${actionLink}`,
    ``,
    `After you set a password, you're signed in automatically.`,
    ``,
    `— Installing the app on your phone —`,
    `iPhone: Safari → Share icon → Add to Home Screen → Add`,
    `Android: Chrome → ⋮ menu → Install app / Add to Home screen`,
    ``,
    `Opening this on your desktop? The web app works on desktop, but the`,
    `full experience is on mobile. Forward this email to yourself and open`,
    `on your phone when you're ready.`,
    ``,
    `Rowly Studios · Los Angeles, CA`,
    `hello@rowlystudios.com`,
  ].join('\n')

  return { subject, html, text }
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

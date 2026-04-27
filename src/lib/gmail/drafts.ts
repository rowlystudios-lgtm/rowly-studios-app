import type { SupabaseClient } from '@supabase/supabase-js';
import { getValidAccessToken } from './tokens';

/**
 * Create a draft email in the admin's Gmail account using the Gmail API.
 *
 * The Gmail API expects the message as a base64url-encoded RFC 2822 MIME
 * string in `raw`. We construct a multipart message:
 *   - From: the admin's connected Google email
 *   - To: the client's email
 *   - Subject: from invoice render
 *   - Body: HTML (the rendered invoice email)
 *
 * Returns the draft ID, which can be opened in Gmail at:
 *   https://mail.google.com/mail/u/0/#drafts/{id}
 */
export async function createGmailDraft(
  supabase: SupabaseClient,
  params: {
    userId: string;
    toEmail: string;
    subject: string;
    htmlBody: string;
  },
): Promise<{ draftId: string; messageId: string; googleEmail: string }> {
  const { accessToken, googleEmail } = await getValidAccessToken(supabase, params.userId);

  const raw = buildRawMimeMessage({
    fromEmail: googleEmail,
    toEmail: params.toEmail,
    subject: params.subject,
    htmlBody: params.htmlBody,
  });

  const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/drafts', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      message: { raw },
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Gmail drafts.create failed: ${res.status} ${text}`);
  }

  const data = (await res.json()) as { id: string; message: { id: string } };
  return {
    draftId: data.id,
    messageId: data.message.id,
    googleEmail,
  };
}

/**
 * Build an RFC 2822 MIME message and base64url-encode it for the Gmail API.
 *
 * Subject must be RFC 2047-encoded if it contains non-ASCII chars. We use
 * a UTF-8 base64 encoding pattern.
 */
function buildRawMimeMessage(params: {
  fromEmail: string;
  toEmail: string;
  subject: string;
  htmlBody: string;
}): string {
  const encodedSubject = `=?UTF-8?B?${Buffer.from(params.subject, 'utf-8').toString('base64')}?=`;

  const lines = [
    `From: ${params.fromEmail}`,
    `To: ${params.toEmail}`,
    `Subject: ${encodedSubject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    Buffer.from(params.htmlBody, 'utf-8').toString('base64'),
  ];

  const message = lines.join('\r\n');

  // Gmail API requires base64url (URL-safe base64, no padding)
  return Buffer.from(message, 'utf-8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/**
 * Transactional email sender — Amazon SES first, Resend as the fallback.
 *
 * Provider selection (no code change needed to switch):
 *   EMAIL_PROVIDER=ses     → Amazon SES v2 (needs AWS_SES_REGION +
 *                            AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY,
 *                            EMAIL_FROM on a verified SES identity,
 *                            optional SES_CONFIGURATION_SET e.g. "rs-app")
 *   EMAIL_PROVIDER=resend  → Resend HTTP API (RESEND_API_KEY)
 *   unset                  → SES if AWS_SES_REGION is set, else Resend
 *
 * If neither provider is configured we log a warning and return an error —
 * the caller treats email as optional.
 */

import { renderBrandedEmail } from '@/lib/emails/template'

type Provider = 'ses' | 'resend' | 'none'

function provider(): Provider {
  const forced = (process.env.EMAIL_PROVIDER ?? '').toLowerCase()
  if (forced === 'ses') return process.env.AWS_SES_REGION ? 'ses' : 'none'
  if (forced === 'resend') return process.env.RESEND_API_KEY ? 'resend' : 'none'
  if (process.env.AWS_SES_REGION) return 'ses'
  if (process.env.RESEND_API_KEY) return 'resend'
  return 'none'
}

export function isEmailConfigured(): boolean {
  return provider() !== 'none'
}

type EmailAttachment = {
  filename: string
  /** Base64-encoded content (no data: prefix). */
  content: string
  /** Defaults to 'application/octet-stream' if omitted. */
  contentType?: string
}

type SendEmail = {
  to: string
  subject: string
  html: string
  replyTo?: string
  attachments?: EmailAttachment[]
}

// EMAIL_FROM is provider-agnostic. RESEND_FROM / RESEND_REPLY_TO remain as
// legacy fallbacks so an existing Vercel config keeps working untouched.
const DEFAULT_FROM =
  process.env.EMAIL_FROM ??
  process.env.RESEND_FROM ??
  'Rowly Studios <onboarding@resend.dev>'
const DEFAULT_REPLY_TO =
  process.env.EMAIL_REPLY_TO ||
  process.env.RESEND_REPLY_TO ||
  'rowlystudios@gmail.com'

export async function sendTransactionalEmail(
  msg: SendEmail
): Promise<{ id?: string; error?: string }> {
  const which = provider()
  if (which === 'none') {
    // eslint-disable-next-line no-console
    console.warn('[email] no provider configured (set AWS_SES_REGION or RESEND_API_KEY) — skipping')
    return { error: 'not_configured' }
  }
  return which === 'ses' ? sendViaSes(msg) : sendViaResend(msg)
}

/* ─────────── Amazon SES v2 ─────────── */

function encodeHeaderWord(s: string): string {
  // RFC 2047 encode non-ASCII subjects / names.
  return /^[\x20-\x7e]*$/.test(s)
    ? s
    : `=?UTF-8?B?${Buffer.from(s, 'utf8').toString('base64')}?=`
}

function buildRawMime(msg: SendEmail): string {
  const boundary = `rs-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
  const headers = [
    `From: ${DEFAULT_FROM}`,
    `To: ${msg.to}`,
    `Reply-To: ${msg.replyTo ?? DEFAULT_REPLY_TO}`,
    `Subject: ${encodeHeaderWord(msg.subject)}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
  ].join('\r\n')

  const htmlPart =
    `--${boundary}\r\n` +
    'Content-Type: text/html; charset=UTF-8\r\n' +
    'Content-Transfer-Encoding: base64\r\n\r\n' +
    Buffer.from(msg.html, 'utf8').toString('base64').replace(/(.{76})/g, '$1\r\n') +
    '\r\n'

  const attachmentParts = (msg.attachments ?? [])
    .map(
      (a) =>
        `--${boundary}\r\n` +
        `Content-Type: ${a.contentType ?? 'application/octet-stream'}; name="${a.filename}"\r\n` +
        `Content-Disposition: attachment; filename="${a.filename}"\r\n` +
        'Content-Transfer-Encoding: base64\r\n\r\n' +
        a.content.replace(/(.{76})/g, '$1\r\n') +
        '\r\n'
    )
    .join('')

  return `${headers}\r\n\r\n${htmlPart}${attachmentParts}--${boundary}--\r\n`
}

async function sendViaSes(
  msg: SendEmail
): Promise<{ id?: string; error?: string }> {
  try {
    const { SESv2Client, SendEmailCommand } = await import('@aws-sdk/client-sesv2')
    const client = new SESv2Client({ region: process.env.AWS_SES_REGION })
    const configurationSet = process.env.SES_CONFIGURATION_SET || undefined
    const out = await client.send(
      new SendEmailCommand({
        FromEmailAddress: DEFAULT_FROM,
        Destination: { ToAddresses: [msg.to] },
        ReplyToAddresses: [msg.replyTo ?? DEFAULT_REPLY_TO],
        ...(configurationSet ? { ConfigurationSetName: configurationSet } : {}),
        Content: {
          Raw: { Data: Buffer.from(buildRawMime(msg), 'utf8') },
        },
      })
    )
    return { id: out.MessageId }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[email] ses threw', err)
    return { error: err instanceof Error ? err.message : 'ses_failed' }
  }
}

/* ─────────── Resend (legacy fallback) ─────────── */

async function sendViaResend({
  to,
  subject,
  html,
  replyTo,
  attachments,
}: SendEmail): Promise<{ id?: string; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY as string
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: DEFAULT_FROM,
        to: [to],
        subject,
        html,
        reply_to: replyTo ?? DEFAULT_REPLY_TO,
        attachments: attachments?.map((a) => ({
          filename: a.filename,
          content: a.content,
          content_type: a.contentType ?? 'application/octet-stream',
        })),
      }),
    })
    const data = (await res.json().catch(() => ({}))) as {
      id?: string
      message?: string
    }
    if (!res.ok) {
      // eslint-disable-next-line no-console
      console.error('[email] resend failed', res.status, data)
      return { error: data.message ?? `http_${res.status}` }
    }
    return { id: data.id }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[email] resend threw', err)
    return { error: err instanceof Error ? err.message : 'fetch_failed' }
  }
}

/* ─────────── Branded transactional templates ─────────── */

export const EmailTemplates = {
  jobOffer({
    firstName,
    jobTitle,
    dateLabel,
    location,
    rateLabel,
    actionUrl,
    icsUrl,
  }: {
    firstName: string
    jobTitle: string
    dateLabel: string
    location: string
    rateLabel: string
    actionUrl: string
    icsUrl?: string | null
  }): string {
    return renderBrandedEmail({
      firstName,
      preheader: `New offer: ${jobTitle} on ${dateLabel}.`,
      eyebrow: 'Job offer',
      headline: 'You have a new job offer',
      intro: 'Rowly Studios would like to book you for a job.',
      blocks: [
        {
          type: 'paragraph',
          body: 'Tap the button below to accept, counter, or decline.',
        },
        {
          type: 'job_card',
          title: jobTitle,
          dateLabel,
          location: location || null,
          rateLabel,
        },
        { type: 'cta', label: 'Review offer', url: actionUrl },
        ...(icsUrl
          ? ([
              {
                type: 'calendar_cta',
                label: 'Add these dates to my calendar',
                icsUrl,
              },
            ] as const)
          : []),
      ],
    }).html
  },

  talentConfirmed({
    firstName,
    talentName,
    jobTitle,
    dateLabel,
    location,
    rateLabel,
    actionUrl,
    icsUrl,
  }: {
    firstName: string
    talentName: string
    jobTitle: string
    dateLabel: string
    location: string | null
    rateLabel: string
    actionUrl: string
    icsUrl?: string | null
  }): string {
    const selfConfirm = firstName.trim() === talentName.trim()
    return renderBrandedEmail({
      firstName,
      preheader: `${jobTitle} is locked in for ${dateLabel}.`,
      eyebrow: 'Booking confirmed',
      headline: selfConfirm ? 'You’re confirmed' : `${talentName} is confirmed`,
      intro: 'The booking is locked in.',
      blocks: [
        {
          type: 'job_card',
          title: jobTitle,
          dateLabel,
          location: location ?? null,
          rateLabel,
        },
        { type: 'cta', label: 'View booking', url: actionUrl },
        ...(icsUrl
          ? ([
              {
                type: 'calendar_cta',
                label: 'Add to my calendar',
                icsUrl,
              },
            ] as const)
          : []),
      ],
    }).html
  },

  fullyCrewed({
    firstName,
    jobTitle,
    dateLabel,
    location,
    talentList,
    actionUrl,
    icsUrl,
    chatUrl,
  }: {
    firstName: string
    jobTitle: string
    dateLabel: string
    location?: string | null
    talentList: string[]
    actionUrl: string
    icsUrl?: string | null
    chatUrl?: string | null
  }): string {
    const listBody = talentList.length
      ? talentList.map((t) => `• ${t}`).join('\n')
      : ''
    return renderBrandedEmail({
      firstName,
      preheader: `${jobTitle} is fully crewed for ${dateLabel}.`,
      eyebrow: 'Fully crewed',
      headline: 'Your job is fully crewed',
      intro: `Great news — ${jobTitle} is fully crewed.`,
      blocks: [
        {
          type: 'job_card',
          title: jobTitle,
          dateLabel,
          location: location ?? null,
        },
        ...(listBody
          ? ([
              {
                type: 'callout',
                heading: "Here's who's on it",
                body: listBody,
              },
            ] as const)
          : []),
        ...(chatUrl
          ? ([
              {
                type: 'paragraph',
                body:
                  'Use the job chat to coordinate call times, last-minute changes, or questions during the shoot. Admin is always in the chat if you need help.',
              },
            ] as const)
          : []),
        { type: 'cta', label: 'View job', url: actionUrl },
        ...(chatUrl
          ? ([
              {
                type: 'cta' as const,
                label: 'Open job chat',
                url: chatUrl,
              },
            ] as const)
          : []),
        ...(icsUrl
          ? ([
              {
                type: 'calendar_cta',
                label: 'Add to my calendar',
                icsUrl,
              },
            ] as const)
          : []),
      ],
    }).html
  },

  nudge({
    firstName,
    jobTitle,
    rateLabel,
    dateLabel,
    location,
    actionUrl,
  }: {
    firstName: string
    jobTitle: string
    rateLabel: string
    dateLabel: string
    location?: string | null
    actionUrl: string
  }): string {
    return renderBrandedEmail({
      firstName,
      preheader: `Your offer for ${jobTitle} is still waiting.`,
      eyebrow: 'Reminder',
      headline: 'Your job offer is still waiting',
      intro: 'You have a pending offer that needs your response.',
      blocks: [
        {
          type: 'job_card',
          title: jobTitle,
          dateLabel,
          location: location ?? null,
          rateLabel,
        },
        { type: 'cta', label: 'Review offer', url: actionUrl },
      ],
    }).html
  },

  counterOffer({
    firstName,
    talentName,
    jobTitle,
    dateLabel,
    location,
    counterLabel,
    notes,
    actionUrl,
  }: {
    firstName: string
    talentName: string
    jobTitle: string
    dateLabel: string
    location?: string | null
    counterLabel: string
    notes: string | null
    actionUrl: string
  }): string {
    return renderBrandedEmail({
      firstName,
      preheader: `${talentName} submitted a counter on ${jobTitle}.`,
      eyebrow: 'Counter offer',
      headline: 'Talent submitted a counter offer',
      intro: `${talentName} sent a counter for ${jobTitle}.`,
      blocks: [
        {
          type: 'job_card',
          title: jobTitle,
          dateLabel,
          location: location ?? null,
          rateLabel: counterLabel,
        },
        ...(notes
          ? ([
              {
                type: 'callout',
                heading: 'Notes from talent',
                body: notes,
              },
            ] as const)
          : []),
        { type: 'cta', label: 'Review in admin', url: actionUrl },
      ],
    }).html
  },

  declined({
    firstName,
    talentName,
    jobTitle,
    dateLabel,
    location,
    reason,
    actionUrl,
  }: {
    firstName: string
    talentName: string
    jobTitle: string
    dateLabel: string
    location?: string | null
    reason: string | null
    actionUrl: string
  }): string {
    return renderBrandedEmail({
      firstName,
      preheader: `${talentName} declined ${jobTitle}.`,
      eyebrow: 'Decline',
      headline: 'Talent declined the offer',
      intro: `${talentName} is unable to take ${jobTitle}.`,
      blocks: [
        {
          type: 'job_card',
          title: jobTitle,
          dateLabel,
          location: location ?? null,
        },
        {
          type: 'callout',
          heading: 'Reason',
          body: reason || 'Not provided',
        },
        { type: 'cta', label: 'Re-crew this job', url: actionUrl },
      ],
    }).html
  },

  // Confirms to the client that their booking request has been sent to a
  // specific talent. Fires alongside jobOffer to talent.
  clientBookingSent({
    firstName,
    talentName,
    jobTitle,
    dateLabel,
    location,
    rateLabel,
    actionUrl,
  }: {
    firstName: string
    talentName: string
    jobTitle: string
    dateLabel: string
    location?: string | null
    rateLabel: string
    actionUrl: string
  }): string {
    return renderBrandedEmail({
      firstName,
      preheader: `Request sent to ${talentName} for ${jobTitle}.`,
      eyebrow: 'Booking request sent',
      headline: 'Your booking request is out',
      intro: `We’ve sent your request to ${talentName}. You’ll hear as soon as they respond.`,
      blocks: [
        {
          type: 'job_card',
          title: jobTitle,
          dateLabel,
          location: location ?? null,
          rateLabel,
        },
        { type: 'cta', label: 'View job status', url: actionUrl },
      ],
    }).html
  },

  // Talent-side confirmation email — sent to talent when they accept an offer.
  talentConfirmation({
    firstName,
    jobTitle,
    dateLabel,
    rateLabel,
    location,
    callTime,
    actionUrl,
    icsUrl,
  }: {
    firstName: string
    jobTitle: string
    dateLabel: string
    rateLabel: string
    location: string | null
    callTime: string | null
    actionUrl: string
    icsUrl?: string | null
  }): string {
    const dateWithCall = callTime ? `${dateLabel} · Call ${callTime}` : dateLabel
    return renderBrandedEmail({
      firstName,
      preheader: `You’re booked on ${jobTitle}.`,
      eyebrow: 'You’re booked',
      headline: 'You’re booked',
      intro: 'Here are your confirmed job details.',
      blocks: [
        {
          type: 'job_card',
          title: jobTitle,
          dateLabel: dateWithCall,
          location: location ?? null,
          rateLabel,
        },
        {
          type: 'paragraph',
          body:
            'Your availability calendar updates automatically. Questions? Reply to this email or message admin in the app.',
        },
        { type: 'cta', label: 'Open in app', url: actionUrl },
        ...(icsUrl
          ? ([
              {
                type: 'calendar_cta',
                label: 'Add to my calendar',
                icsUrl,
              },
            ] as const)
          : []),
      ],
    }).html
  },

  /**
   * Admin status digest — a management-brief style email for every booking
   * event. The render layout is intentionally information-dense (single
   * card with grouped fields) rather than the marketing-style layout other
   * transactional emails use, because admins want at-a-glance parsing.
   */
  adminStatus({
    firstName,
    statusLabel,
    jobTitle,
    jobCode,
    jobDateLabel,
    jobLocation,
    talentName,
    talentEmail,
    clientName,
    clientEmail,
    offeredLabel,
    confirmedLabel,
    durationLabel,
    offerSentLabel,
    deadlineLabel,
    respondedLabel,
    actionUrl,
  }: {
    firstName: string
    statusLabel: string
    jobTitle: string
    jobCode: string | null
    jobDateLabel: string
    jobLocation: string | null
    talentName: string
    talentEmail: string | null
    clientName: string
    clientEmail: string | null
    offeredLabel: string
    confirmedLabel: string
    durationLabel: string
    offerSentLabel: string | null
    deadlineLabel: string | null
    respondedLabel: string | null
    actionUrl: string
  }): string {
    const row = (label: string, value: string) =>
      `${label.toUpperCase()}: ${value}`
    const lines = [
      row('Title', jobTitle),
      jobCode ? row('Code', jobCode) : null,
      row('Date', jobDateLabel),
      jobLocation ? row('Location', jobLocation) : null,
      row('Talent', `${talentName}${talentEmail ? ` <${talentEmail}>` : ''}`),
      row('Client', `${clientName}${clientEmail ? ` <${clientEmail}>` : ''}`),
      row('Offered', offeredLabel),
      row('Confirmed', confirmedLabel),
      row('Duration', durationLabel),
      offerSentLabel ? row('Offer sent', offerSentLabel) : null,
      deadlineLabel ? row('Deadline', deadlineLabel) : null,
      row('Responded', respondedLabel ?? 'Not yet'),
    ].filter((x): x is string => Boolean(x))

    return renderBrandedEmail({
      firstName,
      preheader: `${statusLabel}: ${talentName} / ${jobTitle}`,
      eyebrow: `Status · ${statusLabel}`,
      headline: `Booking update: ${statusLabel}`,
      intro: `${talentName} / ${jobTitle}${jobCode ? ` · ${jobCode}` : ''}`,
      blocks: [
        {
          type: 'job_card',
          title: jobTitle,
          dateLabel: jobDateLabel,
          location: jobLocation,
        },
        {
          type: 'callout',
          heading: 'Booking',
          body: lines.join('\n'),
        },
        { type: 'cta', label: 'View in admin', url: actionUrl },
      ],
    }).html
  },

  // Admin-side receipt when a booking is declined.
  adminDecline({
    firstName,
    talentName,
    jobTitle,
    dateLabel,
    location,
    reason,
    actionUrl,
  }: {
    firstName: string
    talentName: string
    jobTitle: string
    dateLabel: string
    location?: string | null
    reason: string | null
    actionUrl: string
  }): string {
    return renderBrandedEmail({
      firstName,
      preheader: `${talentName} declined ${jobTitle}.`,
      eyebrow: 'Decline',
      headline: 'Talent declined the offer',
      intro: `${talentName} declined ${jobTitle}. You’ll need to offer the slot to someone else.`,
      blocks: [
        {
          type: 'job_card',
          title: jobTitle,
          dateLabel,
          location: location ?? null,
        },
        {
          type: 'callout',
          heading: 'Reason',
          body: reason || 'Not provided',
        },
        { type: 'cta', label: 'Open job in admin', url: actionUrl },
      ],
    }).html
  },

  // Client-side receipt when a talent they requested declines.
  clientDecline({
    firstName,
    talentName,
    jobTitle,
    dateLabel,
    location,
    actionUrl,
  }: {
    firstName: string
    talentName: string
    jobTitle: string
    dateLabel: string
    location?: string | null
    actionUrl: string
  }): string {
    return renderBrandedEmail({
      firstName,
      preheader: `Update on ${jobTitle}.`,
      eyebrow: 'Update',
      headline: `Update on ${jobTitle}`,
      intro: `${talentName} couldn’t take this one. We’re already looking for a replacement — no action needed from you.`,
      blocks: [
        {
          type: 'job_card',
          title: jobTitle,
          dateLabel,
          location: location ?? null,
        },
        { type: 'cta', label: 'View job', url: actionUrl },
      ],
    }).html
  },
}

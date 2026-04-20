/**
 * Resend-backed transactional email sender. If RESEND_API_KEY is not set
 * we log a warning and return false — the caller treats email as optional.
 */

export function isEmailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY)
}

type SendEmail = {
  to: string
  subject: string
  html: string
  replyTo?: string
}

// Default to Resend's on-domain sender so emails ship immediately on any
// Resend account. Once rowlystudios.com is DNS-verified in Resend, set
// RESEND_FROM="Rowly Studios <noreply@rowlystudios.com>" in Vercel and
// traffic switches over automatically.
const DEFAULT_FROM =
  process.env.RESEND_FROM ?? 'Rowly Studios <onboarding@resend.dev>'

export async function sendTransactionalEmail({
  to,
  subject,
  html,
  replyTo,
}: SendEmail): Promise<{ id?: string; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    // eslint-disable-next-line no-console
    console.warn('[email] RESEND_API_KEY not configured — skipping')
    return { error: 'not_configured' }
  }
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
        reply_to: replyTo,
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

/* ─────────── HTML templates ─────────── */

function wrap(title: string, body: string, cta?: { label: string; url: string }): string {
  const button = cta
    ? `<div style="text-align:center;margin:28px 0 12px">
         <a href="${cta.url}" style="display:inline-block;padding:12px 22px;border-radius:10px;background:#1E3A6B;color:#fff;font-weight:600;text-decoration:none;font-size:14px">
           ${cta.label}
         </a>
       </div>`
    : ''
  return `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#F5F6F8;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;color:#1a1a1a">
    <div style="max-width:560px;margin:0 auto;padding:24px 16px">
      <div style="background:#0F1B2E;padding:24px 28px;border-radius:14px 14px 0 0;color:#fff">
        <p style="margin:0;font-family:Georgia,serif;font-style:italic;font-size:22px;letter-spacing:0.02em">Rowly Studios</p>
        <p style="margin:4px 0 0;font-size:10px;letter-spacing:0.2em;text-transform:uppercase;color:#F0A500;font-weight:700">Notification</p>
      </div>
      <div style="background:#fff;padding:28px;border-radius:0 0 14px 14px">
        <h1 style="margin:0 0 14px;font-size:20px;color:#0F1B2E">${title}</h1>
        <div style="font-size:14px;line-height:1.6;color:#374151">${body}</div>
        ${button}
      </div>
      <p style="margin:14px 0 0;text-align:center;font-size:11px;color:#7A90AA">Rowly Studios · Los Angeles, CA</p>
    </div>
  </body></html>`
}

export const EmailTemplates = {
  jobOffer({
    jobTitle,
    dateLabel,
    location,
    rateLabel,
    actionUrl,
  }: {
    jobTitle: string
    dateLabel: string
    location: string
    rateLabel: string
    actionUrl: string
  }) {
    return wrap(
      'You have a new job offer',
      `<p><strong>${jobTitle}</strong><br/>${dateLabel}${location ? `<br/>${location}` : ''}</p>
       <p style="font-size:16px;color:#0F1B2E;font-weight:600;margin-top:12px">Rate: ${rateLabel}</p>
       <p style="color:#7A90AA">Tap the button below to accept, counter, or decline.</p>`,
      { label: 'View offer in app', url: actionUrl }
    )
  },
  talentConfirmed({
    talentName,
    jobTitle,
    dateLabel,
    rateLabel,
    actionUrl,
  }: {
    talentName: string
    jobTitle: string
    dateLabel: string
    rateLabel: string
    actionUrl: string
  }) {
    return wrap(
      `${talentName} has confirmed`,
      `<p><strong>${talentName}</strong> has confirmed your booking for <strong>${jobTitle}</strong> on ${dateLabel}.</p>
       <p>Rate confirmed at <strong>${rateLabel}</strong>.</p>`,
      { label: 'View job', url: actionUrl }
    )
  },
  fullyCrewed({
    jobTitle,
    dateLabel,
    talentList,
    actionUrl,
  }: {
    jobTitle: string
    dateLabel: string
    talentList: string[]
    actionUrl: string
  }) {
    const list =
      talentList.length > 0
        ? `<ul style="margin:10px 0;padding-left:18px;color:#374151">${talentList
            .map((t) => `<li>${t}</li>`)
            .join('')}</ul>`
        : ''
    return wrap(
      `${jobTitle} is fully crewed 🎉`,
      `<p>Great news — <strong>${jobTitle}</strong> on ${dateLabel} is now fully crewed.</p>
       <p style="font-size:12px;color:#7A90AA;margin-top:6px">Confirmed talent:</p>
       ${list}`,
      { label: 'View job', url: actionUrl }
    )
  },
  nudge({
    jobTitle,
    rateLabel,
    dateLabel,
    actionUrl,
  }: {
    jobTitle: string
    rateLabel: string
    dateLabel: string
    actionUrl: string
  }) {
    return wrap(
      'Pending job offer — please respond',
      `<p>You have a pending job offer that needs your response:</p>
       <p><strong>${jobTitle}</strong> · ${dateLabel} · ${rateLabel}</p>`,
      { label: 'View offer', url: actionUrl }
    )
  },
  counterOffer({
    talentName,
    jobTitle,
    counterLabel,
    notes,
    actionUrl,
  }: {
    talentName: string
    jobTitle: string
    counterLabel: string
    notes: string | null
    actionUrl: string
  }) {
    return wrap(
      `${talentName} has counter-offered`,
      `<p><strong>${talentName}</strong> has counter-offered on <strong>${jobTitle}</strong>.</p>
       <p style="font-size:16px;color:#0F1B2E;font-weight:600;margin-top:10px">Counter: ${counterLabel}</p>
       ${notes ? `<p style="color:#7A90AA;font-style:italic">${notes}</p>` : ''}`,
      { label: 'Review in admin', url: actionUrl }
    )
  },
  declined({
    talentName,
    jobTitle,
    reason,
    actionUrl,
  }: {
    talentName: string
    jobTitle: string
    reason: string | null
    actionUrl: string
  }) {
    return wrap(
      `${talentName} declined ${jobTitle}`,
      `<p><strong>${talentName}</strong> has declined the offer for <strong>${jobTitle}</strong>.</p>
       <p style="color:#7A90AA;margin-top:6px">Reason: ${reason || 'Not provided'}</p>`,
      { label: 'Open job', url: actionUrl }
    )
  },
  // Confirms to the client that their booking request has been sent to a
  // specific talent. Fires alongside jobOffer to talent.
  clientBookingSent({
    talentName,
    jobTitle,
    dateLabel,
    rateLabel,
    actionUrl,
  }: {
    talentName: string
    jobTitle: string
    dateLabel: string
    rateLabel: string
    actionUrl: string
  }) {
    return wrap(
      'Your booking request has been sent',
      `<p>We&rsquo;ve sent your booking request to <strong>${talentName}</strong> for <strong>${jobTitle}</strong> on ${dateLabel}.</p>
       <p style="font-size:15px;color:#0F1B2E;font-weight:600;margin-top:10px">Offered rate: ${rateLabel}</p>
       <p style="color:#7A90AA;margin-top:8px">You&rsquo;ll be notified as soon as they respond.</p>`,
      { label: 'View job status', url: actionUrl }
    )
  },
  // Talent-side confirmation email — sent to talent when they accept an offer.
  talentConfirmation({
    jobTitle,
    dateLabel,
    rateLabel,
    location,
    callTime,
    actionUrl,
  }: {
    jobTitle: string
    dateLabel: string
    rateLabel: string
    location: string | null
    callTime: string | null
    actionUrl: string
  }) {
    const detailsList = [
      `Rate: <strong>${rateLabel}</strong>`,
      location ? `Location: ${location}` : null,
      callTime ? `Call time: ${callTime}` : null,
    ]
      .filter(Boolean)
      .join('<br/>')
    return wrap(
      `You're confirmed for ${jobTitle}`,
      `<p>You&rsquo;re confirmed for <strong>${jobTitle}</strong> on ${dateLabel}.</p>
       <p style="font-size:14px;color:#374151;margin-top:10px;line-height:1.7">${detailsList}</p>
       <p style="color:#7A90AA;margin-top:8px">See the full brief and call sheet in your app.</p>`,
      { label: 'Open booking', url: actionUrl }
    )
  },
  /**
   * Admin status digest — a management-brief style email for every booking
   * event. Goes to rowlystudios@gmail.com (or whoever has role='admin'),
   * giving them a single-glance view of the job without having to click.
   */
  adminStatus({
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
  }) {
    const row = (label: string, value: string) => `
      <tr>
        <td style="padding:4px 14px 4px 0;color:#7A90AA;font-size:12px;text-transform:uppercase;letter-spacing:0.08em;white-space:nowrap;vertical-align:top">${label}</td>
        <td style="padding:4px 0;color:#0F1B2E;font-size:13px;vertical-align:top">${value}</td>
      </tr>`
    const header = (title: string) => `
      <tr>
        <td colspan="2" style="padding:14px 0 4px;border-top:1px solid #E5E7EB;color:#F0A500;font-size:10px;letter-spacing:0.16em;text-transform:uppercase;font-weight:700">─── ${title} ───</td>
      </tr>`
    return wrap(
      `Booking status: ${statusLabel}`,
      `<p style="margin:0 0 10px;padding:8px 12px;background:#F0A500;color:#0F1B2E;border-radius:8px;font-weight:700;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;text-align:center">STATUS: ${statusLabel}</p>
       <table style="width:100%;border-collapse:collapse">
         ${header('Job')}
         ${row('Title', jobTitle)}
         ${jobCode ? row('Code', `<span style="font-family:ui-monospace,SFMono-Regular,Menlo,monospace">${jobCode}</span>`) : ''}
         ${row('Date', jobDateLabel)}
         ${jobLocation ? row('Location', jobLocation) : ''}
         ${header('Booking')}
         ${row('Talent', `${talentName}${talentEmail ? ` &lt;${talentEmail}&gt;` : ''}`)}
         ${row('Client', `${clientName}${clientEmail ? ` &lt;${clientEmail}&gt;` : ''}`)}
         ${row('Offered', offeredLabel)}
         ${row('Confirmed', confirmedLabel)}
         ${row('Duration', durationLabel)}
         ${header('Timeline')}
         ${offerSentLabel ? row('Offer sent', offerSentLabel) : ''}
         ${deadlineLabel ? row('Deadline', deadlineLabel) : ''}
         ${row('Responded', respondedLabel ?? 'Not yet')}
       </table>`,
      { label: 'View in admin', url: actionUrl }
    )
  },
  // Admin-side receipt when a booking is declined.
  adminDecline({
    talentName,
    jobTitle,
    reason,
    actionUrl,
  }: {
    talentName: string
    jobTitle: string
    reason: string | null
    actionUrl: string
  }) {
    return wrap(
      `Declined: ${talentName} / ${jobTitle}`,
      `<p><strong>${talentName}</strong> declined the offer for <strong>${jobTitle}</strong>.</p>
       <p style="color:#7A90AA;margin-top:6px">Reason: ${reason || 'Not provided'}</p>
       <p style="color:#374151">You&rsquo;ll need to offer the slot to someone else.</p>`,
      { label: 'Open job in admin', url: actionUrl }
    )
  },
  // Client-side receipt when a talent they requested declines.
  clientDecline({
    talentName,
    jobTitle,
    actionUrl,
  }: {
    talentName: string
    jobTitle: string
    actionUrl: string
  }) {
    return wrap(
      `Update on ${jobTitle}`,
      `<p><strong>${talentName}</strong> couldn&rsquo;t take <strong>${jobTitle}</strong>. We&rsquo;re already looking for a replacement.</p>
       <p style="color:#7A90AA">No action needed from you — we&rsquo;ll update you as soon as someone new confirms.</p>`,
      { label: 'View job', url: actionUrl }
    )
  },
}

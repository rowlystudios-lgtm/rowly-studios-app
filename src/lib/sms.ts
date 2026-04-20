/**
 * Twilio SMS. If Twilio env vars are missing we log a warning and return
 * `{ skipped: true }` — the caller never blocks on SMS.
 */

export function isSmsConfigured(): boolean {
  return Boolean(
    process.env.TWILIO_ACCOUNT_SID &&
      process.env.TWILIO_AUTH_TOKEN &&
      process.env.TWILIO_FROM_NUMBER
  )
}

/** Best-effort E.164 formatting — Twilio requires leading + country code. */
function normalizePhone(raw: string): string | null {
  const cleaned = raw.replace(/[^\d+]/g, '')
  if (!cleaned) return null
  if (cleaned.startsWith('+')) return cleaned
  // Assume US if the user just typed 10 digits.
  if (cleaned.length === 10) return `+1${cleaned}`
  if (cleaned.length === 11 && cleaned.startsWith('1')) return `+${cleaned}`
  return `+${cleaned}`
}

export async function sendSMS({
  to,
  body,
}: {
  to: string
  body: string
}): Promise<{ sid?: string; error?: string }> {
  if (!isSmsConfigured()) {
    // eslint-disable-next-line no-console
    console.warn('[sms] Twilio not configured — skipping')
    return { error: 'not_configured' }
  }
  const sid = process.env.TWILIO_ACCOUNT_SID!
  const token = process.env.TWILIO_AUTH_TOKEN!
  const from = process.env.TWILIO_FROM_NUMBER!

  const normalized = normalizePhone(to)
  if (!normalized) {
    return { error: 'invalid_phone' }
  }

  // SMS segments are billed per 160 chars — trim just under to keep it a single segment.
  const trimmed = body.length > 155 ? `${body.slice(0, 152)}…` : body

  try {
    const form = new URLSearchParams()
    form.set('From', from)
    form.set('To', normalized)
    form.set('Body', trimmed)

    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
      {
        method: 'POST',
        headers: {
          Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString('base64')}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: form.toString(),
      }
    )
    const data = (await res.json().catch(() => ({}))) as {
      sid?: string
      message?: string
    }
    if (!res.ok) {
      // eslint-disable-next-line no-console
      console.error('[sms] twilio failed', res.status, data)
      return { error: data.message ?? `http_${res.status}` }
    }
    return { sid: data.sid }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[sms] twilio threw', err)
    return { error: err instanceof Error ? err.message : 'fetch_failed' }
  }
}

export const SmsTemplates = {
  jobOffer: (title: string, dateShort: string, rate: string) =>
    `New job offer: ${title} on ${dateShort}. Rate: ${rate}/day. Open Rowly Studios to respond.`,
  talentConfirmed: (name: string, title: string) =>
    `${name} confirmed for ${title}. Check your Rowly Studios app.`,
  nudge: (title: string) =>
    `Reminder: You have a pending Rowly Studios job offer for ${title}. Please respond.`,
  fullyCrewed: (title: string) =>
    `${title} is fully crewed! All talent confirmed.`,
}

/**
 * Rate semantics across the platform — single source of truth.
 *
 * STRICT RULE:
 *   offered_rate_cents / confirmed_rate_cents on job_bookings = TALENT NET
 *   (what the talent receives in their pocket).
 *
 *   clientRate = round(talentNet / 0.85) = what the client is invoiced.
 *   rsFee     = clientRate - talentNet   = RS platform income (15% of client rate).
 *
 *   NEVER show talent net to clients.
 *   NEVER use talent net on invoice line items or client-facing surfaces.
 */

export const PLATFORM_FEE = 0.15
export const TALENT_SHARE = 0.85

export function clientRateCents(
  talentNetCents: number | null | undefined
): number {
  if (talentNetCents == null) return 0
  return Math.round(talentNetCents / TALENT_SHARE)
}

export function rsFeeFromTalentNet(
  talentNetCents: number | null | undefined
): number {
  if (talentNetCents == null) return 0
  return clientRateCents(talentNetCents) - (talentNetCents ?? 0)
}

export function fmtUsd(cents: number | null | undefined): string {
  if (cents == null) return 'TBD'
  return '$' + (cents / 100).toLocaleString('en-US', { maximumFractionDigits: 0 })
}

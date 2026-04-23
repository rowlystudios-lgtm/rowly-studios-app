/**
 * Rate semantics across the platform — single source of truth.
 *
 * STRICT RULE:
 *   offered_rate_cents / confirmed_rate_cents on job_bookings = TALENT NET
 *   (what the talent receives in their pocket).
 *
 *   clientRate = round(talentNet × MARKUP)   = what the client is invoiced
 *                where MARKUP = 1 + PLATFORM_FEE = 1.15
 *   talentNet  = round(clientRate / MARKUP)  = inverse
 *   rsFee      = round(talentNet × PLATFORM_FEE) = RS platform income
 *
 *   NEVER show talent net to clients.
 *   NEVER use talent net on invoice line items or client-facing surfaces.
 */

export const PLATFORM_FEE = 0.15
export const MARKUP = 1.15 // 1 + PLATFORM_FEE
// Retained for backward compat with files importing TALENT_SHARE.
// Equals 1 / MARKUP (~0.8696). Use sparingly — prefer talentNetFromClient().
export const TALENT_SHARE = 1 / MARKUP

/** Talent net rate → client-facing rate (adds 15% on top). */
export function clientRateCents(
  talentNetCents: number | null | undefined
): number {
  if (talentNetCents == null) return 0
  return Math.round(talentNetCents * MARKUP)
}

/** Client-facing rate → talent net rate. */
export function talentNetFromClient(
  clientCents: number | null | undefined
): number {
  if (clientCents == null) return 0
  return Math.round(clientCents / MARKUP)
}

/** RS platform fee — 15% of the talent net. */
export function rsFeeFromTalentNet(
  talentNetCents: number | null | undefined
): number {
  if (talentNetCents == null) return 0
  return Math.round(talentNetCents * PLATFORM_FEE)
}

export function fmtUsd(cents: number | null | undefined): string {
  if (cents == null) return 'TBD'
  return '$' + (cents / 100).toLocaleString('en-US', { maximumFractionDigits: 0 })
}

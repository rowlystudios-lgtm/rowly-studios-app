# ROUND D — Open market (self-serve booking, fee switch) → Gate 4

GOAL: bookings start without Rowly. The 15% fee switches on for everyone after the
Founding 25's 0%-first-three-bookings window.

DONE WHEN (= **Gate 4**): 25% of bookings in a month start without Rowly touching
them (client posts → offers go out → talent confirms → wrap → paid), the fee is on,
and the Monday scorecard shows rebook rate holding.

PRE-CONDITIONS: Gate 3 passed; the legal pack has been through one real dispute or
cancellation cleanly; FROST has reviewed the Talent Agencies Act / AB5 framing
(`LEGAL-PACK-BRIEF.md`).

---

## D1 — Self-serve offers   **[Claude]**
- Client posts a job → the brief-intake shortlist (Round B2) runs automatically and
  offers go to the top N talent without admin approval, honoring rate floors,
  availability and the trusted-pairs auto-confirm toggle (already built:
  `trusted_pairs.enabled`). Admin is notified passively (booking_events) — the Phase 2
  decision, now applied to the first offer too.
- Guardrails: a job outside the wedge (not LA / not production, post, beauty & style)
  or above $10k routes to concierge instead.

## D2 — Fee switch   **[Claude]**
- `admin_settings.founding_free_bookings = 3`; per-talent counter
  `talent_profiles.founding_bookings_used`. Invoice math reads `rs_fee_percent` from
  the booking at generation time: 0 while the counter < 3 for a Founding talent,
  15 otherwise. Never shown to clients either way.

## D3 — Public roster   **[Claude]**
- `/roster` public page: Approved talent cards (from `/t/<code>` data), filter by
  department/city/date. Each card = the promo kit card. SEO: one page per talent.

## D4 — Pro tier (only after Gate 3, per framework §8)   **[Claude]**
- Sells tools only: premium promo templates + scheduled renders, profile analytics
  (views, clicks, conversion from `link_clicks`), multiple reels, calendar sync,
  priority support. ~$15–25/mo via Stripe Billing. **Never** ranking, placement,
  job access or badges.

## EXECUTION LOG
- 11 Oct 2026 — Round written. Not started. Prerequisite: Gate 3.

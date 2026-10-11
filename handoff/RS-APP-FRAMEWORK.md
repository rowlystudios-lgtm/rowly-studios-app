# RS APP — OPERATING FRAMEWORK v1.0 (11 Oct 2026)

Single source of truth for the RS App next stage. Lives in `handoff/` per the working rule: the repo is canonical, round blocks go here, chat history is not a source of requirements.
Reading copy with diagrams: https://claude.ai/code/artifact/77185e8f-da14-4503-96a3-8c1e346d4e3a

---

## 1 · Current state

Live at https://app.rowlystudios.com — Next.js 14 PWA · Vercel (prj_5hk0XTDfAd2pT1yJFMmBQNQ7baSY, team team_H0ip9CSZ5FblQeqaFoPBsoyH) · Supabase `vmsgainaazabertluxbo` (17+ tables, RLS on) · Stripe Connect · Resend + Gmail OAuth drafts.
Phases 1–9 shipped (Apr–Jul 2026). Full booking → invoice → payment path proven in Stripe SANDBOX (RS-INV-0001: $1,110.01 in, ~$964 to talent, ~$146 to RS). Jul 2026 security audit remediated. Zero real users: admin (Rowly), Stripe-connected talent (Rowly, Claudia), test client (Mankind).

## 2 · Settled decisions — don't reopen

- 15% RS fee lives in the legal agreement, never client-facing UI; clients see one price, talent see net.
- Email-only notifications; branded templates + .ics (SMS skipped, WhatsApp deferred).
- Website application = talent screening gate; invite email = pre-approval; no open signup.
- "Rowly Studios Approved" is the vetting brand; verticals: production + post crew, Beauty & Style confirmed fifth.
- Real accounts for live testing; reality ≠ spec → stop and flag "CONFLICT FOUND", never resolve silently.

## 3 · Open decisions (Rowly)

1. **Rate floor — resolved 11 Oct:** $300/day. Locked at DB level (`talent_rate_floor_min` on `rate_floor_cents`, matching the existing `talent_day_rate_min`) and sliders unified to $300–$1,500 / $25 steps.
2. **Gmail drafts:** app unverified, `gmail.compose` is Restricted (test-user workaround, tokens can lapse). Pursue Google verification, or send invoices via Resend with a copy to rowlystudios@gmail.com.
3. **Safeguard runtime — resolved 11 Oct:** the referenced guide maps to Claude Managed Agents; adopted as the runtime for the §5 pipelines.

## 4 · Pre-mortem (ranked) and counters

| # | How it dies | Counter |
| --- | --- | --- |
| 1 | Leakage — first booking goes well, everything after happens off-app | App does the admin (contracts, call sheets, invoices, .ics — built); deposits + payment protection; "Approved" status and reviews accrue on-platform only; one-tap rebook |
| 2 | Cold start never breaks — breadth means thin supply everywhere | One wedge: LA production, post and beauty/style, until liquidity |
| 3 | One bad shoot torches word of mouth | Vetting stays a real gate; backup-talent protocol; deposits + written cancellation tiers; nudge cron |
| 4 | Legal structure bites (CA Talent Agencies Act; AB5 classification) | Counsel question — FROST reviews marketplace-vs-agency framing, who the 15% is charged to, contract language, BEFORE real bookings |
| 5 | Solo-founder bandwidth; the app decays | Weekly cap on concierge briefs; admin already out of the booking critical path; one metric: completed bookings |
| 6 | Payments trust breaks early (dispute, late payout) | Cancellation tiers at booking; deposits; 5-day release timer (built); auto evidence pack |
| 7 | Silent rot — token lapses, webhook off, cron fails, nobody notices | Monitoring + weekly money-path smoke test; load-bearing email off unverified Gmail |
| 8 | Fee resentment — clients reverse-engineer the 15% | One client price, fee in the agreement; sell one-invoice convenience, never the markup |

## 5 · Automation playbook (run it lean)

Rule: every counter that can run without Rowly becomes a trigger → steps → alert-on-failure pipeline; a human tap only at the approval gates (money leaving, outbound sends, deploys, legal). Pipelines are idempotent (retries never double-send or double-charge), logged, loud on failure.

| Risk | Pipeline | Trigger → action | Builds on |
| --- | --- | --- | --- |
| #1 | Rebook nudge | 7 days post-completion → one-tap "book them again" email to client; quiet-quarter re-prompt | Email templates + cron (built) |
| #3 | Escalation ladder | Offer unanswered 48h → nudge (built); call unconfirmed 48h out → alert Rowly + backup list | Nudge cron (built) |
| #5 | Brief intake | Client brief form → auto-shortlist by vertical + availability → one-tap approval; Monday digest | New — Phase B |
| #6 | Evidence pack | Stripe dispute webhook → auto-assemble chat log, call sheet, confirmations into one PDF | New — small |
| #7 | Money-path smoke test | Weekly sandbox booking → invoice → webhook echo → alert on any failure; cron + token-expiry alerts | Phase A |
| — | Monday scorecard | Completed bookings, rebook rate, response times — computed and emailed weekly | Phase A–B |

**Runtime (confirmed 11 Oct 2026): Claude Managed Agents** — beta on the Claude API (header `managed-agents-2026-04-01`; API key required; enabled by default on API accounts).
- Agent defined once (model, system prompt, tools, MCP servers — Supabase/Stripe — and skills); runs in a managed sandbox with Bash, file and web tools, persistent state.
- **Scheduled deployments** fire sessions on a POSIX cron with an IANA timezone (America/Los_Angeles); manual-run endpoint tests a pipeline before it's trusted with a schedule.
- Built-in safeguards: per-run **budget cap** (each run bounded separately — nothing can overspend); every run recorded with its error + delivered as a **webhook** (failures are loud, never silent — pre-mortem #7); deployments **auto-pause** on unrecoverable errors; pause/unpause/archive lifecycle; **vaults** hold secrets (matches the no-secrets-in-chat rule).
- Split: judgment pipelines (escalation sweep, brief-intake shortlist, rebook digest, scorecard, smoke test) run as scheduled agents reading Supabase, drafting outputs — outbound sends and money stay behind the approval gates. Deterministic money paths (auto-invoice trigger, Stripe webhooks, evidence-pack assembly) stay plain code.
- Docs: https://platform.claude.com/docs/en/managed-agents/overview · https://platform.claude.com/docs/en/managed-agents/scheduled-deployments

## 6 · Cold start — zero clients, zero talent

Launch an agency with software underneath; the marketplace emerges from its bookings. Talent first — joining costs them nothing and hands them a tool.

1. **Founding 25 (supply, by hand).** From the warm target list (FROST orbit, WEN by Chaz Dean, Signature Entertainment, Trap House Productions, crew network, Beauty & Style via Beep Beauty). Offer: Approved status, 0% fee on first three bookings, featured placement, free booking page. Vetting stays real — the curation is the product.
2. **Single-player utility.** Every talent gets a shareable booking link for bio and signature; their existing inbound books through RS App. Supply recruits demand at zero ad spend.
3. **Be your own first client.** Every Rowly Studios production — FROST shoots, ALL Yummy Wellness and Lumadoodle shoots, production and marketing days — crewed and invoiced through RS App from day one. Guaranteed real bookings, payouts and reviews before any outside client.

Demand starts as concierge: "Send the brief; crewed in 24 hours; one invoice." Manual matching in the admin tools; every booking becomes case-study content.

## 7 · Flywheel + talent promo kit (Phase B build)

Loop: vetted talent joins → shares booking link → their clients book through RS App → clients meet the roster and book more talent → bookings + reviews make the roster worth joining.

Promo kit spec — the feature that powers the loop:
- Live reel link on the profile (Vimeo/YouTube, pasted once = always latest work); existing showreel field becomes "latest reel", embedded on the profile.
- App renders a branded share template: 4×5 + 9×16 card — name, role, Rowly Studios Approved badge, reel frame, **Book now**.
- Platform reality: IG/TikTok feed posts don't allow buttons → Book now lives in the Story link sticker and link-in-bio; the card carries a short URL + QR.
- Short link minted from the existing 8-char `share_code` (app.rowlystudios.com/t/‹code›), UTM-tagged — measures "client via talent link" and Gate 4's 25% self-serve.
- Server-rendered (image now, short MP4 later); one tap: Share to Instagram · Share to TikTok · Download.

## 8 · Paid talent tier — policy

Not at launch; build after Gate 3. It sells tools and self-promotion, never access to jobs or ranking — merit decides matching, ranking and job access; money buys a bigger shop window, never a better queue position.
- Pro tier later (~$15–25/mo): premium promo-kit templates + scheduled renders, profile analytics (views, clicks, booking conversion), multiple reels/portfolio pages, calendar sync, priority support.
- Never sold: ranking, placement, job access, trust badges ("Approved" stays earned).
- Earlier revenue levers that don't tax supply: 15% scales with job size; client-side plan for repeat bookers (waived service fees, retained crew).

## 9 · Gates and 90-day plan

Gates (pass/fail before the next phase gets effort or money):
- **Gate 1** — first live $ booking paid out clean (ends Phase A: harden).
- **Gate 2** — 25 approved profiles, 15 Stripe-connected (ends Phase B: seed supply + promo kit).
- **Gate 3** — 10 paid bookings, 3+ rebookings (ends Phase C: concierge; own shoots on-app).
- **Gate 4** — 25% of bookings start without Rowly (Phase D: open marketplace, 15% fee switch on).

90 days: W1–2 Phase A round + FROST legal brief + rate-floor decision · W3–4 Founding 25 (15 live, 10 Stripe-connected) · W5–6 first money — all own productions on-app, 5 paid bookings · W7–8 promo links out, roster public, first outside brief · W9–12 10 paid bookings, 3+ rebookings, first client via a talent link → set fee-switch date.
Tripwire: if W5–6 produce no completed bookings even from own productions, stop recruiting talent and rework the offer.

## 10 · Go-live blockers (Phase A contents)

1. Rotate ALL Stripe keys (secret exposed in an April chat) → live mode: live keys in Vercel, live Connect onboarding, subscribe `checkout.session.completed` webhook.
2. Auto-invoice generation on job completion (planned Step 4, unbuilt).
3. Verify rowlystudios.com in Resend; finish hello@ forwarding; move load-bearing email off unverified Gmail.
4. Error monitoring + weekly money-path smoke test.
5. Align rate floor to the decided value.
6. Legal pack drafted and surfaced in-product: booking terms, cancellation tiers, talent agreement (FROST review).

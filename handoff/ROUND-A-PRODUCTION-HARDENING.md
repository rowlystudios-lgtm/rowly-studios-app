# RS APP — ROUND HANDOFF (as of 11 Oct 2026)

PROJECT: RS App — talent booking platform, Rowly Studios Inc.
LIVE: https://app.rowlystudios.com · Next.js 14 PWA on Vercel
  (project prj_5hk0XTDfAd2pT1yJFMmBQNQ7baSY, team team_H0ip9CSZ5FblQeqaFoPBsoyH)
REPO: github.com/rowlystudios-lgtm/rowly-studios-app (main)
  local: /Users/rowly/Desktop/rowly-studios-app
DB: Supabase vmsgainaazabertluxbo — RLS on. Apply migrations one at a time:
  ALTER PUBLICATION inside a batch silently rolls the batch back.
STATE: Phases 1–9 shipped. Full booking → invoice → payment path proven in
  Stripe SANDBOX (RS-INV-0001). Zero real users. Jul 2026 security audit remediated.
FRAMEWORK: handoff/RS-APP-FRAMEWORK.md is the operating framework — read it first.

THIS ROUND — "PHASE A: PRODUCTION HARDENING":
1. Rotate ALL Stripe keys (a secret was exposed in an April chat), then switch
   to live mode: live keys in Vercel, live Connect onboarding, and subscribe
   the checkout.session.completed webhook.
2. Build auto-invoice generation on job completion (planned Step 4, unbuilt).
3. Verify rowlystudios.com in Resend; move load-bearing email off the
   unverified Gmail OAuth path (keep Gmail drafts as a nice-to-have).
4. Add error monitoring + a weekly money-path smoke test.
5. Align the rate floor everywhere to the decided value (Rowly confirms $300 or $450).
DELIVERABLE: one pasteable terminal block; done = a live-mode test booking
  paid and paid out clean (Gate 1).

WORKING AGREEMENTS:
- One pasteable block per round, ending in a deployed build — no multi-stage approvals.
- Secrets never in chat: hidden-input prompts in the terminal, values verified
  (live vs test) before saving anywhere.
- Reality ≠ spec → stop and flag "CONFLICT FOUND" for Rowly's decision; never resolve silently.
- Approval needed only for: money leaving, outbound sends, production deploys/DB writes, legal commitments.
- Round notes live in the repo (handoff/); the repo is the single source of truth.

TEST ACCOUNTS: admin rowlystudios@gmail.com · talent rowlydennisphoto@gmail.com
  · client mankindofabigdeal@gmail.com · beepbeauty@gmail.com (resettable)
DECIDED — DON'T REOPEN: 15% fee hidden from client UI · email-only notifications
  · website application = talent gate · "Rowly Studios Approved" branding

NEXT ROUND AFTER A — "PHASE B: SEED SUPPLY" (preview, do not build yet):
  Talent promo kit (reel link → branded 4×5/9×16 share card with Book now short
  link from share_code, UTM-tagged) · brief-intake pipeline · Monday scorecard.

────────────────────────────────────────────────────────────────────────
EXECUTION LOG — 11 Oct 2026 (run by Claude from chat; approved by Rowly)

DONE #2 — Auto-invoice on wrap: wrapping a job now completes its confirmed
  bookings and generates the Stripe invoice draft (idempotent; admin is
  emailed the blocker if generation fails). Backstopped by a unique
  active-invoice-per-job index.
DONE #4 — /api/cron/daily-ops (daily, 0 15 * * * UTC): releases expired
  booking grace windows (RPC existed, was never scheduled), EXECUTES talent
  payout transfers after the 5-day hold (this money-moving step did not
  exist before this round; webhook handleTransferCreated completes it),
  runs money-path smoke checks, and emails the admin on any problem plus
  an all-green summary every Monday.
DONE #5 — Rate floor locked at $300: DB constraint talent_rate_floor_min,
  profile-edit slider unified to 300–1500/$25 (migration
  supabase/migrations/20261011_phase_a_hardening.sql, applied live).
SECURITY (found in this round's audit, fixed):
  - createAccount hardened: 'admin' can never be created or assigned; talent
    signup requires a valid welcome invite matching the email; existing
    accounts are only recoverable with a valid invite and never when the
    target is the admin (closes an unauthenticated admin-mint / password-
    takeover hole).
  - /api/notifications restricted to CRON_SECRET (was: any logged-in user).
  - RLS: clients can no longer move a job's status past submitted.
  - /admin is blocked inside the iOS wrapper (RSAppiOS user agent) — the
    admin overview is website-only, per the operating rule.
ADDED — ios-wrapper/: Expo WebView app over app.rowlystudios.com
  (bundle com.rowlystudios.rsapp, Expo owner rowlyinla, Apple team
  QQ2URK7777, ITSAppUsesNonExemptEncryption=false). Built + submitted to
  TestFlight via the secure terminal block.

REMAINING — Rowly's secure terminal block (keys never in chat):
  #1 Stripe: roll the exposed test secret key now; subscribe the
     checkout.session.completed webhook; live-mode flip when ready
     (note: flipping live resets Connect onboarding + saved payment
     methods to live mode — redo those before a live test booking).
  #3 Resend: verify rowlystudios.com sending domain; finish hello@
     forwarding in GoDaddy.
  EAS: eas build --platform ios --auto-submit from ios-wrapper/.

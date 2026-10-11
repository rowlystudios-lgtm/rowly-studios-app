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

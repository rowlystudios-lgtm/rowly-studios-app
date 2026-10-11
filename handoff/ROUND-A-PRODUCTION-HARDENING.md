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
  (bundle com.rowlystudios.rsapp, slug rs-app, Expo owner rowlyinla, Apple
  team QQ2URK7777, ITSAppUsesNonExemptEncryption=false). NOT YET BUILT —
  see corrections below.

SESSION ERRORS & CORRECTIONS (11 Oct, logged so they aren't repeated):
  - First terminal block assumed the repo at ~/Desktop/rowly-studios-app;
    that path did not exist on the Mac. Fixed: the block now locates the
    repo anywhere under ~ or clones it fresh to ~/Desktop.
  - The first EAS run executed inside the LUMADOODLE folder and resolved
    @rowlyinla/BABY-LIGHT (com.rowlystudios.lumadoodle). No RS App build
    was produced; the Lumadoodle profile it generated is harmless. Fixed:
    /tmp/rs-testflight.sh hard-guards on slug rs-app + bundle
    com.rowlystudios.rsapp and refuses to build anything else.
  - Because Part 1 failed, Part 2 never ran: the exposed Stripe test key
    is STILL NOT ROTATED and checkout.session.completed is STILL NOT
    SUBSCRIBED. Must run before any client-facing invoice.
  - Apple 2FA code vanished mid-prompt: use Settings → Sign-In & Security
    → Get Verification Code, or choose sms at the validation prompt.
  - Chrome extension permission for console.aws.amazon.com not yet granted,
    so SES / WorkMail / GoDaddy DNS were not touched.

EMAIL DECISION (11 Oct): all email moves to Amazon — SES for the app's
  sending (own verified domain rowlystudios.com + own configuration set
  "rs-app", separate from Yummy's; free tier is per AWS account, not per
  app) and WorkMail for the hello@rowlystudios.com inbox (1 user, ~$4/mo,
  aliases free). Resend stays live until SES is verified + the sender lib
  is switched (small commit: src/lib/email.ts → SES).

APP STORE READINESS (beyond TestFlight — add before public release):
  - Guideline 5.1.1(v): in-app "Delete account" for self-serve accounts —
    not built yet. Required.
  - Guideline 4.2 (minimum functionality): a pure WebView wrapper risks
    rejection. Mitigate with native touches that Phase B wants anyway —
    push notifications (APNs), native share sheet for the promo kit,
    biometric unlock, deep links.
  - Privacy policy URL + support URL + App Privacy answers — part of the
    legal pack (FROST).
  - Payments for physical crew services via Stripe are allowed outside
    IAP (3.1.3); no third-party social login, so Sign in with Apple is
    not required.
  - TestFlight: internal testers immediate; external testers (clients)
    need Beta App Review on the first build (typically 1–2 days).
  - Clients and talent do NOT need TestFlight at all — the PWA at
    app.rowlystudios.com works on their phones today. TestFlight is for
    Rowly's own iOS view.

TESTFLIGHT STATUS (verified on expo.dev, 11 Oct 11:20 PT): EAS project
  @rowlyinla/rs-app EXISTS (created by the guarded block) but has ZERO
  builds. @rowlyinla/BABY-LIGHT has "iOS App Store build 1.0.0 (1),
  succeeded ~12h ago" — that is LUMADOODLE. Any TestFlight email received
  so far is Lumadoodle's, not RS App's. RS App has not been built yet.

REMAINING — Rowly's secure terminal block (keys never in chat). This is
the complete block; it is idempotent and safe to re-run:

```bash
cat > /tmp/rs-round-a.sh <<'RSEOF'
#!/bin/bash
set -e
WRAP="$(find ~/Desktop ~/Documents ~/Developer ~/Downloads -maxdepth 5 -type d -path '*rowly-studios-app/ios-wrapper' 2>/dev/null | head -1)"
if [ -z "$WRAP" ]; then
  git clone https://github.com/rowlystudios-lgtm/rowly-studios-app ~/Desktop/rowly-studios-app
  WRAP=~/Desktop/rowly-studios-app/ios-wrapper
fi
REPO="$WRAP/.."; git -C "$REPO" pull --ff-only || true
cd "$WRAP"
node -e 'const a=require("./app.json").expo; if(a.slug!=="rs-app"||a.ios.bundleIdentifier!=="com.rowlystudios.rsapp"){console.error("✗ not the RS App wrapper");process.exit(1)}; console.log("✓ RS App wrapper:",a.slug,a.ios.bundleIdentifier)'
echo "── PART 1 · RS App TestFlight (project @rowlyinla/rs-app — say YES if asked to create it) ──"
npm ci --no-audit --no-fund
npx -y eas-cli@latest whoami || npx -y eas-cli@latest login
npx -y eas-cli@latest build --platform ios --profile production --auto-submit
cd "$REPO"
echo "── PART 2 · Stripe TEST-mode: rotate the exposed key + subscribe the webhook ──"
echo "Stripe Dashboard (TEST mode): Developers → API keys → Secret key → Roll key → copy sk_test_…"
echo "Developers → Webhooks → endpoint https://app.rowlystudios.com/api/stripe/webhook with events:"
echo "checkout.session.completed, invoice.payment_succeeded, invoice.payment_failed, invoice.voided,"
echo "invoice.marked_uncollectible, account.updated, transfer.created → copy Signing secret whsec_…"
read -p "Press Enter when both are copied… "
read -rs -p "NEW Stripe TEST secret key (hidden): " SK; echo
case "$SK" in sk_test_*) echo "✓ test-mode key";; sk_live_*) echo "✗ LIVE key — this part is test-mode only"; exit 1;; *) echo "✗ not a Stripe secret key"; exit 1;; esac
read -rs -p "Webhook signing secret (hidden): " WH; echo
case "$WH" in whsec_*) echo "✓ signing secret";; *) echo "✗ not whsec_"; exit 1;; esac
npx -y vercel@latest whoami || npx -y vercel@latest login
npx -y vercel@latest link --yes --scope rowlyinla-8449s-projects --project rowly-studios-app
for N in STRIPE_SECRET_KEY STRIPE_WEBHOOK_SECRET; do npx -y vercel@latest env rm "$N" production --yes >/dev/null 2>&1 || true; done
printf '%s' "$SK" | npx -y vercel@latest env add STRIPE_SECRET_KEY production
printf '%s' "$WH" | npx -y vercel@latest env add STRIPE_WEBHOOK_SECRET production
unset SK WH
git commit --allow-empty -m "chore: redeploy with rotated Stripe keys" && git push || echo "⚠ push needs GitHub auth — ask Claude to trigger the redeploy"
echo "✓ Done. TestFlight processes in App Store Connect (~10 min after upload); open the TestFlight app → RS App."
RSEOF
bash /tmp/rs-round-a.sh
```

  Then: Round A2 (email on Amazon) → Round A3 (Stripe live flip) → legal pack
  with FROST (LEGAL-PACK-BRIEF.md) — before real client money.

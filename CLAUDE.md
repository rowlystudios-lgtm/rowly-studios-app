# RS App — standing session rules (read first, every session)

RS App is Rowly Studios Inc.'s talent booking platform: Next.js 14 App Router PWA on
Vercel (https://app.rowlystudios.com), Supabase `vmsgainaazabertluxbo` (RLS on),
Stripe Connect (15% platform fee), email via Amazon SES (Resend fallback), an Expo
WebView iOS wrapper in `ios-wrapper/`. The founder/admin is Rowly Dennis
(rowlystudios@gmail.com). He is the only admin, and admin is a desktop-web-only surface.

## Source of truth
- `handoff/RS-APP-FRAMEWORK.md` — the operating framework: state, decisions, pre-mortem,
  automation playbook, cold-start plan, gates. Read it before planning anything.
- `handoff/README.md` — the round index: which round is next and how to run one.
- `handoff/ROUND-*.md` — one file per build round. Each is a complete, self-contained
  spec: goal, done-criteria, exact steps, verification, and what is Rowly's to do.
- Chat history is NOT a source of requirements. If a round file and the code disagree,
  stop and write `CONFLICT FOUND: <what>` for Rowly's decision. Never resolve silently.

## How Rowly works with Claude (binding)
- One round = one pasteable terminal block for his parts, ending in a deployed build
  (Vercel) and/or a TestFlight (EAS). No multi-stage approvals, no drip of questions.
- Secrets NEVER appear in chat or in files. His blocks use hidden-input prompts
  (`read -rs`), verify the value's shape/mode (sk_live_ vs sk_test_, whsec_, etc.)
  before saving, and save only to Vercel env / EAS secrets.
- Do as much as possible yourself through connectors (Supabase, Vercel, GitHub,
  Chrome); give him precise step-by-step instructions only for what you cannot do.
- Approval is required only for: money leaving, outbound sends to real people,
  production deploys / DB writes, legal commitments. Reads, drafts, docs, code on a
  branch proceed autonomously. A docs-only push to `main` is a deploy — say so.
- Have confidence in decisions already made; do not relitigate them mid-build.
- Log every round's outcome (including mistakes) in that round file's EXECUTION LOG.

## Engineering rules
- Typecheck with `npx tsc --noEmit` before every commit (no typecheck script exists).
  `npm run build` needs Google Fonts network access; a sandbox font-fetch failure is
  not a code failure — Vercel builds fine.
- Supabase migrations: apply ONE statement group at a time. `ALTER PUBLICATION`
  inside a batch silently rolls the whole batch back. Save every applied migration
  to `supabase/migrations/YYYYMMDD_<name>.sql`.
- Supabase PostgREST embeds from `job_bookings` to `profiles` must name the FK:
  `profiles!job_bookings_talent_id_fkey(...)`. `talent_profiles` cannot be embedded
  from `job_bookings` (no direct FK) — query it separately with `.in('id', ids)`.
- Crons live in `vercel.json`; the plan allows daily crons only (Hobby). Every cron
  route checks `CRON_SECRET`. `/api/cron/daily-ops` is the money-path keeper.
- `/api/notifications` is secret-only. `createAccount` can never mint an admin and
  talent signup requires a valid welcome invite. Keep it that way.
- The iOS wrapper sends User-Agent `RSAppiOS`; middleware refuses `/admin` for it.
- Rate floor is $300/day everywhere (DB constraints `talent_day_rate_min`,
  `talent_rate_floor_min`; sliders 300–1500 step 25). 15% fee is never shown in
  client UI.
- EAS builds run from `ios-wrapper/` ONLY. Project `@rowlyinla/rs-app`, bundle
  `com.rowlystudios.rsapp`, Apple team QQ2URK7777. Refuse to build if `app.json`
  says anything else (see `handoff/ROUND-A-PRODUCTION-HARDENING.md`).

## Settled — do not reopen
15% fee hidden from clients · email-only notifications (no SMS) · website application
is the talent gate; invite email = pre-approval · "Rowly Studios Approved" vetting
brand · verticals: production + post crew, Beauty & Style · rate floor $300 ·
email on Amazon (SES + WorkMail) · paid talent tier only after Gate 3 and never for
job access or ranking · admin is one person, website-only.

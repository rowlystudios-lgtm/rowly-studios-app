# ROUND B — Seed supply (promo kit, brief intake, scorecard, App Store readiness)

GOAL: give the Founding 25 a reason to join and a tool that markets them — and make the
iOS app good enough for the public App Store. Every feature here attacks a named
pre-mortem risk; do not add anything that doesn't.

DONE WHEN (= **Gate 2**): 25 approved talent profiles, 15 Stripe-connected (live),
every profile has a reel, rates and availability, the promo kit renders and shares,
and an RS App build has passed App Store review (or is in review with no 4.2/5.1.1
findings).

CONTEXT: read `RS-APP-FRAMEWORK.md` §6–§7 first. Existing building blocks: profiles
already have `share_code` (8-char uppercase, unique), talent profiles have a showreel
URL field, availability calendar, rate floor, department, "Rowly Studios Approved"
verification flag (`profiles.verified`). Branded email template:
`src/lib/emails/template.ts`. Admin lives under `src/app/admin/*`; talent/client app
under `src/app/app/*`.

---

## B1 — Talent promo kit (pre-mortem #2 cold start; powers the flywheel)   **[Claude]**

### Data
- Migration: `talent_profiles.reel_url text` (if the existing showreel column is not
  already a URL, add this and migrate values), `talent_profiles.reel_provider text`
  (`vimeo|youtube|other`, derived), `talent_profiles.promo_kit_rendered_at timestamptz`.
- `profiles.share_code` is the public handle. Public route: `/t/[share_code]`.

### Public booking page — `/t/[share_code]`   (server component, no auth)
- Shows: name, role/department, city, "Rowly Studios Approved" badge if
  `profiles.verified`, embedded reel (Vimeo/YouTube iframe from `reel_url`), day-rate
  band ("from $X/day" using `rate_floor_cents`), next 30 days availability strip.
- **Book now** → `/login?mode=create&role=client&ref=<share_code>` for new clients;
  signed-in clients go straight to `/app/post-job?talent=<id>`. Persist `ref` on the
  client profile (`client_profiles.referred_by_share_code`) — this is how "first
  client via a talent's link" and Gate 4 self-serve % are measured.
- Open Graph tags: title "Book <name> — Rowly Studios Approved", image = the 4×5 card.
- Never shows the 15% or any rate math. Never shows email/phone (anti-leakage).

### Share card renderer — `/api/promo/[share_code]/card?format=4x5|9x16`
- Server-rendered PNG via `@vercel/og` (`ImageResponse`), 1080×1350 and 1080×1920.
- Layout: reel frame (Vimeo/YouTube thumbnail via oEmbed: `https://vimeo.com/api/oembed.json?url=` / `https://www.youtube.com/oembed?url=`), name, role,
  Approved badge, "Book now" pill with the short URL `app.rowlystudios.com/t/<code>`
  and a QR (use `qrcode` package, SVG → embed). Brand: navy #496275 / cream #FBF5E4.
- Cache 1 h; bust on profile save.

### Share UI — talent profile page (`/app/profile`)
- "Promote yourself" section: preview of both cards, buttons **Share to Instagram**,
  **Share to TikTok**, **Download**, **Copy link**. On iOS/mobile use the Web Share API
  (`navigator.share({ files })`) which hands the image to the native share sheet
  (counts as native functionality for App Store 4.2). Fallback: download.
- Copy under it: "Your link always shows your latest reel. Put it in your bio and
  your email signature." Link sticker instructions for Stories.
- UTM: every link carries `?utm_source=talent&utm_medium=<ig|tt|copy>&utm_campaign=<share_code>`;
  log hits in a new table `link_clicks(share_code, utm_medium, ua, created_at)`.

### Verification
- Two real profiles (Rowly, Claudia) render both cards; a brand-new client created
  via Claudia's link shows `referred_by_share_code`.

## B2 — Brief intake pipeline (pre-mortem #5 bandwidth)   **[Claude]**
- Public page `/brief` (no auth): what, when, where, how many crew, budget band,
  contact. Writes `client_briefs` (RLS: insert anon, read admin). Confirmation email
  via SES: "Crewed in 24 hours."
- Auto-shortlist: on insert, a server action builds `brief_shortlists` — talent
  matching department + available on the dates + rate floor ≤ budget/crew count —
  ranked by completed bookings then verified. Admin sees the brief + shortlist on
  `/admin/briefs` with one-tap **Create job from brief** (prefills the job form and
  the offers). Rowly approves; nothing is sent to talent automatically.
- Monday digest: covered by `agents/monday-scorecard.md` (Managed Agents).

## B3 — Monday scorecard (one metric)   **[Claude]**
- SQL view `v_weekly_scorecard`: completed bookings (wrapped jobs), rebook rate
  (clients with ≥2 wrapped jobs / clients with ≥1), median offer→confirm hours,
  payouts released, invoices paid/outstanding, new approved talent, link clicks.
- Emailed every Monday 07:00 PT by the `daily-ops` cron (extend it: on Monday, query
  the view and include it) — or by the Managed Agent once deployed.

## B4 — App Store readiness   **[Claude]**
- **Account deletion (Guideline 5.1.1(v))**: `/app/profile` → "Delete my account" →
  confirm sheet → server action: anonymise `profiles` (email → `deleted+<id>@…`,
  names cleared), cancel open bookings, keep financial rows for records, then
  `auth.admin.deleteUser`. Clients and talent both. Document the data-retention line
  for the privacy policy.
- **Native touches (Guideline 4.2)** in `ios-wrapper/`:
  - Push notifications: `expo-notifications`; register the device token with
    `POST /api/push/register` (new table `push_tokens`); `sendNotification()` in
    `src/lib/notifications.ts` fans out to Expo Push for in-app events (offers,
    confirmations, chat, invoice paid). Email stays the system of record.
  - Native share sheet for the promo kit (B1 uses Web Share; inside the WebView,
    bridge `window.ReactNativeWebView.postMessage({type:'share', url})` → Expo `Sharing`).
  - Biometric unlock: `expo-local-authentication` gate on app foreground when a
    session cookie exists.
  - Deep links: `rsapp://t/<code>` and universal links for `app.rowlystudios.com/t/*`
    (apple-app-site-association served from `public/.well-known/`).
- **Listing**: privacy policy URL + support URL (`hello@rowlystudios.com`), App
  Privacy answers (contact info, financial info via Stripe, user content), screenshots
  from the real app on iPhone 15 Pro + 8.3" iPad not required (`supportsTablet: false`).
- **Review notes**: "Talent booking platform for Rowly Studios' vetted crew. Payments
  for physical services are processed by Stripe outside IAP (3.1.3(e)). Test login:
  <a dedicated reviewer client account Rowly creates>."

## B5 — Founding 25 outreach (not code)   **[Rowly, Claude drafts]**
- Claude drafts the one-to-one ask (email + DM variants) from
  `RS-APP-FRAMEWORK.md` §6 with the offer (Approved status, 0% fee on first three
  bookings, featured placement, free booking page). Rowly sends. Track in
  `/admin/applications`.

---

## ORDER OF WORK
B4 account deletion → B1 → B4 native touches → new TestFlight → B2 → B3 → submit
for App Store review → B5 runs in parallel from the day B1 ships.

## EXECUTION LOG
- 11 Oct 2026 — Round written. Not started. Prerequisite: Gate 1.

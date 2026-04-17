# Rowly Studios App 

Talent and client activity center. Next.js 14 + Supabase + Vercel PWA.

## Week 1 Day 1 — what's in this drop

- Next.js 14 App Router scaffolding
- Supabase SSR auth with magic-link sign-in
- Complete database schema with row-level security (ready for future Notion sync)
- PWA manifest + installable icons
- Rowly Studios brand palette baked into Tailwind
- Landing page, login flow, protected `/app` home

## One-time local setup (~15 min)

### 1. Clone and install

```bash
cd ~  # or wherever you keep projects
git clone https://github.com/rowlystudios-lgtm/rowly-studios-app.git
cd rowly-studios-app

# Copy all files from /home/claude/rowly-app/ into this folder
# (I'll hand them over as a zip — see the end of this message)

npm install
```

### 2. Create your local env file

```bash
cp .env.local.example .env.local
```

Open `.env.local` and confirm it has your Supabase URL and key (already pre-filled).

### 3. Run locally

```bash
npm run dev
```

Open http://localhost:3000 — you should see the Rowly Studios landing page with your logo.

## Supabase setup (~10 min, do this once)

### 1. Run the schema

1. Go to https://supabase.com/dashboard → your "Rowly Studios App" project
2. Left sidebar → **SQL Editor** → **New query**
3. Open `supabase/schema.sql` from this repo, copy the whole file
4. Paste into the SQL Editor → click **Run** (bottom right)
5. You should see "Success. No rows returned."

### 2. Configure auth redirects

1. Left sidebar → **Authentication** → **URL Configuration**
2. **Site URL**: `https://app-staging.rowlystudios.com` (we'll deploy to this in a sec)
3. **Redirect URLs** — add both of these:
   - `http://localhost:3000/auth/callback`
   - `https://app-staging.rowlystudios.com/auth/callback`
4. Click **Save**

### 3. Customize the magic-link email (optional but recommended)

1. Left sidebar → **Authentication** → **Email Templates** → **Magic Link**
2. Replace the subject with: `Sign in to Rowly Studios`
3. In the body, replace "Confirm your mail" with "Sign in to Rowly Studios"
4. Click **Save**

### 4. Promote yourself to admin

After you sign in for the first time, run this in SQL Editor (replace the email):

```sql
update public.profiles
set role = 'admin', verified = true, verified_at = now()
where email = 'rowlystudios@gmail.com';
```

## Deploy to Vercel (~10 min)

### 1. Push to GitHub

```bash
git add .
git commit -m "Week 1 Day 1: scaffolding, auth, schema"
git push origin main
```

### 2. Import to Vercel

1. Go to https://vercel.com/new
2. Import `rowlystudios-lgtm/rowly-studios-app`
3. **Framework Preset**: Next.js (auto-detected)
4. **Environment Variables** — add both:
   - `NEXT_PUBLIC_SUPABASE_URL` = `https://vmsgainaazabertluxbo.supabase.co`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = `sb_publishable_jYd5p12j08kSfaj2d5oJqg_iGR4LtCw`
5. Click **Deploy**. Takes ~2 minutes.

### 3. Connect your custom subdomain

**In Vercel:**
1. Project → **Settings** → **Domains**
2. Add `app-staging.rowlystudios.com` → click Add
3. Vercel shows you a CNAME record — copy it (it'll be something like `cname.vercel-dns.com`)

**In GoDaddy:**
1. Log in to GoDaddy → **My Products** → find `rowlystudios.com` → **DNS**
2. Click **Add New Record** → type `CNAME`
3. **Name**: `app-staging`
4. **Value**: paste what Vercel gave you (usually `cname.vercel-dns.com`)
5. **TTL**: 1 hour
6. Click **Save**

DNS propagates in 5–30 minutes. When done, Vercel will show a green checkmark next to your domain.

### 4. Install on your phone

1. On your iPhone, open Safari → navigate to `https://app-staging.rowlystudios.com`
2. Tap the share button → **Add to Home Screen**
3. The RS logo appears on your home screen like a native app
4. Tap it — fullscreen, no browser chrome, feels real

## What to test on Day 1

- [ ] Landing page loads with Rowly Studios logo + Blue Fusion background
- [ ] Tap "Sign in" → magic link form appears
- [ ] Enter your email → receive the magic link email from Supabase
- [ ] Tap the link on your phone → redirects you to `/app` → you see your email address
- [ ] Open Supabase dashboard → **Authentication** → **Users** → your record is there
- [ ] Open Supabase dashboard → **Table Editor** → `profiles` → your profile auto-created
- [ ] Tap "Sign out" → returns to landing page

## Troubleshooting

**"Invalid login credentials" or magic link doesn't work**
Double-check Supabase → Authentication → URL Configuration has both redirect URLs listed.

**Icon doesn't appear when installing to home screen**
Clear Safari cache or try a different browser. The PNG files are at `/public/icon-*.png`.

**DNS not resolving after 30 min**
Run `dig app-staging.rowlystudios.com` in terminal. If no answer, the CNAME record didn't save — try again in GoDaddy.

## What lands on Day 2

- Talent profile editor — real form that saves to `talent_profiles` table
- Availability calendar — the real version of the prototype
- Admin view of all submissions awaiting verification

## Architecture notes for the future

Every table has `notion_page_id` and `external_synced_at` columns. When we build the Notion two-way sync in Phase 2, the mapping is already in place — no migrations needed.

Row-level security means even if someone gets your publishable anon key (which is fine, it's designed to be public), they can only see data the policies allow for their role. Your actual data protection lives in the SQL policies, not the key.

# ROUND A2 — Email on Amazon (SES for the app, WorkMail for hello@)

GOAL: every RS App email leaves from `@rowlystudios.com` through Amazon SES, with its
own SES identity and configuration set so it is separated from Yummy Wellness; and
`hello@rowlystudios.com` is a real Amazon WorkMail inbox Rowly reads and replies from.

DONE WHEN:
- `rowlystudios.com` shows **Verified** in SES, configuration set `rs-app` exists,
  and the SES account is **out of the sandbox** (production access) in that region.
- Vercel production has `AWS_SES_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`,
  `SES_CONFIGURATION_SET=rs-app`, `EMAIL_FROM`, `EMAIL_REPLY_TO`; a test email from
  the app arrives from `notifications@rowlystudios.com`.
- `hello@rowlystudios.com` sends and receives (WorkMail web client works).
- `/api/cron/daily-ops` reports `emailProvider: "ses"` with no email problems.

CODE STATE: `src/lib/email.ts` already supports SES (shipped 11 Oct). It picks SES when
`AWS_SES_REGION` is set, else Resend. Nothing changes until the env vars exist.

DNS FACTS (checked 11 Oct 2026): rowlystudios.com nameservers are GoDaddy
(`ns39/ns40.domaincontrol.com`), and the domain has **no MX records today** — every
record below is an addition, nothing existing can break. Yummy's mail is Google
Workspace (`aspmx.l.google.com`) on a different domain — untouched.

SES FREE TIER: ~3,000 message-charges/month free for the first 12 months, then about
$0.10 per 1,000 — **per AWS account**, not per app. Separation between apps is by
identity (domain) and configuration set, not by billing.

---

## STEPS

### 1. SES — add the RS App identity   **[Rowly, in the AWS console — ~5 min]**
Claude's Chrome session cannot get past the AWS "Choose AWS sessions" selector, so
this is done by hand. Use the same AWS account + region Yummy's SES lives in
(check `SES → Identities` in us-west-2 and us-east-1; use whichever lists Yummy).

1. SES → **Identities → Create identity** → *Domain* → `rowlystudios.com`.
   - Leave "Use a custom MAIL FROM domain" unchecked for now.
   - Easy DKIM, RSA_2048, "Publish DNS records to Route 53" **unchecked** (DNS is at
     GoDaddy). Create.
2. On the identity page, copy the **3 DKIM CNAME records** (name + value each).
3. SES → **Configuration sets → Create set** → name `rs-app`, defaults otherwise.
   (Yummy keeps its own set; never share one.)
4. SES → **Account dashboard**: if it says *Sandbox*, click **Request production
   access** — use case: transactional booking/invoice notifications for a talent
   booking platform, ~500 emails/month, website https://app.rowlystudios.com,
   bounce/complaint handling via SES notifications. Usually approved within 24 h.
   (If Yummy already took this account out of the sandbox in this region, nothing
   to do — it is account-wide.)

### 2. WorkMail — the hello@ inbox   **[Rowly, AWS console — ~5 min + password]**
WorkMail is only in us-east-1, us-west-2 and eu-west-1; pick **us-west-2**.
1. WorkMail → **Organizations → Create organization** → *Quick setup*, alias
   `rowlystudios` (gives `rowlystudios.awsapps.com/mail` as the web client). Create;
   wait for *Active* (a few minutes).
2. Open the organization → **Domains → Add domain** → `rowlystudios.com`. The page
   lists the records to add at GoDaddy: **MX**, **autodiscover CNAME**, **SPF TXT**,
   **3 DKIM CNAMEs**, **DMARC TXT**. Keep it open.
3. **Users → Add user** → username `hello`, display name `Rowly Studios`, primary
   email `hello@rowlystudios.com`. Set the password yourself (never in chat).
   Billing: 1 user ≈ $4/month after the 30-day trial. Add free aliases later
   (bookings@, press@) under the user's *Email addresses*.
4. Once DNS (step 3) propagates, set `rowlystudios.com` as the **default domain**.

### 3. GoDaddy DNS   **[Rowly, GoDaddy → DNS for rowlystudios.com — ~10 min]**
Add exactly these (host names are *relative*; GoDaddy adds the domain itself):

| Type | Host | Value | Notes |
| --- | --- | --- | --- |
| MX | `@` | `inbound-smtp.us-west-2.amazonaws.com` | priority **10** (WorkMail) |
| CNAME | `autodiscover` | `autodiscover.mail.us-west-2.awsapps.com` | WorkMail clients |
| TXT | `@` | `v=spf1 include:amazonses.com ~all` | one SPF record only — if a `v=spf1` TXT already exists, merge, don't add a second |
| TXT | `_dmarc` | `v=DMARC1; p=quarantine; pct=100; fo=1; rua=mailto:hello@rowlystudios.com` | add after hello@ exists |
| CNAME ×3 | *(from SES identity page)* | *(from SES identity page)* | SES Easy DKIM for the app |
| CNAME ×3 | *(from WorkMail domain page)* | *(from WorkMail domain page)* | WorkMail DKIM |

Both SES and WorkMail use `include:amazonses.com`, so one SPF covers both.
Do NOT add any `send.` subdomain records (that was the Resend plan — retired).

### 4. Verify   **[Claude]**
Run from any shell (public DNS, no auth needed):
```bash
for q in "rowlystudios.com MX" "rowlystudios.com TXT" "_dmarc.rowlystudios.com TXT" "autodiscover.rowlystudios.com CNAME"; do
  set -- $q; echo "== $1 $2"; curl -s "https://dns.google/resolve?name=$1&type=$2" | python3 -c 'import sys,json; [print(a["data"]) for a in json.load(sys.stdin).get("Answer",[])]'
done
```
Then in the console: SES identity → **Verified**; WorkMail domain → **Verified**.

### 5. App credentials + Vercel env   **[Rowly — secure terminal block]**
Claude writes this block; Rowly runs it. It must:
1. Prompt (hidden) for an IAM access key pair created for a user `rs-app-ses`
   with ONLY the policy `AmazonSESFullAccess` scoped to the account (IAM → Users →
   Create user → attach policy → Security credentials → Create access key →
   *Application running outside AWS*). Verify `AKIA` prefix before saving.
2. Save to Vercel production: `AWS_SES_REGION=<region>`, `AWS_ACCESS_KEY_ID`,
   `AWS_SECRET_ACCESS_KEY`, `SES_CONFIGURATION_SET=rs-app`,
   `EMAIL_FROM="Rowly Studios <notifications@rowlystudios.com>"`,
   `EMAIL_REPLY_TO=hello@rowlystudios.com`.
3. Trigger a redeploy (empty commit) and `curl` the smoke test:
   `curl -s -H "Authorization: Bearer $CRON_SECRET" https://app.rowlystudios.com/api/cron/daily-ops`
   must show `"emailProvider":"ses"` and no `email:` problems.
Block skeleton (same pattern as Round A):
```bash
read -rs -p "AWS access key ID (hidden): " AK; echo; case "$AK" in AKIA*) echo "✓ access key id";; *) echo "✗ not an AKIA key"; exit 1;; esac
read -rs -p "AWS secret access key (hidden): " SK; echo; [ ${#SK} -ge 30 ] && echo "✓ secret length ok" || { echo "✗ too short"; exit 1; }
npx -y vercel@latest whoami || npx -y vercel@latest login
npx -y vercel@latest link --yes --scope rowlyinla-8449s-projects --project rowly-studios-app
printf '%s' "us-west-2"                                   | npx -y vercel@latest env add AWS_SES_REGION production
printf '%s' "$AK"                                         | npx -y vercel@latest env add AWS_ACCESS_KEY_ID production
printf '%s' "$SK"                                         | npx -y vercel@latest env add AWS_SECRET_ACCESS_KEY production
printf '%s' "rs-app"                                      | npx -y vercel@latest env add SES_CONFIGURATION_SET production
printf '%s' "Rowly Studios <notifications@rowlystudios.com>" | npx -y vercel@latest env add EMAIL_FROM production
printf '%s' "hello@rowlystudios.com"                      | npx -y vercel@latest env add EMAIL_REPLY_TO production
unset AK SK
git commit --allow-empty -m "chore: switch email to SES" && git push
```
(Adjust `us-west-2` if SES lives in us-east-1.)

### 6. Retire the old paths   **[Claude]**
- Leave `RESEND_API_KEY` in place for one week as the fallback, then remove it.
- Gmail OAuth drafts: keep as a nice-to-have on the admin job card; nothing
  load-bearing may depend on it (pre-mortem #7).

---

## EXECUTION LOG
- 11 Oct 2026 — Decision: Amazon for everything (SES + WorkMail). `src/lib/email.ts`
  made provider-switchable (SES v2 raw MIME, attachments supported; Resend fallback).
  Chrome automation stopped at AWS's session selector; steps 1–3 handed to Rowly
  as instructions above. DNS verified empty of MX beforehand.

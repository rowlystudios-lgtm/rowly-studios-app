# ROUND A3 — Stripe live flip → Gate 1

GOAL: real money moves. A live-mode client payment lands, 15% stays with Rowly
Studios, talent is paid out after the hold, and nothing in the path depends on a
person remembering to do something.

DONE WHEN (= **Gate 1**): one live booking → wrapped → auto-invoice → client pays via
the Stripe button → webhook marks it paid → `/api/cron/daily-ops` releases the talent
transfer after the hold → talent sees the money. Zero manual steps, zero incidents.

PRE-CONDITIONS (all must be true first):
- Round A code live (it is, since 11 Oct) and the Round A **Part 2** block run: test
  key rotated, `checkout.session.completed` subscribed in TEST mode and proven.
- Round A2 done: emails leave from rowlystudios.com (clients will see the invoice).
- Legal pack live in-product (`LEGAL-PACK-BRIEF.md`): booking terms + cancellation
  tiers accepted at booking, talent agreement accepted at onboarding. Do not take
  real client money without this. This is pre-mortem #4.

WHAT FLIPPING LIVE RESETS (plan for it): Stripe test and live are separate worlds.
Every talent must redo Connect onboarding in live mode; every client must re-add a
payment method in live mode; the live webhook endpoint is a new endpoint with a new
signing secret. The DB rows that hold test IDs (`talent_profiles.stripe_account_id`,
`client_profiles.stripe_customer_id`, `stripe_default_payment_method_id`) must be
cleared so the app re-onboards everyone cleanly.

---

## STEPS

### 1. Dry run in TEST mode end to end   **[Claude + Rowly]**
Use the real accounts (rowlystudios@gmail.com admin, rowlydennisphoto@gmail.com
talent, mankindofabigdeal@gmail.com client — never synthetic data):
1. Client posts a job → admin offers → talent confirms → admin **Wrap job**.
2. Confirm an invoice row appeared automatically (`invoices.job_id = job`, status
   draft, `stripe_payment_link_url` set) — this is the 11 Oct auto-invoice.
3. Pay it with a Stripe test card/bank from the Checkout link → confirm the webhook
   flipped `invoices.status='paid'` and `talent_payments.stripe_status='pending_release'`.
4. Set `admin_settings.stripe_talent_transfer_hold_days` to `0` temporarily, hit
   `/api/cron/daily-ops` with the cron secret → confirm `talentTransfersReleased ≥ 1`
   and `talent_payments.stripe_status='paid'`. Restore the hold to 5.
Anything that fails here is fixed before step 2. Log it.

### 2. Clear test-mode Stripe IDs   **[Claude — Supabase, after Rowly's OK: DB write]**
```sql
update public.talent_profiles set stripe_account_id = null, stripe_account_status = 'not_connected';
update public.client_profiles set stripe_customer_id = null, stripe_default_payment_method_id = null,
  stripe_default_payment_method_type = null, stripe_default_payment_method_last4 = null,
  stripe_default_payment_method_brand = null;
```
(Only after the live keys are in Vercel — otherwise the app re-onboards into test.)

### 3. Live keys + webhook   **[Rowly — secure terminal block, same pattern as Round A]**
In the Stripe Dashboard, **LIVE mode**:
1. Developers → API keys → copy the live **Secret key** (`sk_live_…`) and the live
   **Publishable key** (`pk_live_…`).
2. Developers → Webhooks → **Add endpoint**
   `https://app.rowlystudios.com/api/stripe/webhook` with events:
   `checkout.session.completed, invoice.payment_succeeded, invoice.payment_failed,
   invoice.voided, invoice.marked_uncollectible, account.updated, transfer.created`
   → copy the **Signing secret** (`whsec_…`).
3. Settings → Connect: confirm the platform profile is complete and Express accounts
   are enabled (it is in test; live needs the business details completed once).
The block must verify `sk_live_` / `pk_live_` / `whsec_` prefixes (refuse test keys),
write `STRIPE_SECRET_KEY`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET`
to Vercel production, set `STRIPE_TEST_IN_PROD_INTENTIONAL` to empty/removed, and
redeploy. `src/lib/stripe/client.ts` throws on mixed modes, so a mismatch fails loud.

### 4. Re-onboard   **[Rowly + the people on the first live job]**
- Rowly and Claudia: open the app → Stripe step → complete live Express onboarding
  (bank account, identity). `talent_profiles.stripe_account_status` → `active` via
  the `account.updated` webhook.
- First live client: add a payment method (ACH preferred — the invoice math adds the
  ACH processing fee; card is also accepted).

### 5. First live booking   **[Rowly]**
Run a real (small) job — ideally a Rowly Studios production day crewed with Rowly +
Claudia — through the exact flow in step 1, in live mode. Watch `/api/cron/daily-ops`
the next morning: it should report the transfer release and no problems.

### 6. Gate 1 review   **[Claude]**
Append the result to this log. If any step needed a human hand that the framework
says should be automatic, that is a Round B item — write it there.

---

## EXECUTION LOG
- 11 Oct 2026 — Round written. Not started: Round A Part 2 (test key rotation +
  webhook subscription) still pending on Rowly's Mac.

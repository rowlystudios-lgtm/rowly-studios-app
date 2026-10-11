# ROUND C — Concierge (own shoots on-app, first outside clients) → Gate 3

GOAL: prove the loop with real money and real clients while Rowly still matches by
hand. "Send the brief; crewed in 24 hours; one invoice."

DONE WHEN (= **Gate 3**): 10 paid bookings through the app, 3+ rebookings, at least
one client who arrived via a talent's link, zero payment incidents, no shoot needed
a human step the framework says is automatic.

RULES: every Rowly Studios production (FROST shoots, all Yummy Wellness and Lumadoodle
shoots and marketing days) is crewed and invoiced through RS App — no exceptions.
Weekly cap on concierge briefs (start at 3/week) so the app, not Rowly, absorbs
growth (pre-mortem #5).

---

## C1 — Rebook nudge (pre-mortem #1 leakage)   **[Claude]**
- 7 days after a job wraps, email the client a one-tap **Book them again** (deep
  link to `/app/post-job?rebook=<jobId>` which prefills crew + settings). Quiet-quarter
  re-prompt at 90 days. Implemented in `/api/cron/daily-ops` (idempotent:
  `jobs.rebook_nudged_at`). Copy: service, not sales.
- Reviews: after wrap, client rates each talent (1–5 + one line) → `reviews` table,
  shown on `/t/<code>` as "Rowly Studios clients rate ★ 4.9". Reviews only accrue
  on-platform — the quiet reason to stay.

## C2 — Backup-talent protocol (pre-mortem #3)   **[Claude + Rowly]**
- Admin can mark 1 backup per role on a job (`job_bookings.is_backup`). Backups get a
  "hold" email, released automatically at call time −24 h if unused.
- Escalation (already in `talent-nudge`): call unconfirmed at −48 h → admin alert +
  the backup list surfaced on the job card.

## C3 — Evidence pack (pre-mortem #6)   **[Claude]**
- On `charge.dispute.created` (add to the webhook list) → assemble chat log, call
  sheet, confirmations, invoice HTML into one PDF (`@sparticuz/chromium` is already a
  dependency) → store in Supabase Storage `disputes/` → email admin with the link.

## C4 — Case-study content (not code)   **[Rowly]**
- Every concierge booking becomes a post for THE WORK / THE CRAFT franchises. Claude
  drafts from the job record on request.

## EXECUTION LOG
- 11 Oct 2026 — Round written. Not started. Prerequisite: Gate 2.

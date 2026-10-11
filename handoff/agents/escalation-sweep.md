---
name: RS App — escalation sweep
agent: <agent_id>
environment_id: <env_id>
schedule:
  type: cron
  expression: "30 6 * * *"
  timezone: America/Los_Angeles
budget:
  type: limit
  max_list_cost: { amount: "100", currency: "USD" }
---
Read-only sweep of `jobs` and `job_bookings` for pre-mortem #3 (a bad shoot):
- offers in `requested`/`negotiating` older than 48h,
- jobs with call time inside 48h that are not fully crewed or have any booking not
  `confirmed`,
- talent with 2+ declines or no-shows in 30 days.
For each, draft the nudge or the backup plan (who to call, in what order, from the
roster by department and availability) into `agent_proposals`, and email the admin a
ranked list. Send nothing to talent or clients yourself.

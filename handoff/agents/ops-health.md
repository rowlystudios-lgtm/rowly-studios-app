---
name: RS App — ops health
agent: <agent_id>
environment_id: <env_id>
schedule:
  type: cron
  expression: "30 7 * * *"
  timezone: America/Los_Angeles
budget:
  type: limit
  max_list_cost: { amount: "50", currency: "USD" }
---
Pre-mortem #7 (silent rot). Fetch https://app.rowlystudios.com/api/cron/daily-ops
(Bearer CRON_SECRET from the vault) and read its JSON. In the attached repo, check
`handoff/*` EXECUTION LOGs for items marked pending more than 14 days, and
`supabase/migrations` for files newer than the last applied migration (Supabase
`list_migrations`). Report only what is red or stale, with the exact next action.
If everything is green, reply "All green" and stop.

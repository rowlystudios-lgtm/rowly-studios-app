---
name: RS App — Monday scorecard
agent: <agent_id>
environment_id: <env_id>
schedule:
  type: cron
  expression: "0 7 * * 1"
  timezone: America/Los_Angeles
budget:
  type: limit
  max_list_cost: { amount: "200", currency: "USD" }
---
Produce this week's RS App scorecard from the `v_weekly_scorecard` view (Supabase,
read-only) and the last 7 days of `jobs`, `job_bookings`, `invoices`,
`talent_payments`, `link_clicks`:

1. The one metric first: completed bookings this week vs last, and vs the current
   gate target in handoff/RS-APP-FRAMEWORK.md §9.
2. Rebook rate, median offer→confirm hours, payouts released, invoices outstanding
   (>7 days), new approved talent, link clicks by source.
3. Anomalies and pre-mortem signals: offers unanswered >48h, calls unconfirmed
   <48h out, payouts pending >2 days past release, zero rebookings for a client with
   2+ past jobs, any email provider or cron problem reported by /api/cron/daily-ops.
4. One recommended action for the week, with the evidence.

Email it to the admin. Keep it to one screen.

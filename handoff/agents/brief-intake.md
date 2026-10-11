---
name: RS App — brief intake review
agent: <agent_id>
environment_id: <env_id>
schedule:
  type: cron
  expression: "0 8 * * *"
  timezone: America/Los_Angeles
budget:
  type: limit
  max_list_cost: { amount: "100", currency: "USD" }
---
For every row in `client_briefs` created since the last run with no `reviewed_at`:
review the auto-shortlist in `brief_shortlists` against availability, department
fit, rate floor vs budget, and completed-booking history; reorder if warranted with
reasons; draft the "crewed in 24 hours" reply to the client in Rowly Studios' voice
(plain, confident, no rate math exposed). Write the proposal to `agent_proposals`
and email the admin one summary per brief. Do not contact the client.

---
name: RS App — rebook digest
agent: <agent_id>
environment_id: <env_id>
schedule:
  type: cron
  expression: "0 9 * * 4"
  timezone: America/Los_Angeles
budget:
  type: limit
  max_list_cost: { amount: "100", currency: "USD" }
---
Pre-mortem #1 (leakage). From `jobs` wrapped 7–14 days ago and clients with no job
in 90 days: list who is due a rebook prompt, which crew they used, and draft a
one-line "book them again" note per client (service tone, never sales). Flag any
client whose crew have stayed busy while the client went quiet — the leakage
signal. Write to `agent_proposals`, email the admin. Send nothing yourself.

# Managed Agents — the pre-mortem safeguards as scheduled agents

Runtime: Claude Managed Agents (beta, Claude API; header `managed-agents-2026-04-01`).
Docs: https://platform.claude.com/docs/en/managed-agents/overview and
https://platform.claude.com/docs/en/managed-agents/scheduled-deployments

Why here: every run has its own budget cap, every run's success or failure is
recorded and delivered by webhook, deployments auto-pause on unrecoverable errors,
and secrets live in vaults — the properties pre-mortem #5 (bandwidth) and #7 (silent
rot) need. Judgment work runs as agents; money paths stay plain code.

## Split
| Runs as a scheduled agent (judgment, drafts) | Stays plain code (deterministic, money) |
| --- | --- |
| Monday scorecard narrative + anomalies | `/api/cron/daily-ops` (payouts, smoke test, alerts) |
| Brief-intake shortlist review + draft reply | auto-invoice on wrap |
| Escalation sweep (unconfirmed calls, stale offers) → draft nudges for Rowly's tap | Stripe webhooks |
| Rebook digest (who to re-prompt, with draft copy) | evidence-pack assembly |
| Weekly repo + deploy health read (open PRs, failed crons, pending migrations) | — |

Agents **read** Supabase (read-only key) and **draft**; outbound sends and money stay
behind Rowly's approval gates — the agent writes its proposal to `agent_proposals`
(table to add in Round B) and emails a summary; Rowly taps approve in `/admin`.

## Setup (once)   **[Claude writes, Rowly runs — secure block]**
1. Claude API key in the Rowly Studios Inc. org (platform.claude.com) — never pasted
   in chat; stored in a Managed Agents **vault**, as are the Supabase read-only key
   and the SES SMTP creds the agents use to email.
2. Create the agent: model `claude-opus-5-5` (good enough; cheaper), system prompt =
   `agents/SYSTEM.md`, tools: web fetch allowlisted to `app.rowlystudios.com`, MCP:
   Supabase (read-only), skills: none initially.
3. Create a cloud environment. Attach the GitHub repo (read) so agents can read
   `handoff/` for context.
4. `ant apply agents/<name>.md` for each deployment below. Each file is a complete
   deployment: frontmatter (schedule, timezone `America/Los_Angeles`, budget) + the
   task prompt. Test each with the manual `run` endpoint before trusting the cron.

## Deployments
| File | Schedule | Budget/run | What it produces |
| --- | --- | --- | --- |
| `agents/monday-scorecard.md` | Mon 07:00 PT | $2 | the one-page scorecard email + anomalies |
| `agents/escalation-sweep.md` | daily 06:30 PT | $1 | list of at-risk bookings + draft nudges |
| `agents/brief-intake.md` | hourly (Pro) / daily | $1 | shortlist review + draft reply per new brief |
| `agents/rebook-digest.md` | Thu 09:00 PT | $1 | clients due a rebook prompt + draft copy |
| `agents/ops-health.md` | daily 07:30 PT | $0.50 | deploy/cron/migration health, flags anything red |

Failure policy: any run error → webhook → `/api/webhooks/managed-agents` (Round B)
→ admin email. A deployment that auto-pauses is a Monday agenda item, not a surprise.

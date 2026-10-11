# handoff/ — the RS App build framework

Everything needed to take RS App from today's state to a public App Store launch,
written so any Claude session (Opus 5.5 is fine) can execute a round cold, from this
folder alone. Read `../CLAUDE.md` first, then `RS-APP-FRAMEWORK.md`, then the round
you are running.

## How to run a round
1. Open the round file. Read GOAL, DONE WHEN, and the STEPS in full before touching code.
2. Do every step marked **[Claude]** yourself (code, migrations via Supabase MCP,
   Vercel checks, Chrome where it works). Verify as the file says.
3. Collect every step marked **[Rowly]** into ONE pasteable terminal block, written
   exactly as the file specifies (hidden prompts for secrets, value verification,
   results logged in the terminal only). Hand it over once, at the end.
4. Append to the round file's EXECUTION LOG: what shipped, what failed, what remains.
   Commit (`docs:` prefix for docs-only) and push. A push to `main` deploys.
5. Stop at a gate. Do not start the next round until its gate is passed.

## Round order and gates

| Round | File | Gate it ends at |
| --- | --- | --- |
| A — Production hardening | `ROUND-A-PRODUCTION-HARDENING.md` | code shipped 11 Oct; Rowly's block pending |
| A2 — Email on Amazon | `ROUND-A2-EMAIL-ON-AMAZON.md` | app sends from rowlystudios.com; hello@ live |
| A3 — Stripe live flip | `ROUND-A3-STRIPE-LIVE-FLIP.md` | **Gate 1: first live booking paid out clean** |
| B — Seed supply | `ROUND-B-SEED-SUPPLY.md` | **Gate 2: 25 approved profiles, 15 Stripe-connected** |
| C — Concierge | `ROUND-C-CONCIERGE.md` | **Gate 3: 10 paid bookings, 3+ rebookings** |
| D — Open market | `ROUND-D-OPEN-MARKET.md` | **Gate 4: 25% of bookings start without Rowly** |

Supporting files (not rounds):
- `LEGAL-PACK-BRIEF.md` — what FROST needs to draft before real client money.
- `APPLE-DEVELOPER-ROWLY-STUDIOS.md` — enrolling Rowly Studios Inc. as its own
  Apple developer and moving the app there.
- `MANAGED-AGENTS.md` — the Claude Managed Agents deployments that run the
  pre-mortem safeguards (specs + deployment templates in `agents/`).

## Non-negotiables for every round
- Reality ≠ spec → stop, write `CONFLICT FOUND`, wait. Never guess.
- No secrets in chat or files. Ever.
- Typecheck before commit. One migration at a time. Log the outcome.

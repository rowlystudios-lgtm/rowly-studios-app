# Legal pack — brief for FROST LLP (pre-mortem #4)

Needed before real client money moves through RS App (Round A3 / Gate 1). Rowly
sends this to Chris Frost; Claude drafts first versions on request so FROST reviews
rather than starts from blank.

## The structural question (answer first)
RS App procures work for creative crew in California and takes 15% of the client
price. Two laws decide how it must be framed:
1. **California Talent Agencies Act** (Labor Code §1700 et seq.) — procuring
   engagements for "artists" generally requires a licensed talent agency; fees from
   unlicensed procurement can be disgorged. Question for FROST: are camera operators,
   editors, MUAs, stylists "artists" under the Act as RS App uses them; is the
   platform/marketplace framing (client pays Rowly Studios for a crewed production
   service; talent are subcontractors) the right structure; or is a license, or an
   exemption, the cleaner path.
2. **AB5 / Labor Code §2775 (ABC test)** — talent are 1099 contractors. Question:
   does the business-to-business exemption or the professional-services exemption
   apply as structured; what must the contract and the operating reality say so it
   holds.

## Documents to produce (and where they live in-product)
| Document | Accepted by | Surfaced where | Must cover |
| --- | --- | --- | --- |
| Client booking terms | Client, at job post | checkbox on `/app/post-job` + link in invoice email | scope, rates incl. the 15% service fee disclosure, deposits, **cancellation tiers** (e.g. >72h free, 24–72h 50%, <24h 100%), weather/force majeure, liability cap, payment terms (due on invoice; ACH fee), disputes |
| Talent agreement | Talent, at onboarding | already an embedded agreement on the website application; mirror in-app at Stripe step | contractor status, rate floor, cancellation/no-show consequences, deliverables + usage rights (client gets usage; talent keeps portfolio rights), confidentiality, non-circumvention for 12 months (anti-leakage, enforceable only if reasonable), payout timing (5-day hold), Stripe Connect |
| Privacy policy | all | `app.rowlystudios.com/privacy` + App Store listing | data collected, Stripe, email providers (SES), account deletion, CCPA rights |
| Terms of service | all | `/terms` | platform rules, acceptable use, account termination |

## Operating points FROST should know
- Rowly Studios Inc. (S corp, LA) runs RS App; Apple membership currently sits under
  The Yummy Wellness Company, LLC — moving (see `APPLE-DEVELOPER-ROWLY-STUDIOS.md`).
- Clients see one price; the 15% is in the agreement, not the UI (decided).
- Deposits are planned (Round C) — terms should allow them.
- Insurance: confirm what production liability / E&O Rowly Studios carries, and
  whether talent must carry their own.

## Deliverable back to the repo
Final text as Markdown in `legal/` (`client-terms.md`, `talent-agreement.md`,
`privacy.md`, `terms.md`) with a version + effective date; Round A3 wires the
acceptance checkboxes and stores `accepted_terms_version` on profiles/jobs.

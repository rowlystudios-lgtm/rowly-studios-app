# Rowly Studios Inc. as its own Apple developer

Today RS App builds under The Yummy Wellness Company, LLC's membership (team
QQ2URK7777, Apple Account rowlyinla@googlemail.com, Expo owner rowlyinla). That is
fine for TestFlight. For the public App Store, the seller name should be
**Rowly Studios Inc.**, and the app should live in the entity that owns it.

Sources checked 11 Oct 2026: Apple "Enroll as an organization" and "D-U-N-S Number"
support pages.

## What Apple requires (organization enrollment)
- An **Apple Account with two-factor authentication on**, in the Account Holder's
  **legal first and last name** (Rowly Dennis — an alias or company name delays it).
  Apple recommends the account be on the **organization's own email domain**, and the
  work email **must** be on the organization's domain → use `@rowlystudios.com`.
- A **D-U-N-S number** for the exact legal entity **Rowly Studios Inc.** (free from
  Dun & Bradstreet; DBAs/trade names are rejected).
- Legal entity able to contract; the Account Holder must have authority to bind it
  (founder/owner — yes).
- A public, functional website on the organization's domain (rowlystudios.com — yes).
- **US$99 per membership year.** This is a second membership alongside Yummy's.

## Which login to use — decided 12 Oct 2026
Rowly enrolls with the Apple Account **rowlystudios@gmail.com** (name Rowly Dennis,
2FA on). Not rowlyinla@googlemail.com — that account holds the Yummy membership,
Apple enrolls one membership per Apple Account, and it is the wrong entity.
One requirement to prepare for: the enrollment form's **work email must be on the
organization's domain** — so have `hello@rowlystudios.com` (Round A2) live before
enrolling and enter it there; the Apple Account itself can stay the gmail address.
Use the same Apple Account for the D-U-N-S lookup/request and the enrollment.
`ios-wrapper/eas.json` already targets this account (`submit.production.ios.appleId`).
rowlyinla@googlemail.com can be invited to the new team later as Admin if useful —
one Apple Account can belong to several teams; it just can't *hold* two memberships.

## Timeline (realistic: 1½–2 weeks, start now)
1. **Round A2 first** — hello@ must exist so `rowly@rowlystudios.com` can receive
   Apple's verification mail.
2. **D-U-N-S**: developer.apple.com/enroll/duns-lookup → look up "Rowly Studios Inc."
   If found, note the number. If not, request one from the same page: legal name,
   HQ + mailing address, work contact. D&B: up to **5 business days**; then up to
   **2 business days** before Apple can see it. D&B may ask for formation documents.
3. **Enroll**: developer.apple.com/programs/enroll → Organization → entity details,
   D-U-N-S, website, authority. Verification is typically a few business days and
   may include a phone call to the organization's number. Then accept the agreement
   and pay $99.
4. **Create the App Store Connect app** `com.rowlystudios.rsapp` under the new team
   and point EAS at it: in `ios-wrapper/eas.json` set `submit.production.ios.appleTeamId`
   to the new team ID; run `eas credentials` to generate the new team's distribution
   certificate and profile. Expo project stays `@rowlyinla/rs-app` (Expo account ≠
   Apple team).

## Moving what already exists
Nothing is public yet, so this is cheap either way:
- If an RS App record already exists under the Yummy team in App Store Connect:
  Apple's **app transfer** moves an app (bundle ID included) between accounts;
  confirm eligibility for a TestFlight-only app at transfer time. If it is not
  eligible, delete the unreleased app record under Yummy, release the App ID in the
  developer portal, and register `com.rowlystudios.rsapp` under the new team — or
  simply use a fresh bundle ID (e.g. `com.rowlystudios.rs`) — testers reinstall once.
- The decision rule: whichever team the **first App Store submission** goes from is
  the team the app stays on. Aim for Rowly Studios Inc.

## Benefits (why bother for $99)
- Seller name on the App Store: Rowly Studios Inc. — brand and client trust.
- IP, Apple agreements, and access live in the entity that owns the product (the
  pre-mortem #4 entity-hygiene point; what an investor, buyer or FROST expects).
- Yummy's future collaborators never touch RS App, and vice versa.

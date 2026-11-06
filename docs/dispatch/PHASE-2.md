# Phase 2: authenticated dispatch preview

This phase builds on PR #7, commit `38515c8d9f34ce67b05da1c2e1da29bd9f5c18e3`. Neither phase is merged into the deployment branch. The previously published [phase-one setup](SETUP-AND-ROLLOUT.md) and [validation](VALIDATION.md) describe that earlier checkpoint; the status below supersedes their statements that the HTTP/UI adapters do not exist.

## Implemented

- Authenticated v5 HTTP routes for vendor creation/list/detail, rider offers and atomic acceptance/decline, consented GPS, incident reports, intended-recipient handovers, final progress and customer delivery confirmation.
- Server-calculated route pricing and a quote-revision/total check before creation; handler and platform charges appear separately before confirmation. Vendor identity must be operator-approved. A browser cannot set initial payment, assignment, custody or fees. Failed creation rolls back the new shipment and dispatch job together. Repeating the same creation request returns the same shipment; a changed payload cannot reuse that request ID.
- Only provider-confirmed payment releases offers. Existing v3 payment verification and authenticated webhook processing serve v5 too; existing v3 callbacks remain `/payment-return`. New preview payment returns use `/app/dispatch` and require explicit provider verification or webhook confirmation.
- Vendor/rider workspace at `/app/dispatch`, owner operations at `/admin/dispatch`, and no-signup v5 customer tracking at its generated `/t/<secret>` link. Existing marketing `/`, main app `/app`, dashboard `/admin`, old tracking/dispatch links, assets, waitlist and saved records are preserved. Preview-enabled main-app and owner navigation link to their new workspaces.
- Customer contact verification is a separate screen/code flow. The page never displays the recipient phone or delivery code. A verified customer receives the final-delivery code through the configured SMS provider, not through the rider, browser or ordinary owner screen.
- Read-only refreshes update data containers without replacing the forms. Overlapping refreshes are prevented; transient failures retain the page, focus, scroll, open details and entered values. A failed detail fetch removes its map marker instead of presenting a stale location as live. Navigation opens an external maps app/search only for the address the current participant is authorized to see. There are no invented GPS positions or ETA calculations.
- A session-bound location-consent nonce prevents a delayed fix from reactivating sharing after withdrawal. Discovery and job fixes require a current nonce, recent observation and explicit consent; consent grants expire after 30 minutes and positions after two minutes. Browser sharing stops on hiding the page. If the network is unavailable, local sharing stops immediately and server positions age out; the UI states this limitation. This is foreground browser behavior, not native background tracking.
- Native Android/iOS installation registration/revocation endpoints with encrypted tokens, account/session scoping and active-session checks before native sends. Current-session logout clears its discovery GPS/consent and revokes its native installation tokens. FCM/APNs outbox routing is connected on the server; no native SDK is bundled by this phase.
- A standalone `scripts/dispatch-worker.mjs` entry point drains due jobs and durable notification retries. `--once` performs a bounded pass. It does not start an HTTP listener. Unpaid jobs are rescheduled so they do not permanently occupy the front of the worker queue. No worker has been provisioned or run against production.
- An interim **owner-only authenticator step-up**, tied to the existing owner session and CSRF checks. Codes are six-digit TOTP, rate limited, checked against a durable replay counter and exchanged for a 15-minute dispatch proof. Machine operator tokens cannot unlock or administer the new dispatch endpoints. This is **not** the individual-staff/granular-permission system required in phase 3.

The custody policies, delivery-code TTL/limits/invalidation, incident restrictions and exactly-once internal ledger rules from phase 1 remain in force. The final-delivery handler must authenticate and present the customer's current code; internal earnings do not imply a completed bank payout. All legacy mutation routes reject v5 shipments.

## Preview-only activation

Production activation is deliberately **blocked in code** until the remaining security, recovery and device work is reviewed. `NODE_ENV=production` forces the v5 capability to disabled, even if the preview variable is true. Existing production shipments and pages keep working. Do not change the existing Render service's `NODE_ENV`, database, plans or environment settings to defeat this gate.

On an isolated development database only, supply these privately:

| Setting | Required value |
| --- | --- |
| `SENDRACK_DISPATCH_PREVIEW` | `true` |
| `NODE_ENV` | `development` or another nonproduction environment |
| `NOTIFICATION_ENCRYPTION_KEY` | Separate random 32-byte key as 64 hex characters |
| `DISPATCH_OWNER_TOTP_SECRET` | Private uppercase base32 authenticator secret, 32–128 characters; enroll in a trusted authenticator outside chat/logs/source |
| Existing owner settings | Real private `ADMIN_USERNAME` and `ADMIN_PASSWORD` / `ADMIN_PASSWORD_HASH`; preserve existing operator credentials |
| Existing provider/identity settings | See phase-one setup; real outbound delivery needs approved/funded provider accounts |

Never use the public test-fixture secret/password or real customer data for a preview. Real provider tests must target only phone numbers/accounts you control; fixture phone numbers are for mocked providers only. Do not point preview fixtures at the live Render database. Without both new secrets, enabling the nonproduction preview fails startup rather than silently bypassing encryption or authenticator checks. It adds its tables only in the enabled nonproduction environment. There is no production-ready override.

A private environment file can be loaded with Node 24, without placing secret values in command arguments:

```
node --env-file=/private/sendrack-preview.env server/server.mjs
node --env-file=/private/sendrack-preview.env scripts/dispatch-worker.mjs --once
```

The server and worker must use the same isolated database and notification key. The continuous worker can be run with the same command without `--once`. A sleeping free Render web service is not a continuously running worker. Paid always-on capacity/external scheduling, SMS credit, offsite backup storage and Apple account requirements still need a reviewed cost decision; none was provisioned. Existing Render free resources and configuration are untouched.

After starting the local preview, open:

- `http://127.0.0.1:3000/app/dispatch` — returning vendor/rider account login and dispatch workspace.
- `http://127.0.0.1:3000/admin` — existing owner login, followed by `http://127.0.0.1:3000/admin/dispatch` for authenticator unlock.
- The **generated** `/t/<secret>` link from a new shipment — customer tracking/contact verification. Never hardcode or publish a real customer's link.

SMS signup/login uses the existing deployed-branch account APIs; the separate email-verification PR #4 is still unmerged. This phase does not bypass the missing provider, substitute delivery codes for login codes, or automatically approve identities. Browser notifications are optional foreground alerts with a user-initiated permission request; the durable in-app inbox remains available if permissions/push are unavailable. No browser service worker or background web push is claimed.

## Validation

- `npm test`: **72 tests, 68 passed, 4 PostgreSQL-environment checks skipped, zero failed**.
- `npm run test:dispatch`: Chromium preview screens at **1366×768, 1920×1080 and 390×844**, with no horizontal overflow. Two refresh cycles preserve edited values, focus, scroll and an open details section. Simulated offline failures preserve the forms. Rider GPS uses browser-emulated coordinates, not an actual device. The browser exercises a paid offer and assignment and verifies that assignment leaves custody with the vendor. Customer contact fields survive refresh without exposing the recorded phone. Owner authenticator unlock and two owner refresh cycles preserve edited form values.
- `npm run test:ui` and `npm run test:admin`: existing app/owner regression checks passed using mocked providers.
- New HTTP tests cover quote tampering, identity/role/owner checks, atomic/idempotent creation, legacy mutation guards, paid offers, physical pickup, recipient proof, completion/ledger credit, TOTP replay and the published SHA1 vector, CSRF/machine-token rejection, cancellation privacy, withdrawn-consent rejection, encrypted/scoped installations and logout without an approved identity.
- Phase-one domain tests still exercise interstate custody, replacement-code invalidation, concurrent acceptance/completion, queue failure and lease fencing, and encrypted SQLite restoration.

No live Render, real PostgreSQL multi-instance v5, production PostgreSQL restore, native FCM/APNs device delivery, background GPS or actual Android/iPhone test was performed. The current network policy still excludes the live Render hostname and provider domains. No replacement Android signing key was created; the original remains absent here.

## Sample-data screenshots

These show the real local preview interfaces with **clearly identified sample/test records**, mocked payments and browser-emulated GPS. They do not show real customers or evidence of physical-device operation.

| Screen | Screenshot |
| --- | --- |
| Vendor 1366×768 | [Vendor laptop](screenshots/vendor-1366.png) |
| Vendor 1920×1080 | [Vendor desktop](screenshots/vendor-1920.png) |
| Vendor mobile | [Vendor mobile](screenshots/vendor-mobile.png) |
| Rider offers | [Rider mobile](screenshots/rider-mobile.png) |
| Rider assigned, still vendor custody | [Assigned rider](screenshots/rider-assigned-mobile.png) |
| Customer contact verification | [Customer mobile](screenshots/customer-mobile.png) |
| Owner operations | [Owner laptop](screenshots/owner-1366.png) |

## Remaining before production

1. Individual staff accounts, MFA enrollment/recovery/replay controls and granular owner/dispatch/finance/document-review permissions; audited masked identity reveal and reviewed upload/retention policy.
2. Provider/native setup and client integration, notification installation rotation/revocation on actual devices, protected original signing-key recovery/backup, real Android/iPhone permission/background tests. The original alias/certificate identity must remain unchanged.
3. PostgreSQL multi-instance race/transaction tests, real encrypted offsite PostgreSQL backup and isolated restore/reconciliation drill, operational alerts, retention and incident response. Restore drills must disable outbound notifications and payments.
4. Review final-handler replacement fee allocation, explicit return-to-vendor handling after collection, new-link rotation after revocation, carrier park/destination address configuration and reviewed package/vehicle suitability rules. Current UI permits only forward configured routes; existing main-app reverse-route capabilities are unchanged. The preview never silently cancels or returns a parcel already in physical handler custody.
5. Only then prepare a separate production-activation change against `apk-test-v0.7.0`, preserving existing service/database/keys/plans. Neither PR #7 nor this stacked preview PR should be merged as an implied production dispatch activation. Check the exact deployed Render commit and run the live URL/payment/waitlist regression checks once network access is permitted.

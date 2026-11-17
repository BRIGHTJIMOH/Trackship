# SendRack 0.7.24-fcm — system audit and fixes

Audited the 0.7.23 APK and the mobile/public/admin source at deployment commit d0cc24aeaa6556cea893546c808dbb40e8c91c31, using isolated local PostgreSQL, Redis and browser fixtures. No production accounts, shipments, balances, provider settings or hosting plans were changed.

## Reproduced defects and fixes

| Area | Reproduced failure | Correction |
|---|---|---|
| Regional route creation | The regional form prefills a new route object without an ID. Saving treated it as an existing route, posted to `/routes/undefined` and was rejected. | Only objects with an ID use the edit endpoint/revision. Regional managers can create local routes and subsequently edit local prices. Existing server-side state/role restrictions remain enforced. |
| Mobile rate catalogue | The Check rate screen silently displayed only the first 100 routes. A 101-route fixture showed exactly 100. | Quotes are fetched in supported batches of up to 100 and the complete catalogue is displayed. Account changes are checked between batches and before displaying results. |
| Pricing editor | After a concurrent update, saving returned a revision conflict. Ordinary Refresh deliberately preserved the draft/revision, so it could not recover as instructed. | The conflict now offers **Load latest saved version**. The draft remains until the user confirms discarding it and loading the current server revision. |
| Website video editor | Concurrent video edits had the same stuck-revision recovery problem. | The same explicit, confirmed reload action recovers the current saved configuration without silently overwriting a draft. |

Four failing browser regressions reproduced these defects before the fixes. All four pass after the fixes. The rate regression also runs with the feature module extracted from the signed APK. The route check exercises real regional login, route creation and a price edit; both editor checks create real concurrent saved revisions.

## Verification scope

- **99 server/API tests passed, no skips:** accounts and sessions, email/signup handling, route/vehicle/direction eligibility, identity submission safeguards, notifications and push retries, test-vs-live dispatch restrictions, custody and delivery OTP, ownership, regional pricing/access, deletion/history and PostgreSQL migration/concurrency.
- **35 wallet/queue tests passed, no skips:** ledger/holds, idempotency, reconciliation, refunds/disputes, payout maker/checker rules, user HTTP ownership and real local Redis/BullMQ restart/outbox recovery. These use mock bank/provider fixtures, not real funding or payouts.
- **Packaged APK/browser checks passed:** reference opening/Home/tracking screens, history-before-current ordering, rate quotes, dark/responsive layouts, vendor creation, payment gate, owner test mode, rider accept/call/collect, quiet synchronization, map-origin handling and pickup safeguards.
- **Admin checks passed:** login, route/pricing controls, shipment/identity views, suspension, settlements/activity, draft/focus/scroll preservation and conflict recovery, regional route creation/local pricing, daily availability and website-video publishing.
- **Additional checks:** public website responsive layout and waitlist persistence; history cleanup/restore; every intrastate/interstate tracking stage; large operations map with 2,000 sample shipments, clustering, retained filters/viewport, disconnect/reconnect, stale fix expiry and custody changes; controlled provider key rotation/rejection/fallback. Test selectors were updated to open the redesigned filter/diagnostic drawers and to observe intentionally hidden successful-map status elements.
- Native Java registration-policy checks passed. Android release compilation, APK version/assets/Firebase classes and the retained signing certificate were verified.

## Installation and rollout

APK: `downloads/SendRack-0.7.24-fcm.apk`, package `ng.sendrack.test`, version code 24, version `0.7.24-fcm`. Install over the existing app without uninstalling or clearing storage. The 0.7.23 layout and notification recovery remain included.

Merge the reviewed system-audit branch into `apk-test-v0.7.0`, then deploy that commit on the existing Render service. The updated admin JavaScript requires the backend/static-source deployment; the rate-list correction is bundled in the APK. No database reset or migration is introduced by these fixes. Confirm a regional local-route create/edit, a current rate quote and editor conflict recovery after deployment.

Signer SHA-256: `d34b55d2982e55a2623157423ba2ad634ce2844c482144b53f53d88f0b8ecfa5`. The retained private key was used and never regenerated. The APK checksum is alongside the download.

## Verification limits

This audit does not establish that every possible defect is absent. Browser checks emulate phones and use controlled provider responses; native Android OS lifecycle, physical GPS, phone dialler/SMS delivery and live Firebase receipt still require physical-phone testing. Payment/bank/email/identity providers were mocked or tested through isolated request fixtures; no real transaction, external message or automated ID-provider verification was performed.

Render deployment/live logs cannot be accessed from this workspace: no Render connection/credential is available and network access is blocked. No live deployment is claimed. Google Maps/Navigation billing/keys and native iOS/TestFlight registration/macOS signing remain external setup requirements, unchanged by this audit.

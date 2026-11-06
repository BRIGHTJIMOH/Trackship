# Setup, activation and recovery

## Scope of this PR

This is **phase 1**, not a completed product rollout. The v5 service is a tested internal domain module, not mounted on HTTP routes, called from the existing creation/payment flow, or enabled by an environment flag. Setting the variables below does **not** activate nearby dispatch. Existing v3 shipments continue unchanged. The only existing runtime change in this PR restricts v3 dispatch previews to area/fee data and prevents another rider reading an assigned shipment or replaying its completion.

The provider adapters and backup utility are callable separately. No Render resources, environment values, database records, signing files, account providers or paid services have been modified. PR #6 is already merged into `apk-test-v0.7.0`; email signup/login PR #4 remains a separate change.

## Private settings

Enter secrets directly in the existing Render service's Environment settings or your secret manager. Do not paste keys, database URLs, private keys, codes or passwords into chat, a PR, logs, the APK or a browser bundle. Preserve existing keys and retain old decryption keys while any stored ciphertext requires them.

| Setting | Purpose / format | Status |
| --- | --- | --- |
| `NOTIFICATION_ENCRYPTION_KEY` | Separate random 32-byte key, 64 hexadecimal characters. Encrypts queued customer contacts/codes. Never reuse the identity or backup key. | Required to construct/use v5; not set here |
| `BACKUP_ENCRYPTION_KEY` | Separate random 32-byte key, 64 hexadecimal characters. Keep an offline, access-controlled recovery copy independently of archives. | Required by backup CLI; not set here |
| `FCM_PROJECT_ID` | Firebase/Google Cloud project with FCM HTTP v1 enabled | Adapter prepared |
| `FCM_CLIENT_EMAIL` | Service-account email granted only the permissions needed to send FCM messages in that project | Adapter prepared |
| `FCM_PRIVATE_KEY_BASE64` | Base64 of the service-account PEM private key; server only | Adapter prepared |
| `APNS_TEAM_ID` | Apple Developer team | Future native iPhone app |
| `APNS_KEY_ID` | APNs token signing-key ID | Adapter prepared |
| `APNS_PRIVATE_KEY_BASE64` | Base64 of the Apple .p8 PEM key; server only | Adapter prepared |
| `APNS_BUNDLE_ID` | Exact native app bundle identifier / push topic | Future native iPhone app |
| `APNS_ENVIRONMENT` | `production` for release tokens; anything else uses sandbox | Defaults to sandbox |
| `TERMII_API_KEY`, `TERMII_SENDER_ID` | Existing dedicated SMS provider integration for customer contact challenges and delivery codes; funded account and sender approval may be required | Preserve; actual delivery not tested |
| `PAYSTACK_SECRET_KEY` | Existing merchant key; test/live environments must remain separate. Webhooks must use this service's authenticated `/api/payments/webhook` endpoint. | Preserve; do not change payment mode as part of this PR |
| `TRACKSHIP_IDENTITY_KEY` | Existing identity-document decryption key | Preserve exactly; do not regenerate |
| `DATABASE_URL`, `DATABASE_SSL` | Existing database/connection policy | Preserve exactly |
| `ADMIN_USERNAME`, `ADMIN_PASSWORD` / `ADMIN_PASSWORD_HASH`, `TRACKSHIP_ADMIN_TOKEN` | Existing admin credentials | Preserve. They do not provide individual staff MFA. |
| `TRACKSHIP_ENABLE_PAYOUTS` | Existing payout switch | Preserve; do not enable to test dispatch |

FCM messages use generic alert text and an event ID; no recipient phone, precise address, delivery code or identity document. HTTP v1 OAuth access is cached and requests time out. APNs uses ES256 token authentication, the correct topic and a short alert expiry. A successful HTTP response means the provider accepted the request, not that a person saw it. Device installation registration/rotation/revocation and routing the outbox through these adapters are **phase 2 work**, not implemented by setting these variables.

Android still needs a Firebase Messaging client, notification channel, notification permission request, token refresh/registration and foreground/background handling integrated into the existing non-Gradle build, or an explicitly reviewed build migration. No Firebase SDK is bundled by this PR. Preserve package identity and the original signing certificate. Browser Notification permission and foreground inbox polling must be implemented separately; FCM native device tokens and APNs are not a browser-push implementation. iPhone Safari must retain the in-app inbox; native APNs requires a native app with the correct entitlements. No native iPhone app is introduced here.

The current customer challenge/code adapter contract is **SMS**, separate from signup/login. Resend test-sender email is not an alternative verified customer channel in this PR. A later email adapter must verify recipient email ownership before sending delivery codes; it must not reuse login codes or mark accounts verified. Resend's test sender is restricted to the Resend account email until a domain is verified; it cannot serve arbitrary real customers.

## Nonsecret domain settings

Read when constructing `dispatchWorkflow`; no production flag or HTTP activation exists in this PR.

| Setting | Default | Bounds |
| --- | --- | --- |
| `DISPATCH_GPS_MAX_ACCURACY_METRES` | 200 | 10–1000 |
| `DISPATCH_OFFER_SECONDS` | 120 | 30–600 |
| `DISPATCH_MAX_ROUNDS` | 5 | 1–20 |
| `DISPATCH_INITIAL_RADIUS_KM` | 3 | 1–100; each round doubles up to 100 km |
| `DISPATCH_RIDER_CAPACITY` | 3 | 1–20 |
| `DELIVERY_CODE_TTL_HOURS` | 24 | 1–168 |

GPS discovery fixes require explicit consent, observation no more than 30 seconds ago, an active session, suitable accuracy, approved ID submission, service area, suitable vehicle and available capacity. A fix expires after 120 seconds; a client must never manufacture a position or refresh an old coordinate's observation timestamp. Permission withdrawal removes discovery GPS, pending offers and current shared job GPS. Reconnects must reacquire a real fix. There is no online/offline switch.

Initial pickup coordinates and allowed vehicles must come from a reviewed creation/quote flow; the internal initializer is not a browser API. Admin-controlled route/platform pricing remains authoritative. The later HTTP adapter must verify quote revisions, ownership, verified account status and confirmed payment before invoking the engine, and must not migrate existing active v3 deliveries. No price bidding is introduced.

## Custody, codes and incident policy implemented in the domain module

Assignment leaves custody with the vendor. Travel and arrival are separate checkpoints. Vendor offers collection to the assigned pickup rider, who authenticates to accept it. The pickup rider may offer an interstate parcel to a separately authorized carrier; the carrier may offer it to a different last-mile rider only after arrival. A rejected/expired transfer keeps the original holder. Every accepted handover records the intended actors, expected shipment version, timestamps and from/to custody legs. Pending handovers expire after 15 minutes. Active incidents pause progress and suppress shared GPS and delivery codes.

Contact verification uses a dedicated 10-minute customer code sent to the shipment's recorded contact; the public link never reveals that contact. Delivery codes are salted hashes, bound to the contact and assignment, and have the separate journey TTL above. The raw code exists only in encrypted queued payload and the customer provider send; successful/obsolete queued payloads are erased. Maximum five guesses per code, one send per minute and five sends per rolling 24 hours per shipment/code kind. Replacement codes differ from the immediately previous code. Replaced, expired, locked and used codes cannot complete a journey.

Interstate physical last-mile acceptance queues the delivery code immediately if customer contact is verified. Intrastate final departure after physical collection queues it. Without verified contact, custody persists as `awaiting-customer-verification`; after the customer proves contact, the code is queued if the final-delivery checkpoint permits it. Provider failure preserves the checkpoint and queued code for retry. Only the authenticated current final handler can complete an out-for-delivery, paid shipment. Completion, code consumption, event and internal earnings callback share one database transaction. That callback is mandatory and must write the existing unique `(shipment_id, leg)` ledger only; it must never call a bank provider inside the transaction. Bank transfers remain separately provider-confirmed.

Authorized operations require an injected individual-staff authorization callback returning an MFA-authenticated identity with the requested `dispatch.read` or `dispatch.manage` permission. The default callback rejects every request; the real staff/MFA system is **not implemented here**. The module never treats a browser-supplied `mfa: true` as authority.

Staff may reopen a pre-collection pickup assignment or approve a final-handler replacement. A final replacement does not silently change the holder: the old holder must initiate and the new approved rider must physically accept. Codes invalidate on approval/assignment/contact changes. The new final handler receives the leg's single credit on completion; this phase does not split a leg fee between replaced handlers. Disputed compensation requires review before activation. Cancellations are allowed only while custody is still with the vendor. Once physically collected, a cancellation becomes an incident until a separately reviewed return workflow exists. Incident resolution explicitly continues with the recorded holder; it never fabricates a return or customer delivery.

Customer links expire 24 hours after delivery, become unavailable on cancellation/revocation, and disclose only limited shipment events and recent coarse GPS. Sharing clears at custody change/completion/incident. Revoking a link also invalidates current customer codes; issuing a replacement link remains phase 2 work. A link is a bearer secret: do not expose it in offer/push payloads.

## Durable worker and cost dependencies

`sweep()` searches due jobs and drains the durable outbox. Run it outside an HTTP request/database lock. The later worker adapter must use a protected, bounded trigger or a separately supervised worker. Offers and inbox rows persist before push attempts. Retry delay starts at 30 seconds and doubles to a maximum of 30 minutes; 20 failures require staff review/retry. Jobs without a winner after configured rounds enter `needs-attention`. Worker claims use a lease and fencing token; notifications are at-least-once. Clients must deduplicate by event ID and always fetch authoritative state. A stale worker cannot overwrite a newer worker's acknowledgement. A send already in flight may arrive after expiry or cancellation; it must confer no authorization.

The free Render web service can sleep and cannot promise timely continuous dispatch, background retries or scheduled backups. An always-running worker/web service or an external scheduler with suitable uptime is needed before promising those timings. Offsite backup storage, restore capacity, SMS credit, provider messaging limits, Apple Developer membership and potentially map quotas also have costs. No paid resource is provisioned. Review the selected provider's current price and obtain a specific budget decision before changing any plan or buying services; no price/availability guarantee is implied by this PR.

## Backup and restore drill

The supplied CLI never overwrites its target and uses a separate AES-256-GCM key. Run with `BACKUP_ENCRYPTION_KEY` supplied privately to the process, never as a command argument. Examples contain paths only:

```
node scripts/encrypted-backup.mjs sqlite /private/local/trackship.sqlite /private/backups/sendrack.enc
node scripts/encrypted-backup.mjs restore-file /private/backups/sendrack.enc /private/restore/trackship.sqlite
node scripts/encrypted-backup.mjs seal /private/export/sendrack.dump /private/backups/sendrack-pg.enc
```

`sqlite` creates a consistent online SQLite snapshot including committed WAL, encrypts it and removes its temporary snapshot. It is **not a PostgreSQL backup command**. Temporary plaintext snapshots/restored files have mode 0600; use a restricted encrypted filesystem with adequate space, and remove leftover temporary files after crashes. Generic `seal` can protect a separately produced database dump or recovered signing file. Encryption does not replace offsite storage, access controls or availability checks.

For production Render PostgreSQL, the remaining operations phase must automate an approved `pg_dump` (custom format), encrypted offsite archival, retention and isolated `pg_restore`. Supply connection credentials through private `PG*` environment/secret files, not shell arguments or copied logs. This environment has neither a disposable PostgreSQL restore target nor `pg_dump`; no production database has been exported or restored. A SQLite fixture restore is tested, including account/shipment/ledger rows and integrity checking, wrong-key/tamper rejection and refusal to overwrite. It is not proof of production PostgreSQL recovery.

Before activation, restore a real encrypted PostgreSQL backup into an isolated database, verify table counts, identities/decryption, shipment history, pricing, earnings and pending queue, then run the app against that database with **all outbound payments, notifications and auto-payouts disabled**. Do not run restored outbox jobs against real customers during a drill. Back up identity/notification decryption keys separately or encrypted documents/codes cannot be recovered. Rotate queued notifications after a recovery if their delivery state is uncertain; reconcile payments with the provider before enabling transfers. Record restore duration and recovery point, protect the report, and delete the isolated test data according to the retention policy.

The original `/workspace/trackship-signing/test.keystore` is still absent here. Do not create a replacement. If recovered, verify alias `trackship-test` and certificate SHA-256 `46d13c6e672b351f992871414a5d2b63dda3a373acd35edfa99a452cdb0d6708` locally before sealing an offline backup. Store its password separately; test recovery/signature continuity without publishing a new APK. No signing-key backup or Android device validation is claimed.

## Review and deployment sequence

1. Review this phase-one PR against the fetched deployment branch. Run `npm ci` and `npm test` on Node 24. Where available, set `SENDRACK_TEST_POSTGRES_URL` to a **disposable** database and run `npm run test:postgres`; never point that variable at production.
2. Complete/review phase 2: version-aware authenticated HTTP endpoints and legacy-route guards, server-priced v5 creation, payment-confirmed dispatch trigger, dedicated customer verification UI, handover/incident/admin screens, navigation and map states, per-install push registration, worker entry point and native/browser implementations. Keep current links and v3 flows compatible. The current public marketing/app/admin assets are untouched by phase 1.
3. Complete/review phase 3: actual individual staff accounts, MFA enrollment/recovery/replay protection, granular identity/finance/dispatch permissions, masked identity viewing with explicit audited reveal, safe document retention, production PostgreSQL backup and restore, session revocation and monitoring. Existing admin access is not upgraded to MFA by this PR. Upload review means operator-approved submission, not government verification. The current image checks are a baseline, not a completed hardened document pipeline.
4. Run the PostgreSQL multi-instance/concurrency and production restore drills, then actual Android/iPhone permission/background tests. Test cold-start/deep-link inbox, withdrawn GPS/notification permission, no network, expiry and duplicate notification taps. Browser emulation does not meet this device gate.
5. Only after review/configuration should the eventual activation PR merge into `apk-test-v0.7.0` and deploy to **existing** `sendrack-api`. Do not apply a Blueprint, recreate a database, reset settings, change free plans, rotate existing keys or delete records. Confirm Render's actual deployed commit and check `/api/ready`, `/`, `/app`, `/admin`, payment-return, old tracking links and waitlist. This environment's policy blocks the live Render hostname, so live verification requires permitted network access; local tests are not reported as live results.

Security operations still needed: per-endpoint durable rate limits in the HTTP adapter (including failed/contact code attempts and idempotency storage bounds), actor/session revocation wiring for v5 positions, auditing of staff lookups/reasons, dead-letter/stalled-transfer alerts without PII, key rotation/re-encryption/retention runbooks, and incident drills. If compromised, revoke affected sessions/installation tokens, pause payouts and dispatch, preserve audited evidence, reconcile provider payments and restore only into isolation. Device integrity may supplement these checks; it cannot authorize custody or verify uploaded identity by itself.

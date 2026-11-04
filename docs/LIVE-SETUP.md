# Activating TrackShip live services

## Current state

Version 0.5.0 includes the application and server code for payment verification, handler acceptance/custody, SMS sign-in, encrypted rider identity submission, delivery OTP, GPS and earnings. The tests use isolated substitutes for payment/SMS providers and a test-only browser location. **No public server, merchant account, SMS account, live charge or bank payout has been activated.** Do not present this build as a verified live financial/identity service yet.

The owner confirmed that no hosting or Paystack account currently exists. Account creation and provider approval are external prerequisites; these cannot be invented or supplied by the APK.

## Accounts the owner needs

1. Create an account at [Render](https://dashboard.render.com/register), using the GitHub account that owns `BRIGHTJIMOH/Trackship`.
2. Create a Nigerian merchant account at [Paystack](https://dashboard.paystack.com/#/signup). Begin with **test mode**. Complete Paystack's business verification before accepting real money or requesting production transfer access.
3. Create an account at [Termii](https://accounts.termii.com/). Request an approved sender ID and fund its SMS service for rider sign-in and customer delivery OTPs.

Do not post API keys, NINs, home addresses, bank details or passwords in chat, source control or screenshots. Provider secrets belong in the hosted service's private environment settings.

## Deploy the service

`render.yaml` is a prepared Render Blueprint. It selects Node 24, a web service and a persistent disk for SQLite. The configured `starter` service and persistent storage are **paid resources**; reviewing or applying the Blueprint in your Render account is a separate user action. Nothing was purchased or deployed during development.

Connect the repository and branch `apk-test-v0.5.0` in Render. Create the service from its Blueprint after reviewing the plan/cost. Set the requested values privately:

| Setting | Meaning |
| --- | --- |
| `PAYSTACK_SECRET_KEY` | Paystack test secret key initially; live secret only after merchant activation |
| `TERMII_API_KEY` | Termii API key |
| `TERMII_SENDER_ID` | Approved Termii sender ID |
| `TRACKSHIP_IDENTITY_KEY` | Generated secret retained unchanged for decrypting identity records |
| `TRACKSHIP_ADMIN_TOKEN` | Generated private operator credential for identity review; never put it in an APK |
| `TRACKSHIP_ENABLE_PAYOUTS` | Defaults to `false`; enable only after identity review, bank integration and provider transfer approval |

Render supplies `RENDER_EXTERNAL_URL`; the backend uses it as the public origin. For another host, set `TRACKSHIP_PUBLIC_URL` to its HTTPS origin. Keep SQLite and its WAL files on durable storage. Preserve the encryption key separately; changing it makes existing identity records unreadable. Back up the database and keep access restricted.

Verify:

- `GET /api/health` returns service `trackship-ng`, version `0.5.0`.
- `GET /api/capabilities` reports the expected payment environment and connected SMS/identity services.
- Configure Paystack's webhook as `https://YOUR-SERVICE/api/payments/webhook`. Webhooks require the original raw Paystack signing key on the server; they cannot use an outbound-proxy placeholder as an HMAC key.
- Never enable the test substitutes used in `tests/` on the hosted service. There is no application flag for enabling them.

The current Blueprint has been prepared and source-checked, but **has not been applied to a real Render account**. Provider API calls have been exercised through contract-shaped test substitutes, **not real Paystack/Termii accounts**.

## Connect phones and customer links

After deployment, rebuild with the real non-secret service origin:

```sh
TRACKSHIP_SERVICE_URL=https://YOUR-SERVICE npm run build:apk
```

This bundles only the public origin in `config.mjs`. It does not bundle payment keys, identity keys or operator credentials. New phones then connect to that service automatically; rider sign-on is prefilled with it. Until that rebuild, a vendor can enter the HTTPS origin under Profile → Live tracking service, and a rider can enter it under Rider sign-on.

Create a new shipment, sync it and share its customer tracking link from its details page. A customer opens that URL in any browser and sees the journey and fresh GPS fixes without an account. A **private handler dispatch link** is different: only send it to the assigned pickup rider, carrier or last-mile rider.

## Payments, funds and earnings

The vendor enters an agreed fee per shipment. Interstate leg fees must sum to that total. Paystack's hosted checkout collects card/bank details; TrackShip does not store card details. A browser callback is not proof of payment: the server verifies reference, amount, NGN currency and test/live environment directly before dispatch is allowed.

After customer OTP confirmation, the server atomically records one earnings credit for each accepted handling leg. Test credits are labelled as test credits and cannot be withdrawn. Live credits are not described as bank payments until the provider reports successful transfer. Payouts need an approved rider identity review, resolved payout account, enabled transfers and sufficient provider balance. Ambiguous transfer outcomes stay `processing` and are not blindly retried; reconcile with the provider/webhook before taking action.

**This is not a regulated escrow integration.** An internal reserved-funds ledger does not stop Paystack's own settlement schedule. Holding money until delivery requires a provider-supported settlement/holding arrangement and the merchant's approval/configuration. Confirm that arrangement with the provider before promising escrow to clients. This code does not claim to have obtained that approval.

There is no automated cancellation/refund/dispute workflow in this build. Operator support is needed for exceptions; do not use live money until refund, dispute and payout reconciliation processes are agreed and verified.

## Rider identity and delivery proof

Identity is now part of signup for both roles. On Android, unsynced identity drafts use role-scoped Keystore encryption; with the hosted service configured, phone verification precedes encrypted server submission. NIN, licence, registration, ID photo, address and emergency contact are not placed in local profiles or public tracking responses. Historical private backup files may retain access capabilities and must be protected.

A submitted NIN/licence/address is **not independently verified**. The status stays `submitted` until an operator or an authorized verification process approves it. This build provides protected operator review endpoints, not a connected NIMC/identity-verification provider or a complete operator UI:

- `GET /api/admin/riders/:id/identity` with the operator bearer token reads the encrypted submission for review.
- `POST /api/admin/riders/:id/identity` with `{"status":"approved"}` or `{"status":"rejected"}` records the review decision.

Set an appropriate identity retention/access policy before collecting real records. Bank payout is blocked until approval. Delivery OTPs go to the recipient's recorded phone, expire after ten minutes and lock after five wrong attempts. Riders cannot retrieve the code from the API. Requesting another code is rate limited.

## GPS behavior

OpenStreetMap/Leaflet displays actual GPS fixes; Google Maps billing is not required. Map tiles still require internet and must follow OpenStreetMap's usage policy; use a commercial tile provider for scale.

Only the verified handler currently holding the parcel can upload a position, and sharing must be started explicitly. Android requests location/notification permission and runs a visible foreground service with a Stop action. It can keep sharing while the app is backgrounded. A stop request clears the server position when reachable. When connectivity is absent, a previously received point can remain visible for at most two minutes, after which it is hidden. Custody transfer and completion clear the old position/consent. No route, ETA or distance is fabricated.

Actual Android GPS, permissions, battery/background behavior and carrier network/SMS delivery still require physical-device tests. Browser GPS tests used a test-only injected coordinate; no real road journey was tested.

## Acceptance before an investor/client live demonstration

Use provider test mode first on at least two physical phones and a separate customer browser. Exercise intrastate and all interstate handoffs, sign-in/delivery SMS, GPS start/stop/background behavior, correct/wrong/expired OTP, duplicate webhooks and payout reconciliation. Verify backups, identity review/access and restoration after service restart. A real live charge/transfer should happen only after the provider accounts and business operations are activated. Deployment/account access remains the current external blocker.

## Independent accounts and notifications

Vendor and rider use separate SMS signup/login endpoints under `/api/accounts/`. Returning users log in; they do not create a replacement account. Vendor session revocation does not revoke rider sessions or prevent rider acceptance. Legacy anonymous workspaces can be claimed by the verified vendor account using their old private credential.

Latest signup uses `POST /api/accounts/identity` for either authenticated role. Vendor identity supports a national ID/NIN card, voter’s card, international passport or driving licence, front photo and residential address. Riders additionally need an 11-digit NIN and emergency contact. Motor riders need both a driving licence and vehicle registration. The `/api/v3` and `/api/v4` rider identity routes remain compatibility endpoints for earlier APKs. Review submissions with the protected operator API; submission is not verification.

Created shipments generate durable rider notifications for matching registered city/state/community and capacity. Unpaid offers cannot be accepted. Payment verification makes the offer ready; acceptance is transactional, so only one pickup rider can claim it. No online/offline flag is used. These are registered service areas, not live GPS-distance matching.

The app inbox polls every ten seconds while open. Android JobScheduler checks at a minimum fifteen-minute interval, subject to OS delays, and needs notification permission. This is not instant push. `TRACKSHIP_SEND_JOB_SMS=false` avoids automatic SMS spending; optional SMS uses the configured provider when explicitly enabled. `TRACKSHIP_RIDER_CAPACITY=5` is the default active-job limit. Validate notification delivery on physical Android devices before promising background alerts.

## Version 0.5 account experience

The service origin is deployment configuration (`TRACKSHIP_SERVICE_URL` at APK build time); users no longer enter connection URLs in Profile. Configured signup registers/phone-verifies the account and submits encrypted identity before setting a PIN. Without a backend, Android saves a role-scoped encrypted identity draft; SMS login and real funds remain unavailable. A browser without a backend/native vault refuses to save identity.

Vendor operator review uses `/api/admin/vendors/:id/identity` with the same protected operator bearer token and approved/rejected status rules as rider review. No government-verification API is connected merely by accepting the document.

Every restart/background return requires a PIN login, retaining saved records behind the account lock. Explicit Log out revokes the current online session. Identity picker interactions remain in signup. Vendor balances remain unavailable until a supported wallet is implemented; rider amounts are available live-delivery ledger entries, not a bank balance.

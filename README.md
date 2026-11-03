# TrackShip NG · 0.4.0

Android application and Node/SQLite backend for Nigerian vendors and delivery handlers. The design follows the supplied orange-and-white references, with original onboarding photography and local Inter/Leaflet assets.

## What is built

- Inter typography, dashboard/profile logout, a PBKDF2-hashed six-digit app PIN to unlock saved device workspaces, and rider-session revocation. Logout stops tracking and preserves shipments.
- Vendor/rider local onboarding, prominent rider entry point, personalized dashboards and persistent night mode.
- Intrastate and interstate shipments, agreed delivery fee and interstate leg allocations.
- Manual + shipment baskets and atomic CSV import of up to 100 deliveries, history/search/type/status filters and account-scoped backups.
- Hosted payment checkout with server-side verification, signed webhooks and idempotent payment references.
- Pickup acceptance distinct from physical collection; carrier and last-mile handoff requests/acceptance.
- SMS-verified rider sign-on, encrypted identity submission, protected identity review and payout prerequisites.
- Recipient SMS OTP with expiration/attempt limits and exactly-once delivery completion/earnings.
- Per-leg earnings ledger, explicit test/live distinction, account resolution and gated provider transfers.
- Public customer tracking without signup, fresh GPS map points, no invented ETA/distance, and an Android foreground location service with visible stop control.

## What is not live yet

The owner currently has no hosting or Paystack account connected. No public backend, real payment, bank payout, SMS account or identity-verification provider has been activated. Automated tests use isolated provider substitutes and a test-only browser location; they are not evidence of real provider operation.

The APK has an empty default service origin. Phone-only profile setup, night mode, package creation, bulk import and status-message sharing work. Public live links, remote dispatch, secure identity submission, recipient OTP, verified payments and cross-phone GPS require the deployed backend and connected providers. The app fails clearly when they are absent; no balances, OTPs or positions are secretly simulated.

An internal payment/earnings ledger is **not regulated escrow** and does not change a provider's settlement schedule. Confirm a supported holding arrangement with the provider before promising to retain funds until delivery. Refund/dispute processing and a complete operator console are not implemented. Identity submissions are not independently verified just because they are saved. See [live setup](docs/LIVE-SETUP.md) before any real client or money trial.

## Install/update

The generated APK is `artifacts/TrackShip-NG-test.apk`; the repository download is `downloads/TrackShip-NG-v0.4.0.apk`. Android 8+ and a current System WebView are required. It uses the same package/signing identity as the earlier builds, with version code 5. Install over the old APK to retain profiles/shipments; do not uninstall without exporting a backup.

Earlier manual shipments remain readable but are identified as legacy records. New shipments use the funded custody workflow. See [phone testing](docs/TEST-ON-YOUR-PHONE.md).

## Development

Prerequisites: Node 24 (built-in SQLite), Java 21 runtime and keytool, Python 3, Bash/curl; Chromium for UI tests.

```sh
cd /workspace/Trackship
npm ci
npm test
npm run test:ui
npm start
```

The service binds `127.0.0.1:3000`. `GET /api/health` returns `{"service":"trackship-ng","version":"0.4.0"}`. `GET /api/capabilities` reports connected providers. Test runners need permission for temporary local sockets and Chromium in restricted environments. Tests use temporary databases and injected transports only; production has no fake-provider switch.

```sh
bash scripts/setup-android.sh
npm run build:apk
# After a real backend has been deployed:
TRACKSHIP_SERVICE_URL=https://YOUR-SERVICE npm run build:apk
```

The build compiles Java, bundles offline web assets, generates DEX, aligns/signs the APK and verifies its signature. `/workspace/toolchains` holds checksum-verified SDK/compiler files. Preserve `/workspace/trackship-signing/test.keystore` for update compatibility; do not commit it. The build-time service origin is public configuration, never a credential. Provider and encryption secrets must not be bundled into the APK.

## Backend activation

`render.yaml` prepares a Node 24 service with persistent disk. The selected Starter service/storage are paid resources requiring owner review and account activation; nothing is deployed automatically. See [activation instructions](docs/LIVE-SETUP.md) for Render, Paystack, Termii, webhook settings, identity encryption and payout gates. The optional Dockerfile is another deployment recipe, not a tested deployment.

| Setting | Purpose |
| --- | --- |
| `HOST`, `PORT` | Bind address and HTTP port behind HTTPS termination |
| `DATA_DIR` | Durable private SQLite storage directory |
| `ALLOWED_ORIGINS` | Includes `https://appassets.trackship.ng` |
| `TRACKSHIP_PUBLIC_URL` | Public HTTPS origin; Render can supply `RENDER_EXTERNAL_URL` instead |
| `PAYSTACK_SECRET_KEY` | Private provider key; start with test mode |
| `TERMII_API_KEY`, `TERMII_SENDER_ID` | SMS provider connection and approved sender |
| `TRACKSHIP_IDENTITY_KEY` | At least 32 high-entropy characters, or 64 hex characters; preserve separately |
| `TRACKSHIP_ADMIN_TOKEN` | Private operator identity-review credential |
| `TRACKSHIP_ENABLE_PAYOUTS` | `false` by default; requires identity approval and provider activation |

The database, keys, sign-in sessions and backups are private. Do not expose them as static files. Identity details are AES-256-GCM encrypted server-side and excluded from normal client profiles/backups/public tracking. Backups still include session/dispatch capabilities and customer data; protect them.

## Layout

- `web/`: app/customer UI, delivery rules, bulk parsing, map and feature views.
- `android/`: WebView shell, share/file/dial integration and explicit-consent foreground GPS service.
- `server/`: legacy API compatibility, funded custody/payment/OTP/identity/earnings operations and real provider adapters.
- `tests/`: regression, full custody/financial invariants and multi-device browser flows with test-only providers.
- `scripts/`: toolchain setup and reproducible APK build.
- `docs/`: test guide, activation prerequisites, assets and [validation limits](docs/VALIDATION.md).

## Accounts, identity and delivery alerts

Sign up and Log in are separate entry points. Each role/phone has its own profile, PIN, shipments and session. Vendor logout revokes its connected session and leaves the rider account operating independently. SMS login on a new phone restores the same cloud account/history when the service and SMS provider are configured. The local PIN is a salted PBKDF2 device lock, not cloud authentication; keep a private backup. Offline logout cannot immediately revoke a remote session.

The header has a visible Night/Day button. Vendors can build a shipment basket using **+ Add another shipment**; CSV import remains optional. Backups include only the current account, with private customer data and access capabilities that must be protected.

All riders, including bicycle riders, must submit a government ID number and front photo, residential address and emergency contact. Motor-vehicle riders also supply a driving licence. Android can keep an unsynced draft encrypted with Android Keystore; drafts are excluded from backups and lost on uninstall. Server identity submissions are encrypted and require operator review; saving is not independent identity verification.

Riders receive offers matched to their registered pickup city/state/community, identity submission and active-job capacity. There is no online/offline toggle. This is service-area matching, not measured GPS proximity. The visible inbox polls every ten seconds; Android checks in the background on a minimum fifteen-minute schedule that the OS may delay. Instant Firebase push is not configured. Optional job SMS is disabled by default (`TRACKSHIP_SEND_JOB_SMS=false`); enable only after reviewing provider costs. `TRACKSHIP_RIDER_CAPACITY` defaults to 5.

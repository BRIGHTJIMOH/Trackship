# SendRack · 0.5.1

Android application and Node/SQLite backend for Nigerian vendors and delivery handlers. The design follows the supplied orange-and-white references, with original onboarding photography and local Inter/Leaflet assets.

## What is built

- Rotating loading logo, then direct Sign up / Log in with vendor/rider selection.
- Separate phone accounts and PINs; saved shipments are preserved while every app restart or background return requires login. Android file selection is treated as a temporary signup interaction.
- Account balance card below each name, with an eye to reveal/hide. Rider amounts come from the available real-delivery earnings ledger; unconnected and vendor wallet balances are unavailable, never fabricated.
- Profile-only night mode and plain Log out. No dashboard identity shortcuts, vendor-to-rider switch, service connection form or backup controls.
- Identity in signup: national ID/NIN card, voter’s card, international passport or driving licence for vendors and riders. Riders additionally supply NIN, residential address and emergency contact; motor vehicles require driving licence and vehicle registration. Android drafts use role-scoped Keystore encryption.
- Intrastate/interstate shipments, manual + baskets and optional atomic CSV import, per-delivery payments, custody handoffs, OTP confirmation and per-leg earnings.
- Area-matched rider offers, a durable notification inbox, Android scheduled background alerts, public no-signup tracking and explicit-consent real GPS sharing.
- Details display saved package/service/date/value fields and omit absent metadata on older/CSV records.

## What is not live yet

The owner currently has no hosting or Paystack account connected. No public backend, real payment, bank payout, SMS account or identity-verification provider has been activated. Automated tests use isolated provider substitutes and a test-only browser location; they are not evidence of real provider operation.

The APK has an empty default service origin. Android signup with encrypted identity drafts, PIN login, night mode, package creation, bulk import and status-message sharing work. Public live links, remote dispatch, server identity review, recipient OTP, verified payments and cross-phone GPS require the deployed backend and connected providers. The app fails clearly when they are absent; no balances, OTPs or positions are secretly simulated.

An internal payment/earnings ledger is **not regulated escrow** and does not change a provider's settlement schedule. Confirm a supported holding arrangement with the provider before promising to retain funds until delivery. Refund/dispute processing and a complete operator console are not implemented. Identity submissions are not independently verified just because they are saved. See [live setup](docs/LIVE-SETUP.md) before any real client or money trial.

## Install/update

The generated APK is `artifacts/SendRack-test.apk`; the repository download is `downloads/SendRack-v0.5.1.apk`. Android 8+ and a current System WebView are required. It uses the same package/signing identity as the earlier builds, with version code 7. Install over the old APK to retain profiles/shipments; do not uninstall, because unsynced records and encrypted ID drafts would be lost.

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

The service binds `127.0.0.1:3000`. `GET /api/health` returns `{"service":"trackship-ng","version":"0.5.1"}`. `GET /api/capabilities` reports connected providers. Test runners need permission for temporary local sockets and Chromium in restricted environments. Tests use temporary databases and injected transports only; production has no fake-provider switch.

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

The database, keys, sign-in sessions and backups are private. Do not expose them as static files. Identity details are AES-256-GCM encrypted server-side and excluded from normal client profiles/backups/public tracking. Historical backup files may include session/dispatch capabilities and customer data; protect them. Backup controls have been removed from the app interface.

## Layout

- `web/`: app/customer UI, delivery rules, bulk parsing, map and feature views.
- `android/`: WebView shell, share/file/dial integration and explicit-consent foreground GPS service.
- `server/`: legacy API compatibility, funded custody/payment/OTP/identity/earnings operations and real provider adapters.
- `tests/`: regression, full custody/financial invariants and multi-device browser flows with test-only providers.
- `scripts/`: toolchain setup and reproducible APK build.
- `docs/`: test guide, activation prerequisites, assets and [validation limits](docs/VALIDATION.md).

## Accounts, identity and delivery alerts

Sign up and Log in are separate entry points. Each role/phone has its own profile, PIN, shipments and session. Dashboard role switching is removed; change roles only after logging out. Vendor logout revokes its connected session and leaves independent riders operating. SMS login on a new phone restores the same cloud account/history when the service and SMS provider are configured. The PIN is a salted PBKDF2 device lock; five incorrect attempts cause a five-minute lockout. There is no local forgotten-PIN reset.

App backgrounding/restarting locks dashboard access, resets navigation and hides balances without deleting saved shipments or revoking an active delivery's provider session. Android's document picker is exempt so signup can attach an ID photo. Explicit Log out separately revokes the current service session when reachable. Offline logout cannot immediately revoke a remote session. Native lifecycle behavior must be tested on a physical phone.

Identity numbers/photos, NIN, licence, registration and home address are excluded from browser profiles and historical backups. Android stores an unsynced draft encrypted, separately for each role/phone; uninstall removes it. Hosted identity submissions are AES-GCM encrypted and require operator review. A submission is not an independent validity check. Legacy ID drafts without the newly required fields must be updated.

Offers match the registered pickup city/state/community, identity submission and active-job capacity. There is no online/offline toggle. This is service-area matching, not measured GPS proximity. The visible inbox polls every ten seconds; Android background checks have a minimum fifteen-minute schedule and can be delayed by the OS. Instant Firebase push is not configured. Optional job SMS defaults off (`TRACKSHIP_SEND_JOB_SMS=false`); `TRACKSHIP_RIDER_CAPACITY` defaults to 5.

The product was renamed from TrackShip NG to SendRack in 0.5.1. The Android package, signing key, private storage keys, database filename, native bridge, API service identifier and existing TRACKSHIP_* deployment settings remain compatible so installed profiles, PINs, encrypted ID drafts and shipments can be retained. The repository remains BRIGHTJIMOH/Trackship.

# TrackShip NG

Android pilot for Nigerian small businesses, based on the supplied TrackShip business plan and orange-and-white UI references. Version 0.2.0 adds distinct vendor and rider onboarding, role-specific workspaces, a stepped package flow, dispatch handoff and a redesigned dashboard/history/detail experience. Create shipments, record delivery checkpoints, share updates through Android's share sheet (including WhatsApp), and back up your delivery book.

## Test the APK

The generated file is `artifacts/TrackShip-NG-test.apk`. Copy it to an Android phone running **Android 8.0 or newer**, tap the file, and allow installation from that browser/file manager if Android asks. This is a locally signed test build, not a Play Store release. The signing identity is retained outside the repository at `/workspace/trackship-signing`; retain it to install future builds over this one. A new key requires uninstalling the old build, which removes its data. Export a backup first.

1. On first launch, continue through the introduction and choose **Vendor** or **Rider**.
2. Vendors set up their business, contact and pickup details. Riders set up personal contact, delivery area, vehicle and registration details.
3. Vendor **+** creates a package through package details → delivery details → service/rider → review/confirmation.
4. A rider sees only same-device shipments assigned to their phone number and deliveries explicitly added with a private vendor dispatch link.
5. Record checkpoints in order: Picked up → In transit → Out for delivery → Delivered. Vendors can also cancel an unfinished delivery.
6. **Profile** saves personal/business details, switches workspace, replays the introduction, and exports/restores backups.

See `docs/TEST-ON-YOUR-PHONE.md` for the full test guide. Updating 0.1.0 with this APK preserves its shipments and prompts the user for the new onboarding. Both roles are local profiles, not identity-verified server accounts.

Without a tracking service, data stays on the phone and sharing sends a **status message**, not a live link. There is no sample delivery data and no simulated GPS. Customer names, addresses and phone numbers are private app data. A private rider dispatch link grants its holder access to the recipient/address and checkpoint-writing capability; share it only with the assigned rider, never as a customer tracking link. Backups contain customer data and service access; keep them private.

## Live customer tracking

The included Node service provides a browser tracking page requiring no customer app. Host it behind HTTPS with persistent storage, then enter its HTTPS origin under **Profile → Live tracking service**. The app creates a random business access token and syncs shipments; later checkpoints queue locally and retry on startup, when connectivity returns, and every 30 seconds while the app is open. Background sync while the app is closed is not implemented. A public customer page refreshes every 15 seconds and shows the last synced status.

Public links use 256-bit random capability tokens. They expose business name, package description, cities and checkpoint timestamps, excluding recipient names, phone numbers, addresses, rider contacts and private notes. Anyone with a link can see that limited tracking information. Merchant API writes require the creating workspace's access token. Tokens are stored on the phone; export a backup to preserve access. This pilot supports one local vendor profile and one local rider profile per device. Verified identity, email/password login, SMS verification, account recovery and team accounts are not implemented. Local role switching is a device convenience, not an authentication boundary. A separate rider device receives access to exactly one delivery through a private dispatch capability link. The dispatch API can append valid delivery checkpoints only; it cannot edit recipient details, cancel shipments or write to another shipment. Merchant synchronization pulls later rider checkpoints before sending queued updates and rejects conflicting histories.

There is **no hosted public service configured in the APK**. The local service was tested, but has not been deployed to a public host. The in-app map is a labelled schematic route illustration with a real external map-search action. Service choices capture delivery preferences without displaying invented carrier prices or guaranteed arrival times. No subscription, Paystack charge, AdMob ad, WhatsApp bot, GPS or carrier integration is active. These require separate production integration and provider accounts.

## Develop and validate

Requirements: Node 24 (built-in SQLite), Java 21 runtime with `keytool`, Python 3, Bash, curl; Chromium for browser tests. No production npm dependencies.

```sh
cd /workspace/Trackship
npm ci
npm test
npm run test:ui
npm start
```

`npm start` binds `127.0.0.1:3000`. `GET /api/health` should return `{"service":"trackship-ng","version":"0.2.0"}`. In restricted command sandboxes, tests that open a local port and launch Chromium need the runner's supported network/process permission. UI screenshots are written to `artifacts/`. `CHROMIUM_PATH` can select an installed Chromium executable.

### Rebuild the APK

```sh
bash scripts/setup-android.sh
npm run build:apk
```

`setup-android.sh` downloads Android API 35, Android Build Tools 35.0.0 and the Eclipse Java compiler over TLS, checking their published SHA-1 package checksums. `TRACKSHIP_TOOLS` can override `/workspace/toolchains`. `build-apk.sh` compiles the native Android WebView shell and bundles all HTML/CSS/JavaScript as offline assets, converts Java classes to DEX, aligns the package, signs with the local test key and verifies the resulting signature. No Expo/EAS account or cloud build subscription is required. The app blocks remote pages from loading inside its bridged WebView; customer pages open in the external browser.

### Host the service

Run `node server/server.mjs` on a persistent Node 24 host behind an HTTPS reverse proxy. Configuration:

| Variable | Default | Purpose |
| --- | --- | --- |
| `HOST` | `127.0.0.1` | Bind address; set `0.0.0.0` in a container |
| `PORT` | `3000` | HTTP port behind HTTPS termination |
| `DATA_DIR` | `.data` | Persistent private directory for SQLite and WAL files |
| `ALLOWED_ORIGINS` | `https://appassets.trackship.ng` | Comma-separated allowed browser origins; preserve the app origin |

The bundled Dockerfile is an optional deployment recipe; its container build has not been validated in this task. Mount durable storage at `/data`, terminate HTTPS at your host, and restrict the HTTP port to that proxy. Do not expose the SQLite directory as static files. Back up the database using SQLite's supported backup facilities. Preserve the database across redeployments. Do not publish merchant backups or signing keys.

The service includes request body limits, per-process IP rate limits, ownership checks, monotonic delivery histories and public-data minimization. Before a production launch, add verified business login/recovery, retention and deletion controls, operational backups, monitoring and deployment-level abuse controls. The current service intentionally permits creation of pilot workspaces without identity verification.

## Project layout

- `web/`: bundled app UI, customer tracking page and shared delivery rules.
- `android/`: Android manifest, icon, styles and native sharing/file integration.
- `server/`: HTTP API and persistent SQLite storage.
- `tests/`: delivery rules, service integration and end-to-end browser flows.
- `scripts/`: repeatable toolchain setup and APK build.
- `docs/`: scope and validation evidence.

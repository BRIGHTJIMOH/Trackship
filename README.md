# SendRack · 0.6.0

Android delivery app and Node backend for Nigerian vendors, riders and carriers. The app keeps the orange split-S identity, separate PIN-protected accounts, manual shipment baskets, custody handoffs and customer tracking links.

## This update

- Asynchronous PostgreSQL support for the hosted backend; SQLite retained for local development.
- Render Blueprint for a Node service and managed PostgreSQL database, with a real readiness check.
- Read-only SQLite migration preview, atomic import into an empty PostgreSQL target, row-count/checksum verification, rollback and identity-key verification.
- Public MapTiler map configuration alongside the small OpenStreetMap pilot fallback. Map display never supplies an invented GPS fix, route or ETA.
- The previous app package, signing identity, private origin, account/PIN storage and encrypted identity vault remain compatible. Android version code 11.

No Render resource, real charge, bank payout, SMS/email message or physical delivery journey was activated. The default APK service URL remains empty until the owner's hosting address is available. Vendor wallet funding is not implemented; its balance remains unavailable. Real customer links, remote GPS, verified payments and cross-phone accounts need the hosted backend/providers.

Public customer tracking needs no signup or SMS. Current cloud phone verification and delivery OTP still use the existing SMS compatibility flow. Email/password login, recovery and email delivery confirmation are pending before an SMS-free connected trial. No SMS provider is required by the Render Blueprint.

## Use

```sh
npm ci
npm test
npm run test:ui
npm start
```

Use Node 24. SQLite development data is kept in `.data/trackship.sqlite`; do not commit or expose it. `NODE_ENV=production` requires `DATABASE_URL` and never silently falls back to SQLite. See `.env.example` for non-secret settings. The server preserves the `trackship-ng` health identifier and existing TRACKSHIP_* configuration names for compatibility.

```sh
# With a disposable local PostgreSQL database selected privately:
npm run test:postgres
# With the production PostgreSQL connection selected privately:
npm run db:check
# Read-only preview of an existing backend SQLite file:
npm run db:import -- /private/path/trackship.sqlite
# Import into an empty target with the ORIGINAL identity encryption key configured:
npm run db:import -- /private/path/trackship.sqlite --apply
```

The importer preserves accounts, customer links, sessions/token hashes, shipment histories, payment rows, proofs, encrypted documents and earnings. It refuses unknown source tables, occupied targets and incorrect identity keys. Stop writes to the old backend during cutover and preserve a consistent backup. Its in-memory snapshot is intended for pilot-size data.

## Hosting and live GPS

Read [Render/PostgreSQL setup](docs/RENDER-POSTGRES.md) and [live tracking](docs/LIVE-TRACKING.md). The Blueprint selects paid web/database plans that the owner must review before applying. Render supplies a private database connection; external PostgreSQL connections require verified TLS. Keep database, payment and identity secrets out of chat, source control and APKs.

The current holder's phone supplies real GPS after explicit consent; customer links poll every five seconds. Fresh positions are shown, old positions expire after two minutes, and accepted custody transfers clear the previous holder's location. Every interstate handler must share their own phone location for continuous coverage. A parcel separated from the tracked phone needs an independent GPS device to be located.

`PUBLIC_MAPTILER_KEY` is an intentionally browser-visible, origin-restricted display key. Use a suitable map plan for scale. Google Maps billing is not required for this implementation. Test actual Android permissions, backgrounding, battery restrictions and a real route before demonstrating live tracking.

PostgreSQL reads have a separate pool. Mutations use a conservative shared advisory lock while the pilot's JSON records are updated; external-provider latency limits write throughput. Before high-volume use, introduce per-shipment row locking/normalized tables and outbox processing with load tests.

## APK

Build with Java 21, Python and the prepared Android toolchain:

```sh
npm run build:apk
# After the backend HTTPS address is known:
TRACKSHIP_SERVICE_URL=https://YOUR-SERVICE npm run build:apk
npm run test:apk
```

Output: `artifacts/SendRack-test.apk`. Repository download: `downloads/SendRack-v0.6.0.apk`. Install over the old app; uninstalling loses unsynced records and identity drafts. Preserve the existing signing key privately. The signed-APK UI check loads the bundled screen files and checks the split-S, current version, PIN migration and a retained shipment.

## Financial and identity limits

A payment/earnings ledger is not regulated escrow and does not alter Paystack settlement timing. Obtain a provider-supported holding arrangement before promising release-after-delivery. Payouts stay disabled until provider activation, approved rider identity and verified payout-account setup. Refund/dispute/reconciliation operations need review before real-money use. Identity uploads are encrypted submissions for review, not independent government verification. See [validation](docs/VALIDATION.md).

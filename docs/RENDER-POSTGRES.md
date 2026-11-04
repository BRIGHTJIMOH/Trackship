# SendRack: Render PostgreSQL setup

The backend can now run on PostgreSQL through asynchronous `pg` calls. SQLite remains the default for local development. The production process refuses to start without `DATABASE_URL`; an unavailable database never causes a silent SQLite fallback.

## What is prepared

- `render.yaml`: a Node web service and managed PostgreSQL 17 database in the same Frankfurt region, connected using Render's private connection string. No SQLite disk is needed on this web service.
- `/api/ready`: checks a live database query for Render's health check. `/api/health` identifies the service.
- Idempotent schema creation/upgrades on startup; database readiness check with `npm run db:check`.
- Transactional SQLite import with dry-run, an empty-target requirement, row-count/checksum verification, rollback and verification of the original identity encryption key.
- SQLite and real PostgreSQL regression tests, including two API instances competing for a shipment and confirming the same delivery.

The Blueprint selects paid plans. Review the current web/database price, storage and backup terms in Render before applying it. Nothing in this repository has created a paid service. Preserve backups and the identity encryption key outside the service. Do not recreate an existing service/database merely to apply a name change.

## When the Render account is ready

1. Connect `BRIGHTJIMOH/Trackship` and select the prepared `apk-test-v0.6.0` branch. Create the Blueprint from `render.yaml` after reviewing its plans. Render provisions the database and supplies `DATABASE_URL` privately.
2. `DATABASE_SSL=disable` in this Blueprint applies only to Render's private internal connection. Use `DATABASE_SSL=require` for an external/public PostgreSQL connection. TLS certificate verification is enabled in that mode; do not disable certificate verification.
3. Keep the generated identity/admin secrets private. If importing existing identity documents, replace the generated identity key with the original key before migration. The importer refuses a missing/wrong key rather than copying unreadable documents.
4. Confirm `/api/ready` returns `ready: true` and `database: postgres`. Run `npm run db:check` in the service environment. Never paste a database URL or key into chat, a screenshot, a commit or the Android app.
5. Add `PAYSTACK_SECRET_KEY` privately when the merchant account is available; start with test mode. Configure the Paystack webhook at `/api/payments/webhook`. Bank payouts remain disabled until identity review, account resolution and provider funding/approval are checked.
6. The backend uses Render's supplied HTTPS origin. Build the APK with `TRACKSHIP_SERVICE_URL=https://YOUR-SERVICE` only after that address is known. The Android origin `https://appassets.trackship.ng` stays unchanged to retain installed app data.
7. Optionally add `PUBLIC_MAPTILER_KEY` for commercial map display. This is a browser-visible, origin-restricted key. It is not a payment/server secret. Allow the installed app origin and the hosted tracking origin in the map provider's restrictions.

## Import an existing SQLite backend

App-local shipments stay in the phone; this command imports a hosted SQLite backend database. Preserve a consistent SQLite backup (including its WAL if copying an open database) and pause writes to the old service during cutover. Do not use a phone JSON backup as the database source.

Dry-run reads the existing source without changing it or the target:

```sh
npm run db:import -- /private/path/trackship.sqlite
```

After privately setting the target PostgreSQL connection and the original identity key, apply to an empty target:

```sh
npm run db:import -- /private/path/trackship.sqlite --apply
```

The importer creates the target schema, verifies the identity key if documents exist, refuses occupied targets, and copies known tables in one transaction. Accounts, session/token hashes, customer tracking capabilities, payments, proofs, encrypted identity ciphertext and earnings are preserved. Row counts and checksums must match before commit. The SQLite source is read-only and remains available for rollback. Existing identity rows must decrypt with the original key; that key cannot be reconstructed from the database.

After import, verify the readiness endpoint, a returning account, an existing customer link, protected identity review and financial totals before pointing clients at the new service. Keep the source backup; avoid writes to both systems after cutover. For a large source, schedule an operator-assisted migration with appropriate memory/storage capacity; this pilot importer snapshots rows in memory.

## Concurrency and capacity

PostgreSQL reads use a separate connection pool. Mutating HTTP requests are serialized per process and protected by a shared PostgreSQL advisory lock across instances. Explicit handoff/OTP/ledger transactions remain atomic. This protects the current JSON shipment update model, including during provider requests. It is intentionally conservative: provider latency limits write throughput. Before high-volume production, move to normalized shipment tables and per-shipment row locking/outbox processing, with load tests and operational monitoring.

## Current activation limits

No live hosting, Paystack charge, payout, real SMS/email or real road journey was performed. Provider tests use isolated substitutes. Customer tracking links work without signup or SMS once the service is hosted. This update does not replace SMS-based cloud account verification or delivery OTP with email: those compatibility flows remain and require the configured SMS provider. Email/password login, recovery and email delivery confirmation are a separate pending change before an SMS-free live trial. Local PIN access continues to work.

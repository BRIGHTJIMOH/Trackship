# Phase-one validation

> Historical phase-one checkpoint. The stacked [phase-two preview](PHASE-2.md) adds HTTP/UI/worker integration; it remains blocked on production.

Baseline remote head fetched from `apk-test-v0.7.0`: `00f45703645acdd31d4cf662f48dfc6ddf6c0740` (PR #6 merge). This identifies the Git deployment branch head; Render's actual running commit was not independently verified.

Commands completed locally:

- `npm test`: **66 tests; 62 passed, 4 skipped, zero failed**.
- `npm run test:ui`: passed Chromium mobile-viewport signup/upload/reload/login, role separation and existing payment/custody/OTP regressions with mocked providers.
- `npm run test:admin`: passed Chromium owner login, saved route/pricing forms, quotes, identity/shipment views, suspension, settlement records, audit and logout.
- `git diff --check`: passed.

New domain tests use real temporary SQLite files, the existing database abstraction and serialized concurrent promises. They exercise fresh/stale/future/withdrawn GPS, service area, vehicle and capacity eligibility, paid-only offers, radius expansion/decline, session revocation, simultaneous acceptance, offer withdrawal, intended-recipient pickup, ordered interstate custody, carrier permission revocation, rejection/expiry, old GPS clearing, verified customer contact, delivery-code timing, expiry/guess/resend limits, replacement-code invalidation, staff callback rejection, cancellation restrictions, incident freeze, concurrent completion, ledger-failure rollback, idempotency and separate handler/platform amounts. A completed record does not imply a successful bank payout.

Outbox tests cover encrypted storage, dedupe, delayed/obsolete jobs, provider failure/retry, lease recovery and late-worker fencing. Provider tests exercise FCM OAuth/JWT request construction and APNs ES256 request construction with simulated responses. They send no real push or SMS. Backup tests encrypt and restore a temporary SQLite fixture containing account, custody-history and ledger rows, check SQLite integrity and compare restored records, and reject wrong keys, tampering and overwrite. They do not restore Render PostgreSQL.

The current v3 HTTP regression test checks that unaffiliated riders receive only an area/fee preview before assignment, cannot read an assigned job and cannot replay its completed action to obtain private shipment information. Existing signed/idempotent payment webhook, provider-confirmed transfers and document/privacy regression tests also continue to pass.

Four PostgreSQL-environment checks are skipped without a disposable PostgreSQL connection (production-secure cookie configuration; multi-instance owner sessions/stale edits; import rollback; multi-instance assignment/earnings). The new engine has **not** been validated against a real PostgreSQL server or multiple OS processes. Docker socket access was unavailable and no PostgreSQL client/restore target was supplied. Its SQL uses the existing PostgreSQL-compatible adapter, but SQLite results are not evidence of PostgreSQL concurrency correctness.

No live Render, actual Android/iPhone, background GPS/permission revocation, actual native FCM/APNs delivery, bank transfer, production restore, identity retention or staff MFA enrollment tests were performed. Browser emulation and JavaScript native-vault contract tests are not physical-device validation. The original Android signing key remains absent.

## Activation status

| Feature | Status |
| --- | --- |
| Existing v3 dispatch preview/assigned-job/completed-action privacy checks | Implemented in existing HTTP path; not deployed by this PR |
| V5 assignment/custody/OTP/outbox domain | Implemented and locally simulated; not mounted or activated |
| V5 vendor/rider/customer/admin product screens and HTTP adapter | Remaining phase 2 |
| Durable worker entry point/supervision, installation tokens, browser notifications | Remaining phase 2 |
| FCM/APNs server adapters | Implemented; simulated provider tests only; no credentials/device integration |
| Genuine maps and existing tracking | Existing implementation retained; new v5 screens/navigation pending |
| Individual staff accounts/MFA, granular document reveal/retention | Remaining phase 3; domain rejects operations without injected MFA authorization |
| Encrypted file/SQLite backup and restore | Implemented; tested with local fixtures |
| Production PostgreSQL/offsite/signing backup and restore | Not performed; operations and original key recovery needed |
| Resources, database, existing encryption/signing identity | No resource/settings/key changes; no shipment conversion or production writes |

Read [setup and rollout](SETUP-AND-ROLLOUT.md) before attempting deployment. This draft intentionally has no new-workflow activation flag. Merging it alone cannot enable the v5 product journey.

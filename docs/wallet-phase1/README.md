# SendRack money-control layer — Phase 1

Internal foundation only. No wallet HTTP endpoints, bank integration, live funding,
withdrawals, customer balance migration or production migration is enabled.
The existing SendRack app, PostgreSQL tables and payment flows remain unchanged.
Source: server/wallet; additive PostgreSQL SQL: migrations/wallet/001_core.sql.

## Actual stack and phase boundary

This repository uses Node.js, pg and PostgreSQL, with SQLite for local legacy tests.
It does not contain the supplied NestJS/Prisma/Next.js/Redis/BullMQ stack. This phase
extends the existing stack as requested; the SQL migration is not a Prisma schema.
The wallet engine requires PostgreSQL, independently of the legacy database adapter.
No new hosting resources or paid services have been provisioned.

Phase 1 implements WalletProvider's seven requested methods, an in-memory
MockBankProvider, KYC-gated mock wallet creation, immutable balanced journals,
idempotency, short row-locked transactions, a platform fee ledger account, and
bank/ledger balance comparison. All amounts are integer NGN kobo, capped at
JavaScript's exact integer range. No automatic ledger correction is performed.

The bank is authoritative: bankBalanceKobo and ledgerBalanceKobo are separate.
spendableKobo is null if mismatched, unavailable or stale. This is an internal read
model, not authorization for a future payout. Future money operations must enforce
eligibility again under locks. Posting is an INTERNAL accounting primitive, never
an API that accepts customer-supplied funding claims. No live spend path exists.

Debit decreases customer/platform liabilities; credit increases them. The bank
control asset uses credit-minus-debit and normally has a negative signed balance.
This is accounting, not an overdraft. Customer and platform accounts have a database
CHECK ensuring available_kobo = balance_kobo - held_kobo cannot be negative.
Database triggers reject journal mutation, adding entries to sealed transactions,
unbalanced commits and manual balance-cache changes. Corrections require a new
balanced reversing journal. Use a dedicated non-owner database role for eventual
runtime deployment; privileged DB owners can disable triggers, so this is not a
claim of protection against database administrators.

## Explicit assumptions and unknowns

- “ProvidusUnity Bank” is the owner's supplied label; its legal identity and API
  capabilities have not been independently verified. No real endpoints are invented.
- Per-user wallets, NGN only, no provider-native holds: mock assumptions only.
  The provider interface must be adapted after bank documentation is obtained.
- Mock balances reset on process restart. Persisted mock wallet IDs cannot be used
  with a new mock instance: reset an isolated test schema and its test provider
  together. Never use this in-memory provider for real funds or production balances.
- KYC approval comes from an injected trusted server lookup, not a client flag.
  Existing identity review is not assumed to satisfy the bank's KYC requirements.
- Mock webhook signatures use raw-body HMAC-SHA256. This does not specify the real
  bank's algorithm. No webhook receiver or funding-credit workflow is enabled yet.
- The mock provides monotonic revision numbers and observation timestamps. Actual
  bank ordering/consistency guarantees need documentation. The default 30-second
  freshness window is an internal conservative test setting, not a bank SLA.
- Mock transfers are atomic in one process; uncertain outcomes must be queried or
  retried with the SAME key/reference. No safe live retry protocol is claimed.
- The platform fee account is a zero-balance ledger account, not a bank wallet or
  virtual account. Real business-wallet onboarding remains unknown.
- No virtual account numbers, real account names, bank tiers, payout limits, fees,
  approval thresholds, PIN/OTP rules or provider credentials are fabricated.
- The internal held_kobo column reserves the accounting model; Hold/HoldStage tables,
  lock lifecycle and custody integration are Phase 3, not implemented in this phase.
- Existing SendRack customer records are not copied or reinterpreted as bank funds.

## Review and tests

Install existing project dependencies. No new application package is required.
Run mock tests: node --test tests/wallet/phase1.test.mjs
Run the full wallet tests with WALLET_TEST_DATABASE_URL pointing to an ISOLATED
local/test PostgreSQL database. The test creates a random wallet_test_* schema and
removes only that schema afterward. Never point tests at a production database.

The PostgreSQL test covers repeat migrations, KYC rejection, concurrent wallet
creation, balanced postings, concurrent idempotency, conflicting keys, fractional
money rejection, immutability, sealing, direct balance tampering, unbalanced commit
rollback, competing debits, mismatch blocking, freshness, provider failure and
absence of DB locks while a provider request is pending. Provider tests cover
raw signature tampering, failed/pending results and uncertain-success retries.
Local validation used PostgreSQL 18.6; Render's PostgreSQL 17 has not been directly
tested. No Render deployment or live bank/network verification is claimed.

Do not auto-run this migration from server startup. migrateWallet(pool) is an
explicit reviewable helper for a later approved database deployment; it wraps all
DDL and version/checksum recording in one transaction with a migration lock.

## Remaining phases — stop after each

2. Funding webhook receiver, bank signature adapter, WebhookEvent deduplication,
   provider-confirmed credit exactly once, duplicate webhook tests.
3. Hold/HoldStage/transactional outbox; same-transaction custody Accept marks
   release-pending. Durable worker transfers with idempotency; released only after
   bank confirmation. Each accepted stage releases its handler; FINAL leg requires
   customer delivery OTP. Concurrency tests for holds and debits.
4. Payout lifecycle, account resolution, hashed PIN, OTP, bank KYC limits, pending
   outcomes, failure compensation; hold/withdrawal concurrency tests.
5. Role-restricted admin/finance/support screens, vendor/rider wallet screens,
   disputes, audited maker-checker decisions, limits/settings and UI corrections.
6. ReconciliationRun/Item, scheduled provider balance/transaction comparison,
   mismatches, alerts and monitoring. Test intentional mismatches.

Existing shared legacy advisory locks are not used by this engine. A durable queue
and worker choice must be reviewed against the existing free hosting constraints
before Phase 3. Redis/BullMQ provisioning is not implicitly authorized or required
by Phase 1. No production table drop is an acceptable migration rollback plan.

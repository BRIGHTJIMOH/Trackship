# SendRack wallet control — review build, phases 1–6

This code extends the actual existing Node.js/pg/Leaflet SendRack repository.
It does not migrate the app to NestJS, Prisma or Next.js. PostgreSQL is required
for wallets; the legacy SQLite development path remains available for app tests.

All six phases now have mock implementations and tests. THIS IS NOT A LIVE BANK
INTEGRATION. The deployed server does not enable these APIs, run migrations, start
a financial worker or seed customer funds. Mock HTTP/worker activation refuses
production mode. Original Render resources, plans, database, records, signing
identity and existing Paystack paths have not been changed or deployed.

## Where to edit

- server/wallet: provider contract/mock, ledger, funding, holds, worker, withdrawals,
  finance roles/auth/API, reconciliation and optional BullMQ dispatcher.
- migrations/wallet/001–006: additive, versioned wallet schema, constraints/triggers.
- admin/wallet.html/css/js: owner/finance dashboard at /admin/wallet.
- web/customer-wallet.mjs: wallet, withdrawal and Profile security views inside /app.
  The former /app/wallet bookmark redirects into /app; no separate wallet app exists.
- web/features.mjs: signed-in, capability-gated wallet entry. Existing /app stays.
- tests/wallet: PostgreSQL/Redis and browser checks; fixtures are explicitly synthetic.

## Money rules

The provider is the balance source of truth. Bank balance, ledger balance, reserved
balance and spendable amount are distinct. A stale/mismatched/unavailable bank
observation or unresolved reconciliation block makes spendable amount unavailable.
Balance refresh cannot clear a reconciliation block. Ledger entries are immutable,
balanced integer-kobo journals; corrections require a new reversing journal.
PostgreSQL CHECKs prevent negative user availability. Deferred constraints require
reserved cache to equal outstanding stage allocations plus pending payouts.

Shipment reservation uses the server route quote, including existing percentage
and flat fees. No client fee becomes authoritative. An accepted carrier handoff
queues the pickup handler's release; an accepted last-mile handoff queues the
carrier's release. Final intrastate/last-mile earnings AND SendRack's platform fee
require customer OTP. Custody changes and pending releases share the same database
transaction/client. Legacy shipments are not retroactively converted to wallet
holds, and wallet-funded deliveries do not also receive legacy Paystack earnings.

The worker claims a leased outbox task, releases SQL locks, calls the provider with
a stable key/reference, then settles only on confirmed success. Unknown outcomes
and bank-pending results retain the reservation. Transport retries reuse the same
key. Definitive rejection is not reissued under a fresh key automatically. Admin
can cancel a confirmed rejected stage task, then refund its unencumbered allocation;
uncertain transfers cannot be cancelled/refunded. A resumed uncertain task keeps its
original reference. A crash after bank success is recovered without a second debit.

A refund of an internal hold unlocks the vendor's existing bank-backed balance;
it is not a fabricated bank transfer. Pending/unknown bank transfers remain locked.

Withdrawals require approved configured KYC tier limits, beneficiary review,
scrypt-hashed transaction PIN and a separate expiring single-use OTP bound to the
quote. PIN enrollment/reset also requires OTP. Codes have resend/attempt limits;
PIN failures lock access. Per-transaction/daily/monthly limits count pending requests
as well as paid amounts, using Africa/Lagos calendar boundaries. All withdrawals
await finance approval in this review build. Rejection or definitive bank failure
unlocks the reservation; unknown/pending outcomes never do. No default limits or
approval threshold are invented. Enter the bank sheet values in Settings.

## Roles and admin actions

Owner access uses the existing owner session and CSRF checks, never the operator
bearer token. Separately named finance accounts use hashed passwords, short-lived
HttpOnly/SameSite cookies, CSRF/origin checks and database login limits. Disabling
staff revokes finance sessions. Finance access does not grant owner-dashboard access.

- Admin: policy and staff configuration, financial proposals/checking and read views.
- Finance: read views, disputes, financial proposals and independent checking.
- Support: read-only. Server permission checks apply even if a client fabricates UI.

Financial actions require reasons and idempotency keys. Amounts AT OR ABOVE the
configured threshold require a different authorised principal as checker. Settings
use revisions to reject stale edits. Audit records are immutable. Organisational
onboarding must ensure different named accounts represent different authorised
people; software cannot prove that two passwords belong to different humans.

Overview, wallets/detail, shipment holds/stages, filtered transaction explorer,
paginated CSV export, payout queue, disputes/custody evidence, reconciliation and
audit are available in the review UI. Exports are explicitly one filtered page.
CSV cells are escaped for formula prefixes. Only masked payout account details are
returned; private tracking/dispatch links and OTPs are omitted from custody evidence.
Existing /admin route/pricing forms remain the source for percentage and flat fees.

## Reconciliation and monitoring

Each run verifies provider balances AND complete paginated transactions against
funding receipts and outbox/ledger settlements, including the platform fee wallet.
Changing snapshots, missing history/pages, unrecorded credits/debits, inconsistent
states and amounts, and bank/ledger differences are flagged. No balance correction
is automatic. Only a fresh complete clean comparison can support owner/finance
resolution. Unresolved issues continue to block spending even after a bank refresh.
Runs, evidence observations, mismatch resolutions and audit references are durable.

The BullMQ adapter registers midnight Africa/Lagos reconciliation, performs startup
catch-up with a daily idempotency key, and sweeps PostgreSQL outbox work. Redis jobs
are dispatch hints; PostgreSQL is the durable source. Monitoring shows last completed
run/overdue status, open mismatches, failed transfers and transfers aged over 15 min.
An optional alert callback receives only run ID and mismatch count. External alert
routing has not been configured or sent. No production Redis/worker was provisioned.

## Configuration and remaining setup

See .env.example. npm start reads NO new wallet activation flag. Constructor inputs
are deliberately explicit; the example wallet secret variable names are suggested
bindings for a reviewed composition root, not silently enabled server settings.

A development composition uses one ISOLATED PostgreSQL database for both app and
wallets: migrateWallet(pool,{schema}), WalletLedger({pool,provider,kycLookup,schema}),
WalletFunding({ledger}), WalletHolds({ledger,platformProviderWalletId}),
WalletWithdrawals({ledger,pepper,deliverOtp}), WalletAdmin({ledger,holds}),
FinanceAuth({admin,secret}), and WalletReconciliation({admin,platformProviderWalletId}).
Pass {admin,auth,withdrawals,reconciliation} as walletControl, funding as walletFunding,
and holds as walletHolds to createApp. Supply those dependencies explicitly; do not
turn this mock composition into the live production startup.

kycLookup must be a TRUSTED server adapter returning the bank-approved KYC decision,
reference and tier. Existing SendRack identity submission/review is not assumed to
satisfy bank KYC. deliverOtp must look up the wallet owner's already verified contact
on the server and send through the configured provider; never accept a destination
from the caller. Existing providers.email uses RESEND_API_KEY and EMAIL_FROM. The
Resend test sender is restricted to the Resend account's own email. OTP verification
cannot be bypassed when delivery is missing. No real messages were sent in tests.

Bank API documentation/legal identity is still required. The owner used the names
"ProvidusUnity Bank" and later "Probitos Bank"; this has NOT been resolved by guessing.
Per-user mock wallets, HMAC-SHA256 mock webhooks, NGN only, monotonic mock revisions
and provider transaction IDs are MOCK assumptions. Real pooled/per-user structure,
holds, finality, idempotency, pagination, reversal/chargebacks, authentication and
corporate fee-wallet onboarding require a documented real adapter before activation.
No bank URLs, virtual account numbers, bank tiers, API keys or live service claims
have been fabricated. The mock is IN MEMORY and resets on API process restart;
reset its isolated test schema/provider together. Worker restart tests preserve
that mock bank instance; this is not real-bank durability certification.

Live activation also needs PostgreSQL 17 validation, runtime least-privilege DB role,
reviewed migrations/backup/restore, OTP delivery configuration, staff onboarding,
bank-approved policy values and real bank sandbox tests. Existing table/schema drops
are not a rollback strategy for customer money; use forward fixes and journal reversals.

## Hosting and cost boundary

No paid service or Render plan change has been made. Local PostgreSQL/Redis/Chromium
used only development resources. Render's sleeping free web process cannot promise
always-on payout processing or midnight jobs. A production Redis endpoint plus an
always-on worker/scheduler requires a provider/plan decision and a cost quote BEFORE
provisioning. This change intentionally does not provision them or claim a free
always-on guarantee. The PostgreSQL 18.6 / Redis 7.2.7 test results are not Render
PostgreSQL 17 validation, physical-device certification or bank approval.

## Reproduce verification

Use disposable LOCAL databases only. Test fixtures create/drop randomly named
wallet_test_*, funding_test_*, control_test_* and sendrack_test_* schemas, preserving
other schemas. Redis tests use a random queue prefix, never FLUSHDB/FLUSHALL.

- WALLET_TEST_DATABASE_URL: disposable PostgreSQL URL for new wallet integration tests.
- SENDRACK_TEST_POSTGRES_URL: disposable PostgreSQL URL for legacy app/real custody tests.
- WALLET_TEST_REDIS_PORT: loopback disposable Redis port for actual BullMQ tests.
- npm run test:wallet
- npm test
- node tests/wallet/finance-ui.mjs (with both PostgreSQL test variables)

Validated locally: 35 wallet/finance/Redis tests and 66 existing app tests, zero
skipped with all test services configured. Browser checks at 1366x768, 1920x1080,
and 390x844 include drafts/focus/scroll/dialog retention, connection failure,
PIN enrollment, beneficiary review and OTP-protected pending withdrawal. Preview
screenshots use synthetic data and remain labelled MOCK. No live Render, real
bank, iPhone hardware or Android physical-device verification is claimed here.

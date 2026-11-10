# Wallet control build (mock review only)

Phase 3: additive Hold/HoldStage/outbox SQL, concurrent-reservation constraints,
server-priced shipment hooks, same-transaction custody release-pending, final OTP
for final leg and platform fee, provider-confirmed settlement and stable retry keys.
Legacy shipments and existing Paystack earnings are never duplicated into wallets.
BullMQ dispatcher is optional; PostgreSQL outbox is durable and sweepable after
Redis loss. Redis has not been provisioned on Render. No production activation.

Previously skipped app tests were gated by SENDRACK_TEST_POSTGRES_URL. With a
synthetic local PostgreSQL 18.6 database the full existing suite passes 66/66,
including secure cookies, cross-instance sessions/edits, import rollback and
cross-instance exactly-once pickup/earnings. Render PostgreSQL 17 is not yet tested.

Owner confirmed: platform fee releases after final customer OTP. Withdrawal KYC
limits and maker-checker threshold must be entered by owner from the bank sheet;
no business limits are invented. Partner legal/API identity remains unresolved
(owner has used ProvidusUnity Bank and Probitos Bank); no real bank adapter exists.

Phase 4: bank-name resolution quotes, hashed six-digit transaction PIN with lockout,
OTP enrollment/reset and quote-bound withdrawal OTP (expiry, attempt limits, resend
limits), owner-configured per-tier per-transaction/daily/monthly limits, pending
approval reservations, provider-confirmed debit and confirmed-failure unlock. Limits
use Africa/Lagos calendar boundaries and include pending approvals/payouts; owner
must check this against the bank sheet. All withdrawals require finance approval
in this conservative review build. Database deferred constraints ensure held cache
matches outstanding shipment allocations and pending withdrawals, blocking manual
unlock of reserved funds. Tests cover missing policy, single-use codes, PIN lockout,
expiry and simultaneous hold/withdrawal. No bank transfer on request submission.

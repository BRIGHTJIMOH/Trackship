# Phase 2 — verified mock funding and webhooks

Phase 2 extends Phase 1 on `wallet-phase2`. It does not activate a live bank or
migrate production data. The real partner's legal identity, API, virtual accounts,
webhook format/signature, transaction finality, fees and reversal events remain
undocumented. No real-bank contract has been invented.

## Implemented behaviour

1. Read the exact request bytes, enforce a 64 KiB limit and verify the mock
   HMAC-SHA256 signature before parsing JSON or touching financial records.
2. Validate the signed event's shape, currency, integer kobo and registered wallet.
3. Query the mock bank's paginated transaction history to confirm a successful
   incoming FUNDING credit for that wallet, provider transaction ID and exact amount.
   Transfers, pending transactions and client assertions cannot fund a wallet.
4. Obtain a bank balance snapshot. Both provider reads finish before database locks.
5. In one PostgreSQL transaction, claim event/receipt locks, create a balanced
   immutable journal, record the provider receipt and record the webhook event.
   A database failure rolls back all four, including cached ledger balances.
6. Return HTTP 200 only after commit (or for a previously committed duplicate).
   A lost HTTP response is safe: the provider can retry the same signed event.

Two durable uniqueness rules protect money: `webhook_events.event_id` and
`funding_receipts(provider_id, provider_transaction_id)`. A new event ID for an
already credited bank transaction produces a duplicate event record, not another
journal. Reusing an event ID with changed accounting details is rejected. Harmless
JSON whitespace/key ordering changes do not create another credit. Duplicate
replays continue to work when provider history is temporarily unavailable, using
the already committed immutable receipt. No raw webhook, signature, email, bank
account number or request header is stored. Hashes and accounting evidence remain.

Bank balances and ledger balances remain separate. Funding records the independently
confirmed credit even when the present bank balance differs; it never derives a
credit from a balance delta. Mismatches keep spendable funds unavailable for later
investigation. A whole-bank reconciliation job remains Phase 6.

## Endpoint and safe activation

The ordinary `npm start` server DOES NOT mount a wallet webhook. No new environment
variable enables it. Existing `/`, `/app`, `/admin`, tracking/payment callbacks and
legacy tables continue to work as before.

For isolated development tests only, build a `WalletFunding({ledger})` and pass it
as `walletFunding` to `createApp`. This mounts:

`POST /api/wallet/webhooks/mock-bank`

The factory rejects production mode. It runs outside the legacy global write lock,
using the ledger's short PostgreSQL transactions. No mock credit/mint endpoint is
provided. Only trusted test code can call `MockBankProvider.fundForTest` to place
synthetic funds in the in-memory mock bank before creating a notification.

Required header: `Content-Type: application/json`.
Mock signature header: `x-sendrack-mock-signature`, lowercase hex HMAC-SHA256 over
EXACT raw body bytes, using the test provider's private configured mock secret.
These are MOCK definitions; the real bank may use entirely different requirements.

Example event (all values illustrative, not usable bank identifiers):

```json
{
  "version": 1,
  "type": "wallet.funded",
  "mode": "mock",
  "eventId": "MOCK_EVENT_ID",
  "providerTransactionId": "MOCK_PROVIDER_TRANSACTION_ID",
  "walletId": "MOCK_PROVIDER_WALLET_ID",
  "amountKobo": 10000,
  "currency": "NGN",
  "occurredAt": 1
}
```

Use synthetic fixture code rather than sending real transfers. The mock bank is
in-memory and resets on restart; use an isolated database and reset the matching
test schema/provider together. No real funds or bank credentials are needed.

## Responses and retries

- 200: committed credit or duplicate; response has `accepted` and `duplicate` only.
- 400/401/409: invalid event/signature/conflicting or unconfirmed details; no credit.
- 405/413/415: wrong method, oversized body or unsupported content/encoding.
- 429: per-process source-IP limit, default 60/minute; retry after 60 seconds.
- 503: temporary provider/database failure or confirmation not yet visible; retry
  the SAME event. HTTP errors do not disclose raw provider/database exceptions.

The limiter uses the direct socket peer, never an untrusted forwarded-IP header;
under a proxy its budget is shared by that peer. It is NOT a distributed production
rate limiter. A 10-second body-read deadline limits stalled requests. Future real
adapter calls require documented timeouts/retries, provider source validation and
production ingress controls. A deployment composition root is deliberately absent.

## Migration and testing

`migrateWallet` now applies 001 and 002 in order, with version/checksum verification
inside the same migration transaction. 001 is unchanged. 002 adds tables, indexes
and triggers only; existing account/app tables and saved data are not rewritten.
No migration runs at app startup. Do not point test commands at Render/production.

```sh
npm run test:wallet
# For all wallet cases, set WALLET_TEST_DATABASE_URL securely to a disposable local
# PostgreSQL database in your shell/environment, then run the same command.
```

The tests create and remove only random `wallet_test_*`/`funding_test_*` schemas.
Run `npm test` for existing app regression coverage. Local integration validation
uses PostgreSQL 18.6, not Render's PostgreSQL 17 or the real bank.

## Remaining boundaries

No user funding button, virtual-account assignment, custody hold/release,
withdrawal, bank payout, admin finance screen or background reconciliation job is
enabled here. Incoming credits are available only as internal accounting records.
Bank chargebacks/reversals need their own provider-confirmed flow before live
funding can be enabled; never mutate the original receipt or journal.

The provider-history lookup is bounded to 10 pages of 100 items by default. Failure
to find a transaction returns a retryable response, never a guessed credit. Real
providers must document pagination/lookup consistency and finality; an adapter or
reconciliation process must address older/unlisted transactions before launch.
No Redis/BullMQ, paid infrastructure, live secrets or new Render resources were
provisioned. Phase 3 remains a separate review: holds, custody-linked pending
releases, transactional outbox and confirmed stage transfers.

import {createHash} from 'node:crypto';
import {BANK_ACCOUNT} from './ledger.mjs';
import {WalletError, kobo} from './provider.mjs';

const digest = value => createHash('sha256').update(value).digest('hex');
const identifier = value => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/.test(value);
const MAX_BODY = 65536;

// Mock contract only. This is not an assumed real-bank payload or signature format.
export class WalletFunding {
  constructor({ledger, maxPages = 10}) {
    if (ledger?.provider?.id !== 'mock-bank' || ledger.provider.mode !== 'mock') {
      throw new WalletError('Only isolated mock funding is supported.', 503);
    }
    if (!Number.isSafeInteger(maxPages) || maxPages < 1 || maxPages > 100) {
      throw new WalletError('Invalid provider lookup limit.');
    }
    this.ledger = ledger;
    this.provider = ledger.provider;
    this.pool = ledger.pool;
    this.schema = ledger.schema;
    this.maxPages = maxPages;
  }

  parse(rawBody) {
    let body;
    try { body = JSON.parse(rawBody.toString('utf8')); }
    catch { throw new WalletError('Invalid webhook JSON.'); }
    if (!body || body.version !== 1 || body.type !== 'wallet.funded' || body.mode !== 'mock' ||
        !identifier(body.eventId) || !identifier(body.providerTransactionId) || !identifier(body.walletId) ||
        body.currency !== 'NGN' || !Number.isSafeInteger(body.occurredAt) || body.occurredAt < 0 ||
        body.occurredAt > this.ledger.clock() + 300000) {
      throw new WalletError('Invalid mock funding event.');
    }
    kobo(body.amountKobo);
    // Retain only identifiers and accounting evidence; never persist the raw body or signature.
    return {
      version: 1, type: 'wallet.funded', mode: 'mock', eventId: body.eventId,
      providerTransactionId: body.providerTransactionId, walletId: body.walletId,
      amountKobo: body.amountKobo, currency: 'NGN', occurredAt: body.occurredAt
    };
  }

  async receipt(transactionId) {
    return (await this.pool.query(
      `SELECT r.*, w.provider_wallet_id FROM ${this.schema}.funding_receipts r
       JOIN ${this.schema}.wallets w ON w.id = r.wallet_id
       WHERE r.provider_id = $1 AND r.provider_transaction_id = $2`,
      [this.provider.id, transactionId]
    )).rows[0];
  }

  checkReceipt(receipt, event) {
    if (receipt.provider_wallet_id !== event.walletId || Number(receipt.amount_kobo) !== event.amountKobo ||
        receipt.currency !== event.currency) {
      throw new WalletError('Funding receipt conflicts with the confirmed transaction.', 409);
    }
  }

  async confirmFunding(event) {
    let cursor = 0;
    for (let page = 0; page < this.maxPages; page++) {
      const result = await this.provider.listTransactions({walletId: event.walletId, cursor, limit: 100});
      if (result?.mode !== 'mock' || !Array.isArray(result.items) || result.items.length > 100) {
        throw new WalletError('Invalid provider transaction response.', 502);
      }
      const match = result.items.find(item => item.providerTransactionId === event.providerTransactionId);
      if (match) {
        if (match.walletId !== event.walletId || match.direction !== 'in' || match.kind !== 'funding' ||
            match.status !== 'success' || match.currency !== event.currency || match.amountKobo !== event.amountKobo) {
          throw new WalletError('Provider has not confirmed this funding credit.', 409);
        }
        return;
      }
      if (result.nextCursor === null) break;
      if (!Number.isSafeInteger(result.nextCursor) || result.nextCursor <= cursor) {
        throw new WalletError('Invalid provider pagination.', 502);
      }
      cursor = result.nextCursor;
    }
    // Retryable: a genuine notification may arrive before provider history is consistent.
    throw new WalletError('Funding confirmation is not available yet. Retry the event.', 503);
  }

  async receive({rawBody, signature}) {
    if (!Buffer.isBuffer(rawBody) || rawBody.length > MAX_BODY) throw new WalletError('Webhook is too large.', 413);
    if (!await this.provider.verifyWebhook({rawBody, signature})) throw new WalletError('Invalid webhook signature.', 401);
    const event = this.parse(rawBody);
    const eventHash = digest(JSON.stringify(event));
    const payloadHash = digest(rawBody);
    const priorEvent = (await this.pool.query(
      `SELECT event_hash FROM ${this.schema}.webhook_events WHERE event_id = $1`, [event.eventId]
    )).rows[0];
    if (priorEvent) {
      if (priorEvent.event_hash !== eventHash) throw new WalletError('Webhook event ID was reused with different details.', 409);
      return {accepted: true, duplicate: true};
    }
    const wallet = (await this.pool.query(
      `SELECT id, account_id FROM ${this.schema}.wallets WHERE provider_id = $1 AND provider_wallet_id = $2`,
      [this.provider.id, event.walletId]
    )).rows[0];
    if (!wallet) throw new WalletError('Funding wallet is not registered.', 409);

    const known = await this.receipt(event.providerTransactionId);
    let bank;
    if (known) this.checkReceipt(known, event);
    else {
      // Both provider reads finish BEFORE entering a database transaction or acquiring locks.
      try {
        await this.confirmFunding(event);
        bank = this.ledger.snapshot(await this.provider.getBalance({walletId: event.walletId}), event.walletId);
      } catch (error) {
        if (!(error instanceof WalletError) || error.status >= 500) {
          // Operational state only: no receipt or money is recorded on a failed lookup.
          await this.pool.query(`UPDATE ${this.schema}.wallets SET bank_status = 'unavailable' WHERE id = $1`, [wallet.id]);
        }
        throw error;
      }
    }

    return this.ledger.transaction(async client => {
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', ['funding-event:' + event.eventId]);
      const repeated = (await client.query(
        `SELECT event_hash FROM ${this.schema}.webhook_events WHERE event_id = $1`, [event.eventId]
      )).rows[0];
      if (repeated) {
        if (repeated.event_hash !== eventHash) throw new WalletError('Webhook event ID was reused with different details.', 409);
        return {accepted: true, duplicate: true};
      }
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',
        ['funding-receipt:' + this.provider.id + ':' + event.providerTransactionId]);
      const receipt = (await client.query(
        `SELECT r.*, w.provider_wallet_id FROM ${this.schema}.funding_receipts r
         JOIN ${this.schema}.wallets w ON w.id = r.wallet_id
         WHERE r.provider_id = $1 AND r.provider_transaction_id = $2`,
        [this.provider.id, event.providerTransactionId]
      )).rows[0];
      if (receipt) this.checkReceipt(receipt, event);
      else {
        if (!bank) throw new WalletError('Funding confirmation must be retried.', 503);
        const key = 'funding:' + digest(JSON.stringify([this.provider.id, event.providerTransactionId]));
        const journal = await this.ledger.postInTransaction(client, {
          idempotencyKey: key, kind: 'wallet_funding', reference: key, memo: 'Confirmed mock bank funding',
          lines: [{accountId: BANK_ACCOUNT, debitKobo: event.amountKobo},
            {accountId: wallet.account_id, creditKobo: event.amountKobo}]
        });
        // A journal without its receipt can only come from another internal caller: fail closed.
        if (journal.replayed) throw new WalletError('Funding journal requires investigation.', 409);
        await client.query(
          `INSERT INTO ${this.schema}.funding_receipts
           (provider_id, provider_transaction_id, wallet_id, amount_kobo, currency, journal_id)
           VALUES ($1,$2,$3,$4,$5,$6)`,
          [this.provider.id, event.providerTransactionId, wallet.id, event.amountKobo, event.currency, journal.id]
        );
        // Account rows were locked by the journal. Keep the same account -> wallet lock order
        // for balance refreshes, avoiding deadlocks with concurrent funding and polling.
        const current = (await client.query(
          `SELECT bank_revision, bank_observed_at FROM ${this.schema}.wallets WHERE id = $1 FOR UPDATE`, [wallet.id]
        )).rows[0];
        if (bank.revision >= Number(current.bank_revision) && bank.observedAt >= Number(current.bank_observed_at)) {
          await client.query(
            `UPDATE ${this.schema}.wallets w SET bank_balance_kobo = $2, bank_observed_at = $3,
             bank_revision = $4, bank_status = CASE WHEN a.balance_kobo = $2 THEN 'matched' ELSE 'mismatch' END
             FROM ${this.schema}.accounts a WHERE w.id = $1 AND a.id = w.account_id`,
            [wallet.id, bank.balanceKobo, bank.observedAt, bank.revision]
          );
        }
      }
      await client.query(
        `INSERT INTO ${this.schema}.webhook_events
         (event_id, provider_id, provider_transaction_id, event_hash, payload_hash, outcome)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [event.eventId, this.provider.id, event.providerTransactionId, eventHash, payloadHash, receipt ? 'duplicate' : 'credited']
      );
      return {accepted: true, duplicate: Boolean(receipt)};
    });
  }
}

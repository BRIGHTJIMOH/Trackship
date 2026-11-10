import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID, createHmac, createHash} from 'node:crypto';
import {mkdtemp, rm, readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import http from 'node:http';
import pg from 'pg';
import {migrateWallet} from '../../server/wallet/migrate.mjs';
import {WalletLedger, BANK_ACCOUNT} from '../../server/wallet/ledger.mjs';
import {MockBankProvider} from '../../server/wallet/mock-bank-provider.mjs';
import {WalletFunding} from '../../server/wallet/funding.mjs';
import {createFundingWebhookHandler, FUNDING_WEBHOOK_PATH} from '../../server/wallet/funding-http.mjs';
import {createApp} from '../../server/server.mjs';

const secret = 'isolated-mock-funding-secret-not-for-production';
const sign = rawBody => createHmac('sha256', secret).update(rawBody).digest('hex');
const request = event => {const rawBody = Buffer.from(JSON.stringify(event)); return {rawBody, signature: sign(rawBody)};};
async function fixture(t) {
  const pool = new pg.Pool({connectionString: process.env.WALLET_TEST_DATABASE_URL, max: 12});
  const schema = 'funding_test_' + randomUUID().replaceAll('-', '');
  t.after(async () => {await pool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`); await pool.end();});
  await migrateWallet(pool, {schema});
  const provider = new MockBankProvider({webhookSecret: secret, allowTestOperations: true});
  const ledger = new WalletLedger({pool, schema, provider, kycLookup: async () => ({status: 'approved', reference: 'test-only-kyc'})});
  const funding = new WalletFunding({ledger});
  const wallet = await ledger.createWallet({role: 'vendor', ownerId: 'synthetic-vendor'});
  function credit(amount = 5000, id = randomUUID()) {
    const result = provider.fundForTest(wallet.providerWalletId, amount, id);
    return {version: 1, type: 'wallet.funded', mode: 'mock', eventId: 'event-' + id,
      providerTransactionId: result.providerTransactionId, walletId: wallet.providerWalletId,
      amountKobo: amount, currency: 'NGN', occurredAt: Date.now()};
  }
  const count = async table => Number((await pool.query(`SELECT count(*) n FROM ${schema}.${table}`)).rows[0].n);
  return {pool, schema, provider, ledger, funding, wallet, credit, count};
}
const integration = (name, run) => test(name, {skip: !process.env.WALLET_TEST_DATABASE_URL}, async t => run(t, await fixture(t)));

integration('funding: concurrent duplicate events credit once and survive provider outage on replay', async (t, f) => {
  const event = f.credit();
  const results = await Promise.all(Array.from({length: 12}, () => f.funding.receive(request(event))));
  assert.equal(results.filter(r => !r.duplicate).length, 1);
  assert.equal(await f.count('webhook_events'), 1); assert.equal(await f.count('funding_receipts'), 1);
  assert.equal(await f.count('transactions'), 1); assert.equal(await f.count('ledger_entries'), 2);
  const balance = await f.ledger.read(f.wallet.id);
  assert.equal(balance.ledgerBalanceKobo, 5000); assert.equal(balance.bankBalanceKobo, 5000); assert.equal(balance.spendableKobo, 5000);
  f.provider.listTransactions = async () => {throw new Error('provider offline');};
  assert.equal((await f.funding.receive(request(event))).duplicate, true);
  // Harmless JSON formatting changes do not turn a replay into a new credit.
  const rawBody = Buffer.from(JSON.stringify(event, null, 2));
  assert.equal((await f.funding.receive({rawBody, signature: sign(rawBody)})).duplicate, true);
});

integration('funding: distinct event IDs for the same provider transaction remain one credit', async (t, f) => {
  const event = f.credit();
  const results = await Promise.all(Array.from({length: 8}, (_, i) => f.funding.receive(request({...event, eventId: 'alias-' + i}))));
  assert.equal(results.filter(r => !r.duplicate).length, 1); assert.equal(await f.count('webhook_events'), 8);
  assert.equal(await f.count('funding_receipts'), 1); assert.equal(await f.count('transactions'), 1);
  f.provider.listTransactions = async () => {throw new Error('offline');};
  assert.equal((await f.funding.receive(request({...event, eventId: 'later-alias'}))).duplicate, true);
  await assert.rejects(f.funding.receive(request({...event, eventId: 'conflicting-alias', amountKobo: 1})), /conflicts/);
  assert.equal(await f.count('webhook_events'), 9);
});

integration('funding: reused event ID with different valid funding is rejected', async (t, f) => {
  const first = f.credit(100), second = f.credit(200);
  await f.funding.receive(request(first));
  await assert.rejects(f.funding.receive(request({...second, eventId: first.eventId})), /reused/);
  assert.equal((await f.ledger.read(f.wallet.id)).ledgerBalanceKobo, 100);
  await f.funding.receive(request(second)); assert.equal((await f.ledger.read(f.wallet.id)).ledgerBalanceKobo, 300);
});

integration('funding: missing/invalid signatures, tampered body and invalid signed payloads never credit', async (t, f) => {
  const event = f.credit();
  const signed = request(event);
  await assert.rejects(f.funding.receive({...signed, signature: undefined}), /signature/);
  await assert.rejects(f.funding.receive({...signed, rawBody: Buffer.from(JSON.stringify({...event, amountKobo: 1}))}), /signature/);
  const invalid = Buffer.from('{invalid');
  await assert.rejects(f.funding.receive({rawBody: invalid, signature: sign(invalid)}), /JSON/);
  for (const patch of [{amountKobo: 0}, {amountKobo: -1}, {amountKobo: 0.5}, {amountKobo: Number.MAX_SAFE_INTEGER + 1},
    {currency: 'USD'}, {mode: 'live'}, {type: 'transfer.completed'}, {occurredAt: Date.now() + 600000}, {eventId: '../private'}]) {
    await assert.rejects(f.funding.receive(request({...event, ...patch})));
  }
  await assert.rejects(f.funding.receive({rawBody: Buffer.alloc(65537), signature: 'a'.repeat(64)}), /large/);
  assert.equal(await f.count('webhook_events'), 0); assert.equal(await f.count('transactions'), 0);
});

integration('funding: signed but unconfirmed, wrong amount, currency or wallet cannot create money', async (t, f) => {
  const event = f.credit();
  await assert.rejects(f.funding.receive(request({...event, providerTransactionId: 'made-up'})), /not available/);
  await assert.rejects(f.funding.receive(request({...event, amountKobo: 5001})), /not confirmed/);
  const other = await f.ledger.createWallet({role: 'rider', ownerId: 'other'});
  await assert.rejects(f.funding.receive(request({...event, walletId: other.providerWalletId})), /not available/);
  await assert.rejects(f.funding.receive(request({...event, walletId: 'unregistered-wallet'})), /not registered/);
  const list = f.provider.listTransactions.bind(f.provider);
  for (const patch of [{status: 'pending'}, {status: 'failed'}, {kind: 'transfer'}, {direction: 'out'}, {currency: 'USD'}]) {
    f.provider.listTransactions = async input => {const r = await list(input); return {...r, items: r.items.map(item => ({...item, ...patch}))};};
    await assert.rejects(f.funding.receive(request(event)), /not confirmed/);
  }
  assert.equal(await f.count('transactions'), 0);
});

integration('funding: provider outage is retryable and does not acknowledge or partially credit', async (t, f) => {
  const event = f.credit(), original = f.provider.getBalance.bind(f.provider);
  f.provider.getBalance = async () => {throw new Error('synthetic provider outage');};
  await assert.rejects(f.funding.receive(request(event)), /outage/);
  assert.equal((await f.ledger.read(f.wallet.id)).state, 'unavailable');
  assert.equal((await f.ledger.read(f.wallet.id)).spendableKobo, null);
  assert.equal(await f.count('webhook_events'), 0); assert.equal(await f.count('transactions'), 0);
  f.provider.getBalance = original;
  assert.equal((await f.funding.receive(request(event))).duplicate, false);
  assert.equal((await f.ledger.read(f.wallet.id)).ledgerBalanceKobo, 5000);
});

integration('funding: database failure rolls back event, receipt, journal and balances together', async (t, f) => {
  const event = f.credit();
  await f.pool.query(`CREATE FUNCTION ${f.schema}.test_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic commit failure'; END; $$;
    CREATE CONSTRAINT TRIGGER test_fail AFTER INSERT ON ${f.schema}.webhook_events DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION ${f.schema}.test_fail()`);
  await assert.rejects(f.funding.receive(request(event)), /synthetic/);
  for (const table of ['webhook_events', 'funding_receipts', 'transactions', 'ledger_entries']) assert.equal(await f.count(table), 0);
  assert.equal((await f.ledger.read(f.wallet.id)).ledgerBalanceKobo, 0);
  await f.pool.query(`DROP TRIGGER test_fail ON ${f.schema}.webhook_events`);
  await f.funding.receive(request(event)); assert.equal((await f.ledger.read(f.wallet.id)).ledgerBalanceKobo, 5000);
});

integration('funding: independent concurrent credits and bank refresh do not deadlock or lose funds', async (t, f) => {
  const events = Array.from({length: 10}, () => f.credit(100));
  await Promise.all([...events.map(event => f.funding.receive(request(event))),
    ...Array.from({length: 4}, () => f.ledger.refreshBankBalance(f.wallet.id))]);
  assert.equal((await f.ledger.refreshBankBalance(f.wallet.id)).spendableKobo, 1000);
  assert.equal(await f.count('transactions'), 10);
});

integration('funding: paginated provider history is searched with bounded retryable failures', async (t, f) => {
  const event = f.credit(); const original = f.provider.listTransactions.bind(f.provider);
  f.provider.listTransactions = async input => input.cursor === 0 ? {mode: 'mock', items: [], nextCursor: 100} : original({...input, cursor: 0});
  await f.funding.receive(request(event));
  const second = f.credit(); f.provider.listTransactions = async () => ({mode: 'mock', items: [], nextCursor: 0});
  await assert.rejects(f.funding.receive(request(second)), /pagination/);
  const limited = new WalletFunding({ledger: f.ledger, maxPages: 2}); let calls = 0;
  f.provider.listTransactions = async ({cursor}) => {calls++; return {mode: 'mock', items: [], nextCursor: cursor + 100};};
  await assert.rejects(limited.receive(request(second)), /not available/); assert.equal(calls, 2);
});

integration('funding: durable evidence is immutable and raw webhook/customer data is not stored', async (t, f) => {
  const event = {...f.credit(), customerEmail: 'private@example.invalid', accountNumber: '0000000000'};
  await f.funding.receive(request(event));
  const row = (await f.pool.query(`SELECT * FROM ${f.schema}.webhook_events`)).rows[0];
  assert.equal(JSON.stringify(row).includes('private@example'), false);
  assert.equal('payload' in row, false); assert.equal('signature' in row, false);
  for (const table of ['webhook_events', 'funding_receipts']) {
    await assert.rejects(f.pool.query(`DELETE FROM ${f.schema}.${table}`), /immutable/);
    await assert.rejects(f.pool.query(`UPDATE ${f.schema}.${table} SET provider_id = 'mock-bank'`), /immutable/);
  }
  const journal = (await f.pool.query(`SELECT journal_id FROM ${f.schema}.funding_receipts`)).rows[0].journal_id;
  await assert.rejects(f.pool.query(`INSERT INTO ${f.schema}.funding_receipts(provider_id,provider_transaction_id,wallet_id,amount_kobo,currency,journal_id) VALUES('mock-bank','invalid-receipt',$1,1,'NGN',$2)`, [f.wallet.id, journal]));
  const unrelated = await f.ledger.post({idempotencyKey: 'unrelated-receipt-test', kind: 'wallet_funding', reference: 'test-unrelated',
    lines: [{accountId: BANK_ACCOUNT, debitKobo: 100}, {accountId: f.wallet.accountId, creditKobo: 100}]});
  await assert.rejects(f.pool.query(`INSERT INTO ${f.schema}.funding_receipts(provider_id,provider_transaction_id,wallet_id,amount_kobo,currency,journal_id) VALUES('mock-bank','wrong-amount-receipt',$1,99,'NGN',$2)`, [f.wallet.id, unrelated.id]), /match its sealed funding journal/);
});

integration('funding: provider lookup holds no database locks', async (t, f) => {
  const event = f.credit(); let entered, release;
  const waiting = new Promise(resolve => entered = resolve), gate = new Promise(resolve => release = resolve);
  const original = f.provider.listTransactions.bind(f.provider);
  f.provider.listTransactions = async input => {entered(); await gate; return original(input);};
  const pending = f.funding.receive(request(event)); await waiting;
  try {
    await Promise.race([f.ledger.post({idempotencyKey: 'unrelated-test-post', kind: 'test_fixture', reference: 'unrelated',
      lines: [{accountId: BANK_ACCOUNT, debitKobo: 1}, {accountId: f.wallet.accountId, creditKobo: 1}]}),
    new Promise((_, reject) => {const timer = setTimeout(() => reject(new Error('network lookup held lock')), 2000); timer.unref();})]);
  } finally {release(); await pending;}
  // Deliberate unrelated ledger fixture is NOT bank money: mismatch stays blocked.
  assert.equal((await f.ledger.read(f.wallet.id)).state, 'mismatch');
});

async function listen(server, t) {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => {await new Promise(resolve => server.close(resolve)); await server.databaseClosed;});
  return 'http://127.0.0.1:' + server.address().port;
}

test('funding HTTP: raw body, method/content limits, rate limit, generic errors and production rejection', async t => {
  assert.throws(() => createFundingWebhookHandler({funding: {provider: {mode: 'mock'}}, env: {NODE_ENV: 'production'}}), /production/);
  let calls = 0;
  const funding = {provider: {mode: 'mock'}, receive: async ({rawBody, signature}) => {
    calls++; assert.ok(Buffer.isBuffer(rawBody));
    if (signature !== sign(rawBody)) {const {WalletError} = await import('../../server/wallet/provider.mjs'); throw new WalletError('Invalid webhook signature.', 401);}
    if (rawBody.toString() === 'outage') throw new Error('secret internal exception');
    return {accepted: true, duplicate: false};
  }};
  const handler = createFundingWebhookHandler({funding, rateLimit: 20});
  const server = http.createServer((req, res) => handler.handle(req, res));
  const base = await listen(server, t);
  const send = (body, headers = {}) => fetch(base, {method: 'POST', body, headers: {'Content-Type': 'application/json', 'x-sendrack-mock-signature': sign(Buffer.from(body)), ...headers}});
  assert.equal((await fetch(base)).status, 405);
  assert.equal((await send('{}', {'Content-Type': 'text/plain'})).status, 415);
  assert.equal((await send('{}', {'Content-Encoding': 'gzip'})).status, 415);
  assert.equal((await send('{}', {'x-sendrack-mock-signature': 'invalid'})).status, 401);
  assert.equal((await send('x'.repeat(65537))).status, 413);
  const chunkedStatus = await new Promise((resolve, reject) => {
    const req = http.request(base, {method: 'POST', headers: {'Content-Type': 'application/json'}}, res => {res.resume(); resolve(res.statusCode);});
    req.on('error', reject); req.write('x'.repeat(33000)); req.end('y'.repeat(33000));
  });
  assert.equal(chunkedStatus, 413);
  const response = await send('{ "unchanged raw bytes": true }');
  assert.equal(response.status, 200); assert.equal(response.headers.get('cache-control'), 'no-store');
  const outage = await send('outage'); assert.equal(outage.status, 503); assert.equal(outage.headers.get('retry-after'), '60');
  assert.equal((await outage.text()).includes('secret'), false);
  assert.equal(calls, 3);
  const limited = createFundingWebhookHandler({funding, rateLimit: 1});
  const limitedServer = http.createServer((req, res) => limited.handle(req, res));
  const limitedBase = await listen(limitedServer, t);
  await fetch(limitedBase); const rejected = await fetch(limitedBase);
  assert.equal(rejected.status, 429); assert.equal(rejected.headers.get('retry-after'), '60');
});

integration('funding HTTP: existing app mounts only by explicit injection; default route remains disabled', async (t, f) => {
  const dataDir = await mkdtemp(path.join(tmpdir(), 'sendrack-funding-http-'));
  t.after(() => rm(dataDir, {recursive: true, force: true}));
  const env = {NODE_ENV: 'test'};
  const disabled = await createApp({env, dataDir: path.join(dataDir, 'disabled')});
  const disabledBase = await listen(disabled, t);
  assert.equal((await fetch(disabledBase + FUNDING_WEBHOOK_PATH, {method: 'POST'})).status, 404);
  const enabled = await createApp({env, dataDir: path.join(dataDir, 'enabled'), walletFunding: f.funding});
  const enabledBase = await listen(enabled, t), signed = request(f.credit());
  const response = await fetch(enabledBase + FUNDING_WEBHOOK_PATH, {method: 'POST', body: signed.rawBody,
    headers: {'Content-Type': 'application/json', 'x-sendrack-mock-signature': signed.signature}});
  assert.equal(response.status, 200); assert.equal((await f.ledger.read(f.wallet.id)).ledgerBalanceKobo, 5000);
  assert.equal((await fetch(enabledBase + '/')).status, 200);
  assert.equal((await fetch(enabledBase + '/app')).status, 200);
  assert.equal((await fetch(enabledBase + '/admin')).status, 200);
  await assert.rejects(createApp({env: {NODE_ENV: 'production'}, walletFunding: f.funding}), /production/);
});


test('funding migration upgrades Phase 1 without changing existing records or checksums', {skip: !process.env.WALLET_TEST_DATABASE_URL}, async t => {
  const pool = new pg.Pool({connectionString: process.env.WALLET_TEST_DATABASE_URL});
  const schema = 'funding_upgrade_' + randomUUID().replaceAll('-', '');
  t.after(async () => {await pool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`); await pool.end();});
  const source = await readFile(new URL('../../migrations/wallet/001_core.sql', import.meta.url), 'utf8');
  const checksum = createHash('sha256').update(source).digest('hex');
  await pool.query('BEGIN');
  await pool.query(source.replaceAll('sendrack_wallet', schema));
  await pool.query(`INSERT INTO ${schema}.schema_migrations(version,checksum) VALUES('001',$1)`, [checksum]);
  await pool.query('COMMIT');
  const p = new MockBankProvider({webhookSecret: secret, allowTestOperations: true});
  const ledger = new WalletLedger({pool, schema, provider: p, kycLookup: async () => ({status: 'approved', reference: 'synthetic-kyc'})});
  const wallet = await ledger.createWallet({role: 'vendor', ownerId: 'existing-phase1-owner'});
  await ledger.post({idempotencyKey: 'existing-phase1-fixture', kind: 'test_fixture', reference: 'existing',
    lines: [{accountId: BANK_ACCOUNT, debitKobo: 300}, {accountId: wallet.accountId, creditKobo: 300}]});
  const before = (await pool.query(`SELECT * FROM ${schema}.accounts ORDER BY id`)).rows;
  await migrateWallet(pool, {schema}); await migrateWallet(pool, {schema});
  assert.deepEqual((await pool.query(`SELECT * FROM ${schema}.accounts ORDER BY id`)).rows, before);
  assert.equal(Number((await pool.query(`SELECT count(*) n FROM ${schema}.schema_migrations`)).rows[0].n), 2);
  assert.equal((await ledger.read(wallet.id)).ledgerBalanceKobo, 300);
  // A changed migration is rejected rather than silently replaying DDL.
  await pool.query(`UPDATE ${schema}.schema_migrations SET checksum='changed' WHERE version='002'`);
  await assert.rejects(migrateWallet(pool, {schema}), /checksum changed/);
});

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,createHmac} from 'node:crypto';
import pg from 'pg';
import {migrateWallet} from '../../server/wallet/migrate.mjs';
import {WalletLedger,BANK_ACCOUNT} from '../../server/wallet/ledger.mjs';
import {MockBankProvider} from '../../server/wallet/mock-bank-provider.mjs';
const secret='mock-test-secret-never-use-in-production';
const provider=()=>new MockBankProvider({webhookSecret:secret,allowTestOperations:true});
test('mock provider: signatures, idempotency, failed/pending/unknown outcomes',async()=>{
 const p=provider();
 const a=await p.createWallet({ownerReference:'a',kycReference:'kyc-a',idempotencyKey:'create-a'});
 const b=await p.createWallet({ownerReference:'b',kycReference:'kyc-b',idempotencyKey:'create-b'});
 p.fundForTest(a.walletId,1000,'fixture-a');
 const input={sourceWalletId:a.walletId,targetWalletId:b.walletId,amountKobo:100,idempotencyKey:'transfer-1',reference:'ref-1'};
 p.nextOutcomeForTest('unknown-after-success');await assert.rejects(p.transfer(input),/unknown/);
 assert.equal((await p.transfer(input)).status,'success');assert.equal((await p.getBalance({walletId:a.walletId})).balanceKobo,900);
 await assert.rejects(p.transfer({...input,amountKobo:101}),/reused/);
 p.nextOutcomeForTest('failed');assert.equal((await p.transfer({...input,idempotencyKey:'transfer-2',reference:'ref-2'})).status,'failed');
 p.nextOutcomeForTest('pending');assert.equal((await p.transfer({...input,idempotencyKey:'transfer-3',reference:'ref-3'})).status,'pending');
 assert.equal((await p.getBalance({walletId:a.walletId})).balanceKobo,900);
 p.confirmForTest('ref-3');assert.equal((await p.getBalance({walletId:a.walletId})).balanceKobo,800);
 const rawBody=Buffer.from('{"event":"test"}'),signature=createHmac('sha256',secret).update(rawBody).digest('hex');
 assert.equal(await p.verifyWebhook({rawBody,signature}),true);assert.equal(await p.verifyWebhook({rawBody:Buffer.from('tampered'),signature}),false);
 assert.equal((await p.listTransactions({walletId:a.walletId})).items.filter(t=>t.reference==='ref-1').length,1);
});
test('PostgreSQL ledger safeguards and bank-source read model',{skip:!process.env.WALLET_TEST_DATABASE_URL},async t=>{
 const pool=new pg.Pool({connectionString:process.env.WALLET_TEST_DATABASE_URL,max:8}),schema='wallet_test_'+randomUUID().replaceAll('-','');
 t.after(async()=>{await pool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);await pool.end();});
 await migrateWallet(pool,{schema});await migrateWallet(pool,{schema});
 const p=provider();let now=Date.now();p.clock=()=>now;
 const ledger=new WalletLedger({pool,provider:p,schema,clock:()=>now,kycLookup:async({ownerId})=>({status:ownerId==='denied'?'pending':'approved',reference:'test-kyc-'+ownerId})});
 await assert.rejects(ledger.createWallet({role:'vendor',ownerId:'denied'}),/Approved KYC/);
 const [a,same]=await Promise.all([ledger.createWallet({role:'vendor',ownerId:'a'}),ledger.createWallet({role:'vendor',ownerId:'a'})]);assert.equal(a.id,same.id);
 const b=await ledger.createWallet({role:'rider',ownerId:'b'}),c=await ledger.createWallet({role:'rider',ownerId:'c'});
 const funding={idempotencyKey:'fixture-journal-a',kind:'test_fixture',reference:'test-funding-a',lines:[{accountId:BANK_ACCOUNT,debitKobo:100},{accountId:a.accountId,creditKobo:100}]};
 const journal=await ledger.post(funding);p.fundForTest(a.providerWalletId,100,'fixture-a');
 assert.equal((await ledger.refreshBankBalance(a.id)).spendableKobo,100);
 const replays=await Promise.all([ledger.post(funding),ledger.post(funding)]);assert.ok(replays.every(r=>r.id===journal.id&&r.replayed));
 await assert.rejects(ledger.post({...funding,memo:'changed'}),/Conflicting/);
 await assert.rejects(ledger.post({...funding,idempotencyKey:'bad-fraction',lines:[{accountId:BANK_ACCOUNT,debitKobo:0.5},{accountId:a.accountId,creditKobo:0.5}]}),/integer/);
 for(const sql of [`UPDATE ${schema}.ledger_entries SET credit_kobo=1 WHERE transaction_id='${journal.id}'`,`DELETE FROM ${schema}.ledger_entries WHERE transaction_id='${journal.id}'`,`UPDATE ${schema}.accounts SET balance_kobo=999 WHERE id='${a.accountId}'`,`INSERT INTO ${schema}.ledger_entries(transaction_id,line_number,account_id,debit_kobo,credit_kobo) VALUES('${journal.id}',3,'${b.accountId}',0,1)`])await assert.rejects(pool.query(sql));
 await assert.rejects(ledger.transaction(async client=>{
  const id=randomUUID();await client.query(`INSERT INTO ${schema}.transactions(id,idempotency_key,request_hash,kind,reference,memo) VALUES($1,'unbalanced-test',$2,'test','test','')`,[id,'a'.repeat(64)]);
  await client.query(`INSERT INTO ${schema}.ledger_entries VALUES($1,1,$2,1,0,clock_timestamp())`,[id,BANK_ACCOUNT]);
  await client.query(`UPDATE ${schema}.transactions SET sealed=true WHERE id=$1`,[id]);
 }),/balanced/);
 const results=await Promise.allSettled([b,c].map((target,index)=>ledger.post({idempotencyKey:'simultaneous-'+index,kind:'test',reference:'test-'+index,lines:[{accountId:a.accountId,debitKobo:80},{accountId:target.accountId,creditKobo:80}]})));
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal((await ledger.read(a.id)).ledgerBalanceKobo,20);
 assert.equal((await ledger.refreshBankBalance(a.id)).state,'mismatch');assert.equal((await ledger.read(a.id)).spendableKobo,null);
 // Ledger postings do not forge provider balances or auto-repair mismatches.
 assert.equal((await p.getBalance({walletId:a.providerWalletId})).balanceKobo,100);
 const fresh=await ledger.createWallet({role:'vendor',ownerId:'fresh'});now+=31000;assert.equal((await ledger.read(fresh.id)).state,'stale');
 const original=p.getBalance.bind(p);p.getBalance=async()=>{throw new Error('offline');};await assert.rejects(ledger.refreshBankBalance(b.id),/offline/);assert.equal((await ledger.read(b.id)).state,'unavailable');p.getBalance=original;
 // A slow provider call cannot hold a DB row lock or block an unrelated journal.
 let unblock,entered;const waiting=new Promise(r=>entered=r),gate=new Promise(r=>unblock=r);
 p.getBalance=async input=>{entered();await gate;return original(input);};const refresh=ledger.refreshBankBalance(b.id);await waiting;
 try{await Promise.race([ledger.post({...funding,idempotencyKey:'unrelated-journal',reference:'unrelated'}),new Promise((_,reject)=>{const timer=setTimeout(()=>reject(new Error('provider held database lock')),2000);timer.unref();})]);}finally{unblock();await refresh;}
});

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,createHmac} from 'node:crypto';
import {controlFixture,owner,checker,support} from './control-fixture.mjs';
import {WalletReconciliation} from '../../server/wallet/reconciliation.mjs';
const run=(name,fn)=>test(name,{skip:!process.env.WALLET_TEST_DATABASE_URL},async t=>{const f=await controlFixture(t);f.alerts=[];f.reconciliation=new WalletReconciliation({admin:f.admin,platformProviderWalletId:f.holds.platformProviderWalletId,onAlert:async a=>f.alerts.push(a)});return fn(t,f);});
run('reconciliation: matched balances and history, idempotent daily runs and immutable observations',async(t,f)=>{
 await f.wallet('vendor',1000);await f.wallet('rider');
 const result=await f.reconciliation.run({actor:owner,idempotencyKey:'daily:synthetic-2026-11-11'});assert.equal(result.state,'completed');assert.equal(result.mismatches,0);
 assert.equal((await f.reconciliation.run({actor:checker,idempotencyKey:'daily:synthetic-2026-11-11'})).id,result.id);
 assert.equal(Number((await f.pool.query(`SELECT count(*) n FROM ${f.schema}.reconciliation_observations`)).rows[0].n),3);
 await assert.rejects(f.pool.query(`DELETE FROM ${f.schema}.reconciliation_observations`),/immutable/);
 assert.equal((await f.reconciliation.monitor(support)).openMismatches,0);
 await assert.rejects(f.reconciliation.run({actor:support,idempotencyKey:randomUUID()}),/not permitted/);
});
run('reconciliation: unrecorded bank funding flags and blocks spending; resolution requires fresh bank and ledger match',async(t,f)=>{
 const vendor=await f.wallet('vendor',1000),extra=f.provider.fundForTest(vendor.providerWalletId,100,'synthetic-unrecorded-funding');
 const result=await f.reconciliation.run({actor:owner,idempotencyKey:randomUUID()});assert.equal(result.state,'completed_with_mismatches');assert.equal(f.alerts.length,1);
 const items=(await f.reconciliation.list(support)).items;assert.ok(items.some(i=>i.kind==='unrecorded_funding'));assert.ok(items.some(i=>i.kind==='balance_mismatch'));
 assert.equal((await f.ledger.refreshBankBalance(vendor.id)).state,'reconciliation_required');
 await assert.rejects(f.reconciliation.resolve(checker,{id:items[0].id,reason:'Attempt to resolve an existing mismatch'}),/still has an issue/);
 const rawBody=Buffer.from(JSON.stringify({version:1,type:'wallet.funded',mode:'mock',eventId:randomUUID(),providerTransactionId:extra.providerTransactionId,walletId:vendor.providerWalletId,amountKobo:100,currency:'NGN',occurredAt:f.ledger.clock()}));
 await f.funding.receive({rawBody,signature:createHmac('sha256','isolated-mock-wallet-control-test-secret').update(rawBody).digest('hex')});
 const open=(await f.reconciliation.list(support)).items.filter(i=>i.state==='open');
 for(const item of open)await f.reconciliation.resolve(checker,{id:item.id,reason:'Verified funding webhook replay and fresh bank comparison'});
 assert.equal((await f.ledger.read(vendor.id)).spendableKobo,1100);
});
run('reconciliation: missing provider transactions are flagged even when balances agree',async(t,f)=>{
 const vendor=await f.wallet('vendor',1000);f.provider.listTransactions=async()=>({mode:'mock',items:[],nextCursor:null});
 const result=await f.reconciliation.run({actor:owner,idempotencyKey:randomUUID()});assert.equal(result.state,'completed_with_mismatches');
 const items=(await f.reconciliation.list(owner)).items;assert.ok(items.some(i=>i.kind==='missing_bank_funding'));
 assert.equal((await f.ledger.refreshBankBalance(vendor.id)).spendableKobo,null);
});
run('reconciliation: incomplete provider history or changing snapshot cannot report matched',async(t,f)=>{
 await f.wallet('vendor',1000);const original=f.provider.getBalance.bind(f.provider);let count=0;
 f.provider.getBalance=async input=>({...await original(input),revision:++count});
 let result=await f.reconciliation.run({actor:owner,idempotencyKey:randomUUID()});assert.equal(result.state,'completed_with_mismatches');
 assert.ok((await f.reconciliation.list(owner)).items.some(i=>i.kind==='observation_changed'));
 f.provider.getBalance=async()=>{throw new Error('synthetic provider outage');};
 result=await f.reconciliation.run({actor:owner,idempotencyKey:randomUUID()});assert.equal(result.state,'completed_with_mismatches');
 assert.ok((await f.reconciliation.list(owner)).items.some(i=>i.kind==='provider_unavailable'));
 assert.equal((await f.reconciliation.monitor(owner)).status,'completed_with_mismatches');
});
run('reconciliation: stage transfers and platform fee reconcile across both sides of the custody chain',async(t,f)=>{
 const vendor=await f.wallet('vendor',1000),rider=await f.wallet('rider'),id=randomUUID();
 await f.holds.reserve({shipmentId:id,vendorWalletId:vendor.id,deliveryType:'intrastate',totalKobo:1000,fees:{pickup:900},platformKobo:100});
 const before={id,deliveryType:'intrastate',status:'Delivery OTP sent',actors:{pickup:{id:rider.ownerId}}};
 await f.ledger.transaction(c=>f.holds.onTransitionInTransaction(c,before,{...before,status:'Delivered'},{otpVerified:true}));
 while(await f.worker.runOnce()){}
 const result=await f.reconciliation.run({actor:owner,idempotencyKey:randomUUID()});assert.equal(result.state,'completed');assert.equal(result.mismatches,0);
 const original=f.provider.listTransactions.bind(f.provider);
 f.provider.listTransactions=async input=>{const data=await original(input);return {...data,items:data.items.filter(i=>i.kind!=='transfer')};};
 await f.reconciliation.run({actor:owner,idempotencyKey:randomUUID()});assert.ok((await f.reconciliation.list(owner)).items.some(i=>i.kind==='missing_bank_transfer'));
});

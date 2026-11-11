import {randomUUID} from 'node:crypto';
import {FEE_ACCOUNT} from './ledger.mjs';
import {WalletError,reference} from './provider.mjs';
import {requireRole} from './admin.mjs';
export class WalletReconciliation {
 constructor({admin,platformProviderWalletId,onAlert=async()=>{},maxPages=100}){
  if(!Number.isSafeInteger(maxPages)||maxPages<1||maxPages>1000)throw new Error('Invalid reconciliation history limit.');
  this.admin=admin;this.ledger=admin.ledger;this.pool=admin.pool;this.schema=admin.schema;this.provider=this.ledger.provider;
  this.platformProviderWalletId=platformProviderWalletId;this.onAlert=onAlert;this.maxPages=maxPages;
 }
 async list(actor){requireRole(actor);return {runs:(await this.pool.query(`SELECT id,state,created_at,completed_at FROM ${this.schema}.reconciliation_runs ORDER BY created_at DESC LIMIT 30`)).rows,items:(await this.pool.query(`SELECT * FROM ${this.schema}.reconciliation_items ORDER BY created_at DESC LIMIT 200`)).rows};}
 async monitor(actor){requireRole(actor);const latest=(await this.pool.query(`SELECT state,completed_at FROM ${this.schema}.reconciliation_runs ORDER BY created_at DESC LIMIT 1`)).rows[0];
  const open=Number((await this.pool.query(`SELECT count(*) n FROM ${this.schema}.reconciliation_items WHERE state='open'`)).rows[0].n);
  const aged=Number((await this.pool.query(`SELECT count(*) n FROM ${this.schema}.outbox WHERE status NOT IN ('done','cancelled','failed') AND created_at<to_timestamp($1/1000.0)`,[this.ledger.clock()-900000])).rows[0].n);
  return {status:!latest?'not_run':!latest.completed_at||this.ledger.clock()-Date.parse(latest.completed_at)>36*3600000?'overdue':latest.state,openMismatches:open,agedTransfers:aged,lastCompletedAt:latest?.completed_at||null};
 }
 async history(walletId){let cursor=0,items=[],seen=new Set();for(let page=0;page<this.maxPages;page++){
  const result=await this.provider.listTransactions({walletId,cursor,limit:100});
  if(result?.mode!=='mock'||!Array.isArray(result.items)||result.items.length>100)throw new Error('provider_history_invalid');
  for(const item of result.items){if(typeof item.providerTransactionId!=='string'||seen.has(item.providerTransactionId)||item.walletId!==walletId||item.currency!=='NGN'||!Number.isSafeInteger(item.amountKobo)||item.amountKobo<1||!['in','out'].includes(item.direction)||!['success','pending','failed'].includes(item.status))throw new Error('provider_history_invalid');seen.add(item.providerTransactionId);items.push(item);}
  if(result.nextCursor===null)return items;
  if(!Number.isSafeInteger(result.nextCursor)||result.nextCursor<=cursor)throw new Error('provider_history_invalid');cursor=result.nextCursor;
 }throw new Error('provider_history_incomplete');}
 async accountSnapshot(accountId){return (await this.pool.query(`SELECT a.balance_kobo,(SELECT count(*) FROM ${this.schema}.ledger_entries e WHERE e.account_id=a.id) entry_count FROM ${this.schema}.accounts a WHERE a.id=$1`,[accountId])).rows[0];}
 async compare(account){
  const before=await this.accountSnapshot(account.account_id),issues=[];
  const add=(kind,ref,detail={})=>issues.push({kind,reference:ref,detail});
  let bank;
  try{
   const first=this.ledger.snapshot(await this.provider.getBalance({walletId:account.provider_wallet_id}),account.provider_wallet_id);
   const history=await this.history(account.provider_wallet_id);
   bank=this.ledger.snapshot(await this.provider.getBalance({walletId:account.provider_wallet_id}),account.provider_wallet_id);
   const after=await this.accountSnapshot(account.account_id);
   if(first.revision!==bank.revision||first.balanceKobo!==bank.balanceKobo||Number(before.entry_count)!==Number(after.entry_count)||String(before.balance_kobo)!==String(after.balance_kobo)){
    add('observation_changed','snapshot',{message:'Provider or ledger changed during comparison; retry a stable observation.'});return {issues,complete:false,bank,before};
   }
   const receipts=account.id?(await this.pool.query(`SELECT provider_transaction_id,amount_kobo FROM ${this.schema}.funding_receipts WHERE wallet_id=$1`,[account.id])).rows:[];
   const tasks=(await this.pool.query(`SELECT * FROM ${this.schema}.outbox WHERE source_wallet_id=$1 OR target_provider_wallet_id=$2`,[account.id||null,account.provider_wallet_id])).rows;
   const receiptMap=new Map(receipts.map(r=>[r.provider_transaction_id,r])),taskMap=new Map(tasks.map(o=>[o.idempotency_key,o]));
   if(BigInt(before.balance_kobo)!==BigInt(bank.balanceKobo))add('balance_mismatch','balance',{bankKobo:bank.balanceKobo,ledgerKobo:String(before.balance_kobo)});
   for(const tx of history){
    if(tx.kind==='funding'&&tx.direction==='in'){
     const receipt=receiptMap.get(tx.providerTransactionId);
     if(tx.status==='success'&&!receipt)add('unrecorded_funding',tx.providerTransactionId,{amountKobo:tx.amountKobo});
     else if(receipt&&(tx.status!=='success'||Number(receipt.amount_kobo)!==tx.amountKobo))add('funding_mismatch',tx.providerTransactionId,{bankStatus:tx.status,bankKobo:tx.amountKobo,ledgerKobo:String(receipt.amount_kobo)});
     receiptMap.delete(tx.providerTransactionId);continue;
    }
    const task=taskMap.get(tx.reference);
    if(!task){if(tx.status==='success')add('unrecorded_bank_transaction',tx.providerTransactionId,{direction:tx.direction,amountKobo:tx.amountKobo});continue;}
    const expectedDirection=task.source_wallet_id===account.id?'out':'in';
    if(tx.amountKobo!==Number(task.amount_kobo)||tx.direction!==expectedDirection||(task.purpose==='withdrawal'?tx.kind!=='withdrawal':tx.kind!=='transfer'))add('transfer_mismatch',tx.reference,{bankKobo:tx.amountKobo,ledgerKobo:String(task.amount_kobo)});
    else if(tx.status==='success'&&task.status!=='done')add('settlement_pending',tx.reference,{outboxStatus:task.status});
    else if(task.status==='done'&&tx.status!=='success')add('provider_state_conflict',tx.reference,{bankStatus:tx.status,outboxStatus:task.status});
    taskMap.delete(tx.reference);
   }
   for(const receipt of receiptMap.values())add('missing_bank_funding',receipt.provider_transaction_id,{ledgerKobo:String(receipt.amount_kobo)});
   for(const task of taskMap.values())if(task.status==='done')add('missing_bank_transfer',task.idempotency_key,{ledgerKobo:String(task.amount_kobo)});
   // Evidence queries must also share a stable ledger watermark.
   const final=await this.accountSnapshot(account.account_id);
   if(Number(final.entry_count)!==Number(before.entry_count))return {issues:[{kind:'observation_changed',reference:'snapshot',detail:{message:'Ledger changed while reading settlement evidence.'}}],complete:false,bank,before};
   return {issues,complete:true,bank,before};
  }catch{
   add('provider_unavailable','snapshot',{message:'Provider balance/history could not be completely verified. No balance correction was made.'});return {issues,complete:false,bank,before};
  }
 }
 async run({actor={id:'system:daily-reconciliation',role:'Finance'},idempotencyKey}){
  requireRole(actor,['Admin','Finance']);reference(idempotencyKey);if(idempotencyKey.length<8)throw new WalletError('Use a stable reconciliation reference.');
  const lease=randomUUID(),now=this.ledger.clock();
  const claim=await this.ledger.transaction(async c=>{
   const inserted=await c.query(`INSERT INTO ${this.schema}.reconciliation_runs(id,idempotency_key,state,actor_id,lease_token,lease_until) VALUES($1,$2,'running',$3,$4,$5) ON CONFLICT(idempotency_key) DO NOTHING RETURNING *`,[randomUUID(),idempotencyKey,actor.id,lease,now+900000]);
   if(inserted.rowCount)return {run:inserted.rows[0],owned:true};
   const prior=(await c.query(`SELECT * FROM ${this.schema}.reconciliation_runs WHERE idempotency_key=$1 FOR UPDATE`,[idempotencyKey])).rows[0];
   // A stopped run is preserved as evidence. A fresh reference is required for another run.
   if(prior.state==='running'&&Number(prior.lease_until)<now)await c.query(`UPDATE ${this.schema}.reconciliation_runs SET state='failed',completed_at=clock_timestamp() WHERE id=$1`,[prior.id]);
   return {run:prior,owned:false};
  });
  if(!claim.owned)return {...claim.run,replayed:true};
  const run=claim.run;
  try{
   const accounts=(await this.pool.query(`SELECT id,account_id,provider_wallet_id FROM ${this.schema}.wallets ORDER BY id`)).rows;
   if(this.platformProviderWalletId)accounts.push({id:null,account_id:FEE_ACCOUNT,provider_wallet_id:this.platformProviderWalletId});
   else if(BigInt((await this.accountSnapshot(FEE_ACCOUNT)).balance_kobo)!==0n)accounts.push({id:null,account_id:FEE_ACCOUNT,provider_wallet_id:'unconfigured-platform-wallet'});
   let mismatches=0;
   for(const account of accounts){
    const result=await this.compare(account);mismatches+=result.issues.length;
    await this.ledger.transaction(async c=>{
     // Fencing: a timed-out/superseded run cannot publish late results.
     const state=(await c.query(`SELECT state,lease_token FROM ${this.schema}.reconciliation_runs WHERE id=$1 FOR UPDATE`,[run.id])).rows[0];if(state.state!=='running'||state.lease_token!==lease)throw new Error('reconciliation_lease_lost');
     await c.query(`UPDATE ${this.schema}.reconciliation_runs SET lease_until=$2 WHERE id=$1`,[run.id,this.ledger.clock()+900000]);
     await c.query(`INSERT INTO ${this.schema}.reconciliation_observations(run_id,account_id,complete,bank_balance_kobo,ledger_balance_kobo,provider_revision) VALUES($1,$2,$3,$4,$5,$6)`,[run.id,account.account_id,result.complete,result.bank?.balanceKobo??null,result.before.balance_kobo,result.bank?.revision??null]);
     for(const issue of result.issues)await c.query(`INSERT INTO ${this.schema}.reconciliation_items(id,run_id,wallet_id,account_id,kind,reference,detail) VALUES($1,$2,$3,$4,$5,$6,$7)`,[randomUUID(),run.id,account.id,account.account_id,issue.kind,issue.reference,JSON.stringify(issue.detail)]);
     if(account.id&&(!result.complete||result.issues.length))await c.query(`UPDATE ${this.schema}.wallets SET bank_status='unavailable',reconciliation_blocked=true WHERE id=$1`,[account.id]);
    });
   }
   const final=(await this.pool.query(`UPDATE ${this.schema}.reconciliation_runs SET state=$3,completed_at=clock_timestamp() WHERE id=$1 AND lease_token=$2 AND state='running' RETURNING *`,[run.id,lease,mismatches?'completed_with_mismatches':'completed'])).rows[0];
   await this.ledger.transaction(c=>this.admin.audit(c,actor,'reconciliation_run',run.id,'Compared provider balances and transaction history',{accounts:accounts.length,mismatches}));
   if(mismatches)try{await this.onAlert({runId:run.id,mismatches});}catch{/* Monitoring delivery never mutates balances or invalidates completed evidence. */}
   return {...final,mismatches};
  }catch(error){await this.pool.query(`UPDATE ${this.schema}.reconciliation_runs SET state='failed',completed_at=clock_timestamp() WHERE id=$1 AND lease_token=$2 AND state='running'`,[run.id,lease]);throw error;}
 }
 async resolve(actor,{id,reason}){
  requireRole(actor,['Admin','Finance']);if(typeof reason!=='string'||reason.trim().length<5||reason.length>500)throw new WalletError('Provide a resolution reason.');
  const item=(await this.pool.query(`SELECT * FROM ${this.schema}.reconciliation_items WHERE id=$1 AND state='open'`,[id])).rows[0];if(!item)throw new WalletError('Open mismatch not found.',404);
  const run=await this.run({actor,idempotencyKey:'resolution:'+randomUUID()});
  const observation=(await this.pool.query(`SELECT complete FROM ${this.schema}.reconciliation_observations WHERE run_id=$1 AND account_id=$2`,[run.id,item.account_id])).rows[0];
  const current=(await this.pool.query(`SELECT id FROM ${this.schema}.reconciliation_items WHERE run_id=$1 AND account_id=$2`,[run.id,item.account_id])).rows;
  if(!observation?.complete||current.length)throw new WalletError('Fresh provider comparison still has an issue. Resolve its cause first.',409);
  await this.ledger.transaction(async c=>{
   const changed=await c.query(`UPDATE ${this.schema}.reconciliation_items SET state='resolved',resolved_by=$2,resolution_reason=$3,resolved_at=clock_timestamp() WHERE id=$1 AND state='open' RETURNING id`,[id,actor.id,reason]);if(!changed.rowCount)throw new WalletError('Mismatch was already resolved.',409);
   await this.admin.audit(c,actor,'mismatch_resolved',id,reason,{verificationRunId:run.id});
   if(item.wallet_id)await c.query(`UPDATE ${this.schema}.wallets SET reconciliation_blocked=false WHERE id=$1 AND NOT EXISTS(SELECT 1 FROM ${this.schema}.reconciliation_items WHERE wallet_id=$1 AND state='open')`,[item.wallet_id]);
  });
  if(item.wallet_id)await this.ledger.refreshBankBalance(item.wallet_id);
  return {resolved:true,verificationRunId:run.id};
 }
}

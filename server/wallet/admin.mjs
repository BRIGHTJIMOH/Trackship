import {createHash,randomUUID} from 'node:crypto';
import {WalletError,kobo,reference} from './provider.mjs';
const fail=(message,status=403)=>{throw new WalletError(message,status);};
export function requireRole(actor,roles=['Admin','Finance','Support']){if(!actor?.id||!roles.includes(actor.role))fail('This finance action is not permitted.');}
const reason=value=>{if(typeof value!=='string'||value.trim().length<5||value.length>500)fail('Provide a meaningful reason (5–500 characters).',400);return value.trim();};
export class WalletAdmin {
 constructor({ledger,holds}){this.ledger=ledger;this.holds=holds;this.pool=ledger.pool;this.schema=ledger.schema;}
 async audit(c,actor,action,entityId,why,detail={}){await c.query(`INSERT INTO ${this.schema}.admin_actions(id,actor_id,actor_role,action,entity_id,reason,detail) VALUES($1,$2,$3,$4,$5,$6,$7)`,[randomUUID(),actor.id,actor.role,action,entityId,why,JSON.stringify(detail)]);}
 async settings(actor){requireRole(actor);return (await this.pool.query(`SELECT id,revision,tiers,approval_threshold_kobo FROM ${this.schema}.settings WHERE id=1`)).rows[0];}
 async updateSettings(actor,{revision,tiers,approvalThresholdKobo,reason:why}){
  requireRole(actor,['Admin']);why=reason(why);kobo(approvalThresholdKobo);
  if(!tiers||Array.isArray(tiers)||typeof tiers!=='object'||Object.keys(tiers).length>20)fail('Enter valid bank tier limits.',400);
  for(const [tier,limits] of Object.entries(tiers)){
   if(!/^[A-Za-z0-9_-]{1,40}$/.test(tier))fail('Invalid KYC tier name.',400);
   for(const key of ['perTransactionKobo','dailyKobo','monthlyKobo'])kobo(limits?.[key]);
   if(limits.dailyKobo<limits.perTransactionKobo||limits.monthlyKobo<limits.dailyKobo)fail('Monthly limits must cover daily limits, and daily limits must cover one transaction.',400);
  }
  return this.ledger.transaction(async c=>{
   const result=await c.query(`UPDATE ${this.schema}.settings SET tiers=$1,approval_threshold_kobo=$2,revision=revision+1 WHERE id=1 AND revision=$3 RETURNING revision`,[JSON.stringify(tiers),approvalThresholdKobo,revision]);
   if(!result.rowCount)fail('Settings changed. Reload before saving.',409);
   await this.audit(c,actor,'settings','wallet-policy',why,{revision:result.rows[0].revision,tiers,approvalThresholdKobo});return result.rows[0];
  });
 }
 async overview(actor){requireRole(actor);const rows=await this.pool.query(`SELECT
  (SELECT coalesce(sum(a.held_kobo),0) FROM ${this.schema}.wallets w JOIN ${this.schema}.accounts a ON a.id=w.account_id) held,
  (SELECT coalesce(sum(a.available_kobo),0) FROM ${this.schema}.wallets w JOIN ${this.schema}.accounts a ON a.id=w.account_id) available,
  (SELECT count(*) FROM ${this.schema}.payouts WHERE state IN ('awaiting_approval','pending')) pending_payouts,
  (SELECT count(*) FROM ${this.schema}.outbox WHERE status IN ('failed','needs_attention')) failed_transfers`);return {...rows.rows[0],mode:'mock'};}
 async list(actor,view,{limit=50,offset=0,status='',query=''}={}){
  requireRole(actor);if(!Number.isSafeInteger(limit)||limit<1||limit>200||!Number.isSafeInteger(offset)||offset<0||offset>100000)fail('Invalid finance page.',400);
  const lists={
   wallets:`SELECT w.id,w.owner_role,w.owner_id,w.bank_balance_kobo,w.bank_status,w.bank_observed_at,a.balance_kobo,a.held_kobo,a.available_kobo FROM ${this.schema}.wallets w JOIN ${this.schema}.accounts a ON a.id=w.account_id WHERE ($3='' OR w.bank_status=$3) AND ($4='' OR w.owner_id ILIKE '%'||$4||'%' OR w.id::text=$4) ORDER BY w.created_at DESC LIMIT $1 OFFSET $2`,
   holds:`SELECT h.*,coalesce((SELECT jsonb_agg(s ORDER BY s.leg) FROM ${this.schema}.hold_stages s WHERE s.hold_id=h.id),'[]') stages FROM ${this.schema}.holds h WHERE ($3='' OR h.state=$3) AND ($4='' OR h.shipment_id ILIKE '%'||$4||'%') ORDER BY h.created_at DESC LIMIT $1 OFFSET $2`,
   transactions:`SELECT id,kind,reference,memo,state,created_at FROM ${this.schema}.transactions WHERE ($3='' OR kind=$3) AND ($4='' OR reference ILIKE '%'||$4||'%') ORDER BY created_at DESC LIMIT $1 OFFSET $2`,
   payouts:`SELECT p.*,q.account_name,q.masked_account,q.bank_code FROM ${this.schema}.payouts p JOIN ${this.schema}.withdrawal_quotes q ON q.id=p.quote_id WHERE ($3='' OR p.state=$3) AND ($4='' OR p.id::text=$4) ORDER BY p.created_at DESC LIMIT $1 OFFSET $2`,
   decisions:`SELECT * FROM ${this.schema}.admin_decisions WHERE ($3='' OR state=$3) AND ($4='' OR entity_id::text=$4) ORDER BY created_at DESC LIMIT $1 OFFSET $2`,
   disputes:`SELECT d.*,h.shipment_id FROM ${this.schema}.disputes d JOIN ${this.schema}.holds h ON h.id=d.hold_id WHERE ($3='' OR d.state=$3) AND ($4='' OR h.shipment_id ILIKE '%'||$4||'%') ORDER BY d.created_at DESC LIMIT $1 OFFSET $2`,
   audit:`SELECT * FROM ${this.schema}.admin_actions WHERE ($3='' OR action=$3) AND ($4='' OR actor_id ILIKE '%'||$4||'%') ORDER BY created_at DESC LIMIT $1 OFFSET $2`,
   transfers:`SELECT id,purpose,amount_kobo,status,attempts,result_code,created_at FROM ${this.schema}.outbox WHERE ($3='' OR status=$3) AND ($4='' OR id::text=$4) ORDER BY created_at DESC LIMIT $1 OFFSET $2`
  };
  if(!lists[view])fail('Finance view not found.',404);
  return (await this.pool.query(lists[view],[limit,offset,status.slice(0,80),query.slice(0,160)])).rows;
 }
 async walletDetail(actor,id){requireRole(actor);const wallet=await this.ledger.read(id);return {wallet,ledger:(await this.pool.query(`SELECT e.*,t.kind,t.reference FROM ${this.schema}.ledger_entries e JOIN ${this.schema}.transactions t ON t.id=e.transaction_id WHERE e.account_id=$1 ORDER BY e.created_at DESC LIMIT 100`,[wallet.accountId])).rows,holds:(await this.pool.query(`SELECT * FROM ${this.schema}.holds WHERE vendor_wallet_id=$1 ORDER BY created_at DESC LIMIT 100`,[id])).rows};}
 async dispute(actor,{holdId,reason:why}){requireRole(actor,['Admin','Finance']);why=reason(why);return this.ledger.transaction(async c=>{
  const h=(await c.query(`UPDATE ${this.schema}.holds SET state='disputed' WHERE id=$1 AND state='active' RETURNING id`,[holdId])).rows[0];if(!h)fail('Hold is closed or already disputed.',409);
  const id=randomUUID();await c.query(`INSERT INTO ${this.schema}.disputes(id,hold_id,reason,opened_by) VALUES($1,$2,$3,$4)`,[id,holdId,why,actor.id]);await this.audit(c,actor,'dispute_open',holdId,why);return {id};
 });}
 async propose(actor,{kind,entityId,amountKobo,reason:why,idempotencyKey}){
  requireRole(actor,['Admin','Finance']);why=reason(why);reference(idempotencyKey);if(!['payout_approve','payout_reject','release','refund','cancel_failed_release','retry_transfer'].includes(kind))fail('Unknown financial action.',400);
  let amount=amountKobo;
  if(kind.startsWith('payout_')){const payout=(await this.pool.query(`SELECT amount_kobo FROM ${this.schema}.payouts WHERE id=$1`,[entityId])).rows[0];if(!payout)fail('Payout not found.',404);amount=Number(payout.amount_kobo);}
  if(['cancel_failed_release','retry_transfer'].includes(kind)){const transfer=(await this.pool.query(`SELECT amount_kobo FROM ${this.schema}.outbox WHERE id=$1`,[entityId])).rows[0];if(!transfer)fail('Transfer not found.',404);amount=Number(transfer.amount_kobo);}
  kobo(amount);
  const hash=createHash('sha256').update(JSON.stringify([kind,entityId,amount,why])).digest('hex');
  return this.ledger.transaction(async c=>{
   // Serialize approval policy and proposal creation; no provider call inside this transaction.
   const policy=(await c.query(`SELECT * FROM ${this.schema}.settings WHERE id=1 FOR SHARE`)).rows[0];if(!policy.approval_threshold_kobo)fail('Configure the bank approval threshold first.',503);
   const id=randomUUID(),needsChecker=amount>=Number(policy.approval_threshold_kobo);
   const result=await c.query(`INSERT INTO ${this.schema}.admin_decisions(id,idempotency_key,request_hash,kind,entity_id,amount_kobo,reason,maker_id,needs_checker,policy_revision,state) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT(idempotency_key) DO NOTHING RETURNING *`,[id,idempotencyKey,hash,kind,entityId,amount,why,actor.id,needsChecker,policy.revision,needsChecker?'pending':'executed']);
   if(!result.rowCount){const prior=(await c.query(`SELECT * FROM ${this.schema}.admin_decisions WHERE idempotency_key=$1`,[idempotencyKey])).rows[0];if(prior.request_hash!==hash||prior.maker_id!==actor.id)fail('Financial action reference conflict.',409);return prior;}
   const decision=result.rows[0];if(!needsChecker)await this.execute(c,decision);
   await this.audit(c,actor,needsChecker?'action_proposed':'action_executed',entityId,why,{decisionId:id,kind,amountKobo:amount});return decision;
  });
 }
 async check(actor,{decisionId,approve,reason:why}){
  requireRole(actor,['Admin','Finance']);why=reason(why);if(typeof approve!=='boolean')fail('Choose approve or reject.',400);
  return this.ledger.transaction(async c=>{
   const d=(await c.query(`SELECT * FROM ${this.schema}.admin_decisions WHERE id=$1 FOR UPDATE`,[decisionId])).rows[0];if(!d||d.state!=='pending')fail('Decision is no longer pending.',409);if(d.maker_id===actor.id)fail('A different authorised person must check this action.');
   if(approve)await this.execute(c,d);
   await c.query(`UPDATE ${this.schema}.admin_decisions SET checker_id=$2,state=$3 WHERE id=$1`,[d.id,actor.id,approve?'executed':'rejected']);await this.audit(c,actor,approve?'action_approved':'action_rejected',d.entity_id,why,{decisionId:d.id});return {executed:approve};
  });
 }
 async execute(c,d){
  if(['cancel_failed_release','retry_transfer'].includes(d.kind)){
   const row=(await c.query(`SELECT o.*,w.account_id FROM ${this.schema}.outbox o JOIN ${this.schema}.wallets w ON w.id=o.source_wallet_id WHERE o.id=$1`,[d.entity_id])).rows[0];if(!row)fail('Transfer not found.',404);
   await c.query(`SELECT id FROM ${this.schema}.accounts WHERE id=$1 FOR UPDATE`,[row.account_id]);
   const task=(await c.query(`SELECT * FROM ${this.schema}.outbox WHERE id=$1 FOR UPDATE`,[row.id])).rows[0];
   if(d.kind==='retry_transfer'){
    if(task.status!=='needs_attention')fail('Only uncertain transfers requiring attention can be resumed.',409);
    await c.query(`UPDATE ${this.schema}.outbox SET status='retry',next_attempt_at=0 WHERE id=$1`,[task.id]);return;
   }
   if(task.purpose!=='stage_release'||task.status!=='failed'||task.result_code!=='bank_rejected')fail('Only definitively bank-rejected stage transfers can be cancelled. Uncertain transfers stay locked.',409);
   await c.query(`UPDATE ${this.schema}.hold_stages SET pending_kobo=pending_kobo-$2 WHERE id=$1`,[task.stage_id,task.amount_kobo]);
   await c.query(`UPDATE ${this.schema}.outbox SET status='cancelled' WHERE id=$1`,[task.id]);return;
  }
  if(d.kind.startsWith('payout_')){
   const p=(await c.query(`SELECT p.*,w.account_id,q.beneficiary_id FROM ${this.schema}.payouts p JOIN ${this.schema}.wallets w ON w.id=p.wallet_id JOIN ${this.schema}.withdrawal_quotes q ON q.id=p.quote_id WHERE p.id=$1`,[d.entity_id])).rows[0];if(!p)fail('Payout not found.',404);
   await c.query(`SELECT id FROM ${this.schema}.accounts WHERE id=$1 FOR UPDATE`,[p.account_id]);
   const locked=(await c.query(`SELECT * FROM ${this.schema}.payouts WHERE id=$1 FOR UPDATE`,[p.id])).rows[0];if(locked.state!=='awaiting_approval')fail('Payout is no longer awaiting approval.',409);
   if(d.kind==='payout_reject'){
    await c.query(`UPDATE ${this.schema}.accounts SET held_kobo=held_kobo-$2 WHERE id=$1`,[p.account_id,p.amount_kobo]);
    await c.query(`UPDATE ${this.schema}.payouts SET state='rejected' WHERE id=$1`,[p.id]);return;
   }
   const taskId=randomUUID();
   await c.query(`INSERT INTO ${this.schema}.outbox(id,idempotency_key,purpose,source_wallet_id,beneficiary_id,amount_kobo,payout_id) VALUES($1,$2,'withdrawal',$3,$4,$5,$6)`,[taskId,'withdraw:'+p.id,p.wallet_id,p.beneficiary_id,p.amount_kobo,p.id]);
   await c.query(`UPDATE ${this.schema}.payouts SET state='pending',outbox_id=$2 WHERE id=$1`,[p.id,taskId]);return;
  }
  const row=(await c.query(`SELECT s.*,h.vendor_wallet_id,h.state AS hold_state,w.account_id FROM ${this.schema}.hold_stages s JOIN ${this.schema}.holds h ON h.id=s.hold_id JOIN ${this.schema}.wallets w ON w.id=h.vendor_wallet_id WHERE s.id=$1`,[d.entity_id])).rows[0];if(!row)fail('Hold stage not found.',404);
  await c.query(`SELECT id FROM ${this.schema}.accounts WHERE id=$1 FOR UPDATE`,[row.account_id]);
  const hold=(await c.query(`SELECT * FROM ${this.schema}.holds WHERE id=$1 FOR UPDATE`,[row.hold_id])).rows[0];
  const stage=(await c.query(`SELECT * FROM ${this.schema}.hold_stages WHERE id=$1 FOR UPDATE`,[row.id])).rows[0];
  const amount=Number(d.amount_kobo),remaining=Number(stage.amount_kobo)-Number(stage.released_kobo)-Number(stage.refunded_kobo)-Number(stage.pending_kobo);
  if(amount>remaining)fail('Amount is already encumbered by a pending release, released or refunded.',409);
  if(d.kind==='release'){
   const finalLeg=hold.delivery_type==='intrastate'?'pickup':'lastmile';
   if((stage.leg===finalLeg||stage.leg==='platform_fee')&&!hold.final_otp_verified)fail('Customer OTP is required before any final-leg or platform-fee release.',409);
   let ownerId;
   if(stage.leg!=='platform_fee'){
    const target=(await c.query(`SELECT owner_id FROM ${this.schema}.wallets WHERE id=$1`,[stage.recipient_wallet_id])).rows[0];
    if(!target)fail('The custody handler must be established before an admin release.',409);ownerId=target.owner_id;
   }
   await this.holds.queueStage(c,{hold:{...hold,state:'active'},leg:stage.leg,recipientOwnerId:ownerId,amountKobo:amount,idempotencyKey:'admin-release:'+d.id});
  }else{
   await c.query(`UPDATE ${this.schema}.accounts SET held_kobo=held_kobo-$2 WHERE id=$1`,[row.account_id,amount]);
   await c.query(`UPDATE ${this.schema}.hold_stages SET refunded_kobo=refunded_kobo+$2 WHERE id=$1`,[stage.id,amount]);
  }
  await c.query(`UPDATE ${this.schema}.holds SET state='closed' WHERE id=$1 AND NOT EXISTS(SELECT 1 FROM ${this.schema}.hold_stages WHERE hold_id=$1 AND released_kobo+refunded_kobo<amount_kobo)`,[hold.id]);
  await c.query(`UPDATE ${this.schema}.disputes SET state='resolved' WHERE hold_id=$1 AND EXISTS(SELECT 1 FROM ${this.schema}.holds WHERE id=$1 AND state='closed')`,[hold.id]);
 }
}

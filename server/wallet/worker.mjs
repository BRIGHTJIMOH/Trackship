import {randomUUID} from 'node:crypto';
import {BANK_ACCOUNT,FEE_ACCOUNT} from './ledger.mjs';
import {WalletError} from './provider.mjs';

export class WalletWorker {
  constructor({ledger,withdrawals=null,maxAttempts=8,leaseMs=60000}) {
    this.ledger=ledger;this.pool=ledger.pool;this.schema=ledger.schema;
    this.withdrawals=withdrawals;this.maxAttempts=maxAttempts;this.leaseMs=leaseMs;
  }
  async runOnce() {
    const now=this.ledger.clock(),lease=randomUUID();
    const task=await this.ledger.transaction(async client=>{
      const row=(await client.query(`SELECT * FROM ${this.schema}.outbox WHERE
        (status IN ('queued','retry','pending_confirmation') AND next_attempt_at<=$1)
        OR (status='processing' AND lease_until<=$1)
        ORDER BY created_at,id FOR UPDATE SKIP LOCKED LIMIT 1`,[now])).rows[0];
      if(!row)return null;
      await client.query(`UPDATE ${this.schema}.outbox SET status='processing',attempts=attempts+1,lease_token=$2,lease_until=$3 WHERE id=$1`,[row.id,lease,now+this.leaseMs]);
      return {...row,attempts:Number(row.attempts)+1,lease_token:lease};
    });
    if(!task)return false;
    let result;
    try {
      const source=await this.ledger.read(task.source_wallet_id);
      const input={sourceWalletId:source.providerWalletId,targetWalletId:task.target_provider_wallet_id,
        beneficiaryId:task.beneficiary_id,amountKobo:Number(task.amount_kobo),currency:'NGN',
        idempotencyKey:task.idempotency_key,reference:task.idempotency_key};
      result=await this.ledger.provider[task.purpose==='withdrawal'?'startWithdrawal':'transfer'](input);
      if(result.reference!==input.reference||result.amountKobo!==input.amountKobo||result.currency!=='NGN'||result.mode!=='mock'||!['success','pending','failed'].includes(result.status))throw new WalletError('Invalid bank transfer result.',502);
    }catch{
      await this.defer(task,'retry','provider_unavailable');return true;
    }
    if(result.status==='pending'){await this.defer(task,'pending_confirmation','bank_pending');return true;}
    if(task.purpose==='withdrawal'){
      if(!this.withdrawals){await this.defer(task,'needs_attention','withdrawal_handler_missing');return true;}
      await this.withdrawals.settle(task,result);return true;
    }
    if(result.status==='failed'){
      // Definitive failure is not an ambiguous transport error. Keep its funds locked for review.
      await this.defer(task,'failed','bank_rejected');return true;
    }
    await this.settleStage(task);
    return true;
  }
  async defer(task,status,code) {
    if(['retry','pending_confirmation'].includes(status)&&task.attempts>=this.maxAttempts)status='needs_attention';
    await this.pool.query(`UPDATE ${this.schema}.outbox SET status=$3,result_code=$4,next_attempt_at=$5,lease_token=NULL,lease_until=0 WHERE id=$1 AND lease_token=$2 AND status='processing'`,
      [task.id,task.lease_token,status,code,this.ledger.clock()+Math.min(3600000,1000*2**Math.min(task.attempts,12))]);
  }
  async settleStage(task) {
    await this.ledger.transaction(async client=>{
      const source=await this.ledger.read(task.source_wallet_id);
      const target=task.target_wallet_id?await this.ledger.read(task.target_wallet_id):null;
      const targetAccount=target?.accountId||FEE_ACCOUNT;
      await client.query(`SELECT id FROM ${this.schema}.accounts WHERE id=ANY($1::uuid[]) ORDER BY id FOR UPDATE`,[[source.accountId,targetAccount]]);
      const current=(await client.query(`SELECT * FROM ${this.schema}.outbox WHERE id=$1 FOR UPDATE`,[task.id])).rows[0];
      if(current.status!=='processing'||current.lease_token!==task.lease_token)return;
      const parent=(await client.query(`SELECT hold_id FROM ${this.schema}.hold_stages WHERE id=$1`,[task.stage_id])).rows[0];
      await client.query(`SELECT id FROM ${this.schema}.holds WHERE id=$1 FOR UPDATE`,[parent.hold_id]);
      const stage=(await client.query(`SELECT * FROM ${this.schema}.hold_stages WHERE id=$1 FOR UPDATE`,[task.stage_id])).rows[0];
      const amount=Number(task.amount_kobo);
      if(Number(stage.pending_kobo)<amount)throw new WalletError('Pending release allocation is inconsistent.',409);
      await client.query(`UPDATE ${this.schema}.accounts SET held_kobo=held_kobo-$2 WHERE id=$1`,[source.accountId,amount]);
      await this.ledger.postInTransaction(client,{idempotencyKey:'settle:'+task.id,kind:'stage_release',reference:task.idempotency_key,
        lines:[{accountId:source.accountId,debitKobo:amount},{accountId:targetAccount,creditKobo:amount}]});
      await client.query(`UPDATE ${this.schema}.hold_stages SET pending_kobo=pending_kobo-$2,released_kobo=released_kobo+$2 WHERE id=$1`,[stage.id,amount]);
      await client.query(`UPDATE ${this.schema}.outbox SET status='done',result_code='bank_confirmed',lease_token=NULL,lease_until=0 WHERE id=$1`,[task.id]);
      await client.query(`UPDATE ${this.schema}.holds SET state='closed' WHERE id=$1 AND NOT EXISTS(SELECT 1 FROM ${this.schema}.hold_stages WHERE hold_id=$1 AND released_kobo+refunded_kobo<amount_kobo)`,[stage.hold_id]);
      // Until fresh provider reads complete, never expose pre-transfer balances as spendable.
      await client.query(`UPDATE ${this.schema}.wallets SET bank_status='unconfirmed' WHERE id=ANY($1::uuid[])`,[[source.id,...(target?[target.id]:[])]]);
    });
  }
}

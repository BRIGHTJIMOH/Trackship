import {randomUUID, createHash} from 'node:crypto';
import {WalletError, kobo, reference} from './provider.mjs';
const fail = (message, status=409) => {throw new WalletError(message,status);};

export class WalletHolds {
  constructor({ledger, platformProviderWalletId}) {
    this.ledger=ledger; this.pool=ledger.pool; this.schema=ledger.schema;
    this.platformProviderWalletId=platformProviderWalletId;
  }
  async reserve(input) {
    // Get a fresh authoritative observation BEFORE the lock; recheck under the lock below.
    await this.ledger.refreshBankBalance(input.vendorWalletId);
    return this.ledger.transaction(client=>this.reserveInTransaction(client,input));
  }
  async reserveInTransaction(client,{shipmentId,vendorWalletId,deliveryType,totalKobo,fees,platformKobo=0}) {
    reference(shipmentId);kobo(totalKobo);kobo(platformKobo,{zero:true});
    const legs=deliveryType==='intrastate'?['pickup']:deliveryType==='interstate'?['pickup','carrier','lastmile']:fail('Invalid custody chain.',400);
    for(const leg of legs)kobo(fees?.[leg]);
    if(Object.keys(fees).some(leg=>!legs.includes(leg))||legs.reduce((n,leg)=>n+BigInt(fees[leg]),BigInt(platformKobo))!==BigInt(totalKobo))fail('Invalid stage allocation.',400);
    const vendor=await this.ledger.read(vendorWalletId);
    if(vendor.role!=='vendor')fail('Only vendor wallets can fund shipments.',403);
    await client.query(`SELECT id FROM ${this.schema}.accounts WHERE id=$1 FOR UPDATE`,[vendor.accountId]);
    const prior=(await client.query(`SELECT * FROM ${this.schema}.holds WHERE shipment_id=$1`,[shipmentId])).rows[0];
    if(prior){
      const stages=(await client.query(`SELECT leg,amount_kobo FROM ${this.schema}.hold_stages WHERE hold_id=$1`,[prior.id])).rows;
      const expected={...fees,...(platformKobo?{platform_fee:platformKobo}:{})};
      if(prior.vendor_wallet_id!==vendorWalletId||prior.delivery_type!==deliveryType||Number(prior.amount_kobo)!==totalKobo||stages.length!==Object.keys(expected).length||stages.some(s=>Number(s.amount_kobo)!==expected[s.leg]))fail('Shipment hold conflicts with the original quote.');
      return prior;
    }
    const row=(await client.query(`SELECT w.*,a.balance_kobo FROM ${this.schema}.wallets w JOIN ${this.schema}.accounts a ON a.id=w.account_id WHERE w.id=$1 FOR UPDATE OF w`,[vendorWalletId])).rows[0];
    if(row.bank_status!=='matched'||Number(row.bank_balance_kobo)!==Number(row.balance_kobo)||this.ledger.clock()-Number(row.bank_observed_at)>this.ledger.freshnessMs)fail('Refresh and reconcile the bank balance before reserving funds.');
    const id=randomUUID();
    // The account CHECK, evaluated by PostgreSQL, prevents simultaneous reservations overdrawing availability.
    await client.query(`UPDATE ${this.schema}.accounts SET held_kobo=held_kobo+$2 WHERE id=$1`,[vendor.accountId,totalKobo]);
    await client.query(`INSERT INTO ${this.schema}.holds(id,shipment_id,vendor_wallet_id,delivery_type,amount_kobo) VALUES($1,$2,$3,$4,$5)`,[id,shipmentId,vendorWalletId,deliveryType,totalKobo]);
    for(const [leg,amount] of Object.entries({...fees,...(platformKobo?{platform_fee:platformKobo}:{})}))await client.query(`INSERT INTO ${this.schema}.hold_stages(id,hold_id,leg,amount_kobo) VALUES($1,$2,$3,$4)`,[randomUUID(),id,leg,amount]);
    return {id,shipment_id:shipmentId,amount_kobo:totalKobo};
  }
  async queueStage(client,{hold,leg,recipientOwnerId,amountKobo,idempotencyKey}) {
    const stage=(await client.query(`SELECT * FROM ${this.schema}.hold_stages WHERE hold_id=$1 AND leg=$2 FOR UPDATE`,[hold.id,leg])).rows[0];
    if(!stage)return;
    if(hold.state!=='active')fail('This hold is disputed or closed.');
    const remaining=Number(stage.amount_kobo)-Number(stage.released_kobo)-Number(stage.refunded_kobo)-Number(stage.pending_kobo);
    const amount=amountKobo??remaining;
    if(amount===0)return;
    kobo(amount);if(amount>remaining)fail('Stage amount is already pending, released or refunded.');
    let target;
    if(leg==='platform_fee'){
      if(!this.platformProviderWalletId)fail('Configure the mock platform bank wallet before releasing the fee.',503);
      target={id:null,provider_wallet_id:this.platformProviderWalletId};
    }else{
      target=(await client.query(`SELECT * FROM ${this.schema}.wallets WHERE owner_role='rider' AND owner_id=$1`,[recipientOwnerId])).rows[0];
      if(!target)fail('The handler needs a KYC-approved wallet before this custody handoff.',409);
      if(stage.recipient_wallet_id&&stage.recipient_wallet_id!==target.id)fail('Stage recipient cannot be replaced.');
    }
    const key=idempotencyKey||'stage:'+stage.id+':'+Number(stage.released_kobo);
    await client.query(`UPDATE ${this.schema}.hold_stages SET pending_kobo=pending_kobo+$2,recipient_wallet_id=coalesce(recipient_wallet_id,$3) WHERE id=$1`,[stage.id,amount,target.id]);
    await client.query(`INSERT INTO ${this.schema}.outbox(id,idempotency_key,purpose,stage_id,source_wallet_id,target_wallet_id,target_provider_wallet_id,amount_kobo) VALUES($1,$2,'stage_release',$3,$4,$5,$6,$7)`,[randomUUID(),key,stage.id,hold.vendor_wallet_id,target.id,target.provider_wallet_id,amount]);
  }
  async onTransitionInTransaction(client,before,after,{otpVerified=false}={}) {
    const hold=(await client.query(`SELECT * FROM ${this.schema}.holds WHERE shipment_id=$1 FOR UPDATE`,[before.id])).rows[0];
    if(!hold)return; // Legacy parcels are never retroactively funded.
    if(after.id!==before.id||after.deliveryType!==hold.delivery_type)fail('Custody shipment mismatch.');
    const accepted={
      'Carrier handoff requested:Carrier accepted':'pickup',
      'Last-mile handoff requested:Last-mile rider accepted':'carrier'
    };
    let leg=accepted[before.status+':'+after.status];
    if(after.status==='Delivered'){
      if(before.status!=='Delivery OTP sent'||!otpVerified)fail('Final release requires the verified customer OTP.',403);
      leg=hold.delivery_type==='intrastate'?'pickup':'lastmile';
    }
    if(leg){
      const owner=before.actors?.[leg]?.id;
      if(!owner)fail('The accepted custody stage has no accountable handler.');
      await this.queueStage(client,{hold,leg,recipientOwnerId:owner});
    }
    if(after.status==='Delivered')await this.queueStage(client,{hold,leg:'platform_fee'});
  }
}

import {createHash,randomUUID} from 'node:crypto';
import {namespace} from './migrate.mjs';
import {WalletError,kobo,reference} from './provider.mjs';
export const BANK_ACCOUNT='00000000-0000-4000-8000-000000000002';
export const FEE_ACCOUNT='00000000-0000-4000-8000-000000000001';
const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const uuid=value=>typeof value==='string'&&/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(value);
// Internal-only accounting primitive. Never expose post() as a client funding endpoint.
export class WalletLedger {
 constructor({pool,provider,kycLookup,schema='sendrack_wallet',clock=Date.now,freshnessMs=30000}) {
  if(provider?.id!=='mock-bank'||provider.mode!=='mock'||typeof kycLookup!=='function')throw new WalletError('Phase 1 requires a mock provider and trusted KYC lookup.');
  this.pool=pool;this.provider=provider;this.kycLookup=kycLookup;this.schema=namespace(schema);this.clock=clock;this.freshnessMs=freshnessMs;
 }
 async transaction(action){const c=await this.pool.connect();try{await c.query('BEGIN');const result=await action(c);await c.query('COMMIT');return result;}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}}
 snapshot(value,walletId){
  if(value.walletId!==walletId||value.currency!=='NGN'||value.mode!=='mock'||!Number.isSafeInteger(value.revision)||value.revision<0||!Number.isSafeInteger(value.observedAt)||value.observedAt<0||value.observedAt>this.clock()+5000)throw new WalletError('Invalid provider balance response.',502);
  kobo(value.balanceKobo,{zero:true});return value;
 }
 async createWallet({role,ownerId}) {
  if(!['vendor','rider'].includes(role))throw new WalletError('Unsupported wallet role.');reference(ownerId);
  const kyc=await this.kycLookup({role,ownerId});
  if(kyc?.status!=='approved')throw new WalletError('Approved KYC is required before wallet creation.',403);
  reference(kyc.reference);
  const existing=await this.pool.query(`SELECT id FROM ${this.schema}.wallets WHERE owner_role=$1 AND owner_id=$2`,[role,ownerId]);
  if(existing.rowCount)return this.read(existing.rows[0].id);
  const ownerReference=digest([role,ownerId]);
  // Provider calls finish before any row lock or database transaction begins.
  const remote=await this.provider.createWallet({ownerReference,kycReference:kyc.reference,idempotencyKey:'create:'+ownerReference,currency:'NGN'});
  if(remote.ownerReference!==ownerReference)throw new WalletError('Provider owner mismatch.',502);
  const bank=this.snapshot(await this.provider.getBalance({walletId:remote.walletId}),remote.walletId);
  const id=await this.transaction(async c=>{
   await c.query('SELECT pg_advisory_xact_lock(hashtext($1))',['wallet-owner:'+ownerReference]);
   const prior=await c.query(`SELECT id FROM ${this.schema}.wallets WHERE owner_role=$1 AND owner_id=$2`,[role,ownerId]);
   if(prior.rowCount)return prior.rows[0].id;
   const accountId=randomUUID(),walletId=randomUUID();
   await c.query(`INSERT INTO ${this.schema}.accounts(id,kind,owner_id) VALUES($1,$2,$3)`,[accountId,role,ownerId]);
   await c.query(`INSERT INTO ${this.schema}.wallets(id,owner_role,owner_id,account_id,provider_id,provider_wallet_id,provider_owner_reference,kyc_reference,bank_balance_kobo,bank_observed_at,bank_revision,bank_status) VALUES($1,$2,$3,$4,'mock-bank',$5,$6,$7,$8,$9,$10,$11)`,[walletId,role,ownerId,accountId,remote.walletId,ownerReference,kyc.reference,bank.balanceKobo,bank.observedAt,bank.revision,bank.balanceKobo===0?'matched':'mismatch']);
   return walletId;
  });return this.read(id);
 }
 async post(input) {return this.transaction(client=>this.postInTransaction(client,input));}
 // Shares an existing caller-owned transaction; never commits or calls the provider.
 async postInTransaction(c,{idempotencyKey,kind,reference:ref,memo='',lines}) {
  reference(idempotencyKey);reference(ref);
  if(idempotencyKey.length<8||typeof kind!=='string'||kind.length<1||kind.length>40||typeof memo!=='string'||memo.length>300||!Array.isArray(lines)||lines.length<2||lines.length>100)throw new WalletError('Invalid journal.');
  const normalized=lines.map(l=>{if(!uuid(l.accountId))throw new WalletError('Invalid ledger account.');const debitKobo=kobo(l.debitKobo??0,{zero:true}),creditKobo=kobo(l.creditKobo??0,{zero:true});if((debitKobo>0)===(creditKobo>0))throw new WalletError('Each line must contain one debit or credit.');return {accountId:l.accountId,debitKobo,creditKobo};}).sort((a,b)=>a.accountId.localeCompare(b.accountId));
  if(new Set(normalized.map(l=>l.accountId)).size!==normalized.length||normalized.reduce((sum,l)=>sum+BigInt(l.debitKobo)-BigInt(l.creditKobo),0n)!==0n)throw new WalletError('Journal must balance across distinct accounts.');
  const hash=digest([kind,ref,memo,normalized]);
   const id=randomUUID();
   const inserted=await c.query(`INSERT INTO ${this.schema}.transactions(id,idempotency_key,request_hash,kind,reference,memo) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(idempotency_key) DO NOTHING RETURNING id`,[id,idempotencyKey,hash,kind,ref,memo]);
   if(!inserted.rowCount){const prior=(await c.query(`SELECT id,request_hash FROM ${this.schema}.transactions WHERE idempotency_key=$1`,[idempotencyKey])).rows[0];if(prior.request_hash!==hash)throw new WalletError('Conflicting idempotency key.',409);return {id:prior.id,replayed:true};}
   const accounts=await c.query(`SELECT id FROM ${this.schema}.accounts WHERE id=ANY($1::uuid[]) ORDER BY id FOR UPDATE`,[normalized.map(l=>l.accountId)]);
   if(accounts.rowCount!==normalized.length)throw new WalletError('Ledger account not found.',404);
   for(const [index,line] of normalized.entries())await c.query(`INSERT INTO ${this.schema}.ledger_entries(transaction_id,line_number,account_id,debit_kobo,credit_kobo) VALUES($1,$2,$3,$4,$5)`,[id,index+1,line.accountId,line.debitKobo,line.creditKobo]);
   await c.query(`UPDATE ${this.schema}.transactions SET sealed=true WHERE id=$1`,[id]);
   return {id,replayed:false};
 }
 async read(id){
  const result=await this.pool.query(`SELECT w.*,a.balance_kobo,a.held_kobo,a.available_kobo FROM ${this.schema}.wallets w JOIN ${this.schema}.accounts a ON a.id=w.account_id WHERE w.id=$1`,[id]);
  if(!result.rowCount)throw new WalletError('Wallet not found.',404);
  const row=result.rows[0],bank=Number(row.bank_balance_kobo),ledger=Number(row.balance_kobo),observedAt=Number(row.bank_observed_at);
  const state=row.reconciliation_blocked?'reconciliation_required':row.bank_status==='unavailable'?'unavailable':bank!==ledger?'mismatch':row.bank_status==='unconfirmed'?'unconfirmed':this.clock()-observedAt>this.freshnessMs?'stale':'matched';
  return {id:row.id,accountId:row.account_id,providerWalletId:row.provider_wallet_id,ownerId:row.owner_id,role:row.owner_role,mode:'mock',currency:'NGN',bankBalanceKobo:bank,ledgerBalanceKobo:ledger,heldKobo:Number(row.held_kobo),availableLedgerKobo:Number(row.available_kobo),bankObservedAt:observedAt,state,canSpend:state==='matched',spendableKobo:state==='matched'?Number(row.available_kobo):null};
 }
 async refreshBankBalance(id){
  const wallet=await this.read(id);let bank;
  try{bank=this.snapshot(await this.provider.getBalance({walletId:wallet.providerWalletId}),wallet.providerWalletId);}
  catch(error){await this.pool.query(`UPDATE ${this.schema}.wallets SET bank_status='unavailable' WHERE id=$1`,[id]);throw error;}
  await this.transaction(async c=>{
   await c.query(`SELECT id FROM ${this.schema}.accounts WHERE id=$1 FOR UPDATE`,[wallet.accountId]);
   const row=(await c.query(`SELECT w.*,a.balance_kobo FROM ${this.schema}.wallets w JOIN ${this.schema}.accounts a ON a.id=w.account_id WHERE w.id=$1 FOR UPDATE OF w`,[id])).rows[0];
   if(bank.revision<Number(row.bank_revision)||bank.observedAt<Number(row.bank_observed_at))return;
   await c.query(`UPDATE ${this.schema}.wallets SET bank_balance_kobo=$2,bank_observed_at=$3,bank_revision=$4,bank_status=$5 WHERE id=$1`,[id,bank.balanceKobo,bank.observedAt,bank.revision,bank.balanceKobo===Number(row.balance_kobo)?'matched':'mismatch']);
  });return this.read(id);
 }
}

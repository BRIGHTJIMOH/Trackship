import {randomUUID,randomBytes,randomInt,createHmac,scrypt as scryptCallback,timingSafeEqual} from 'node:crypto';
import {promisify} from 'node:util';
import {WalletError,kobo,reference} from './provider.mjs';
import {BANK_ACCOUNT} from './ledger.mjs';
const scrypt=promisify(scryptCallback);
const fail=(message,status=409)=>{throw new WalletError(message,status);};
const equal=(a,b)=>{const x=Buffer.from(a),y=Buffer.from(b);return x.length===y.length&&timingSafeEqual(x,y);};
export class WalletWithdrawals {
 constructor({ledger,pepper,deliverOtp}) {
  if(typeof pepper!=='string'||pepper.length<32||typeof deliverOtp!=='function')throw new Error('Private wallet security secret and trusted OTP delivery are required.');
  this.ledger=ledger;this.pool=ledger.pool;this.schema=ledger.schema;this.pepper=pepper;this.deliverOtp=deliverOtp;
 }
 hash(value){return createHmac('sha256',this.pepper).update(value).digest('hex');}
 async pinHash(pin,salt){return (await scrypt(this.hash(pin),salt,32,{N:32768,r:8,p:1,maxmem:64*1024*1024})).toString('hex');}
 async policy(walletId,client=this.pool) {
  const wallet=await this.ledger.read(walletId);
  const kyc=await this.ledger.kycLookup({role:wallet.role,ownerId:wallet.ownerId});
  const settings=(await client.query(`SELECT * FROM ${this.schema}.settings WHERE id=1`)).rows[0];
  const limits=settings.tiers[kyc?.tier];
  if(kyc?.status!=='approved'||!limits||!settings.approval_threshold_kobo)fail('The owner must configure approved bank KYC limits and approval threshold before withdrawals.',503);
  for(const key of ['perTransactionKobo','dailyKobo','monthlyKobo'])kobo(limits[key]);
  return {wallet,tier:kyc.tier,limits,settings};
 }
 async prepare({walletId,bankCode,accountNumber,amountKobo,idempotencyKey}) {
  kobo(amountKobo);reference(idempotencyKey);if(idempotencyKey.length<8)fail('Use a stable withdrawal reference.',400);
  const {limits}=await this.policy(walletId);
  if(amountKobo>limits.perTransactionKobo)fail('Amount exceeds your configured KYC transaction limit.');
  const inputHash=this.hash(JSON.stringify([walletId,bankCode,accountNumber,amountKobo]));
  const prior=(await this.pool.query(`SELECT * FROM ${this.schema}.withdrawal_quotes WHERE idempotency_key=$1`,[idempotencyKey])).rows[0];
  if(prior){if(prior.wallet_id!==walletId||prior.input_hash!==inputHash)fail('Withdrawal reference was reused with different details.');return prior;}
  const beneficiary=await this.ledger.provider.resolveAccountName({bankCode,accountNumber});
  if(beneficiary.mode!=='mock'||!beneficiary.beneficiaryId||!beneficiary.accountName||!beneficiary.maskedAccount)fail('Account name could not be verified.',502);
  const result=await this.pool.query(`INSERT INTO ${this.schema}.withdrawal_quotes(id,wallet_id,idempotency_key,input_hash,amount_kobo,beneficiary_id,account_name,masked_account,bank_code,expires)
   VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT(idempotency_key) DO NOTHING RETURNING *`,
   [randomUUID(),walletId,idempotencyKey,inputHash,amountKobo,beneficiary.beneficiaryId,beneficiary.accountName,beneficiary.maskedAccount,bankCode,this.ledger.clock()+600000]);
  if(result.rowCount)return result.rows[0];
  const raced=(await this.pool.query(`SELECT * FROM ${this.schema}.withdrawal_quotes WHERE idempotency_key=$1`,[idempotencyKey])).rows[0];
  if(raced.wallet_id!==walletId||raced.input_hash!==inputHash)fail('Withdrawal reference conflict.');return raced;
 }
 async requestOtp({walletId,purpose,quoteId}) {
  if(!['pin','withdrawal'].includes(purpose))fail('Invalid security challenge.',400);
  if(purpose==='withdrawal'){
   const quote=(await this.pool.query(`SELECT id FROM ${this.schema}.withdrawal_quotes WHERE id=$1 AND wallet_id=$2 AND expires>$3`,[quoteId,walletId,this.ledger.clock()])).rows[0];
   if(!quote)fail('Review a current withdrawal quote first.');
  }
  const now=this.ledger.clock(),code=String(randomInt(100000,1000000)),salt=randomBytes(16).toString('hex'),id=randomUUID();
  await this.ledger.transaction(async c=>{
   const wallet=(await c.query(`SELECT id FROM ${this.schema}.wallets WHERE id=$1 FOR UPDATE`,[walletId])).rows[0];if(!wallet)fail('Wallet not found.',404);
   const counts=(await c.query(`SELECT count(*) n,max(created_at) latest FROM ${this.schema}.wallet_challenges WHERE wallet_id=$1 AND created_at>$2`,[walletId,now-3600000])).rows[0];
   if(Number(counts.n)>=5||counts.latest!==null&&now-Number(counts.latest)<60000)fail('Wait before requesting another wallet code.',429);
   await c.query(`UPDATE ${this.schema}.wallet_challenges SET used=true WHERE wallet_id=$1 AND used=false`,[walletId]);
   await c.query(`INSERT INTO ${this.schema}.wallet_challenges(id,wallet_id,purpose,binding,salt,code_hash,expires,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,[id,walletId,purpose,purpose==='pin'?'pin':quoteId,salt,this.hash(salt+code),now+300000,now]);
  });
  try{await this.deliverOtp({walletId,purpose,code});}
  catch{await this.pool.query(`UPDATE ${this.schema}.wallet_challenges SET used=true WHERE id=$1`,[id]);fail('Wallet code delivery failed. Retry later.',503);}
  return {challengeId:id,expiresAt:now+300000};
 }
 async checkOtp(c,{walletId,purpose,binding,challengeId,otp}) {
  const challenge=(await c.query(`SELECT * FROM ${this.schema}.wallet_challenges WHERE id=$1 AND wallet_id=$2 FOR UPDATE`,[challengeId,walletId])).rows[0];
  if(!challenge||challenge.used||challenge.purpose!==purpose||challenge.binding!==binding||Number(challenge.expires)<=this.ledger.clock()||challenge.attempts>=5)return false;
  const valid=/^\d{6}$/.test(otp||'')&&equal(this.hash(challenge.salt+otp),challenge.code_hash);
  await c.query(`UPDATE ${this.schema}.wallet_challenges SET attempts=attempts+1,used=$2 WHERE id=$1`,[challenge.id,valid]);
  return valid;
 }
 async setPin({walletId,pin,challengeId,otp}) {
  if(!/^\d{6}$/.test(pin||''))fail('Choose a six-digit transaction PIN.',400);
  const salt=randomBytes(16).toString('hex'),hash=await this.pinHash(pin,salt);
  const saved=await this.ledger.transaction(async c=>{
   await c.query(`SELECT id FROM ${this.schema}.wallets WHERE id=$1 FOR UPDATE`,[walletId]);
   if(!await this.checkOtp(c,{walletId,purpose:'pin',binding:'pin',challengeId,otp}))return false;
   await c.query(`INSERT INTO ${this.schema}.wallet_security(wallet_id,pin_salt,pin_hash) VALUES($1,$2,$3) ON CONFLICT(wallet_id) DO UPDATE SET pin_salt=$2,pin_hash=$3,pin_failures=0,locked_until=0`,[walletId,salt,hash]);return true;
  });if(!saved)fail('Wallet code is incorrect, used or expired.',401);return {saved:true};
 }
 async confirm({walletId,quoteId,pin,challengeId,otp}) {
  const quote=(await this.pool.query(`SELECT * FROM ${this.schema}.withdrawal_quotes WHERE id=$1 AND wallet_id=$2`,[quoteId,walletId])).rows[0];if(!quote)fail('Withdrawal quote not found.',404);
  const existing=(await this.pool.query(`SELECT * FROM ${this.schema}.payouts WHERE quote_id=$1`,[quoteId])).rows[0];if(existing)return existing;
  if(Number(quote.expires)<=this.ledger.clock())fail('Withdrawal quote expired.');
  const security=(await this.pool.query(`SELECT * FROM ${this.schema}.wallet_security WHERE wallet_id=$1`,[walletId])).rows[0];
  if(!security||Number(security.locked_until)>this.ledger.clock())fail('Set your transaction PIN or wait for its security lock to expire.',403);
  if(!/^\d{6}$/.test(pin||'')||!equal(await this.pinHash(pin,security.pin_salt),security.pin_hash)){
   await this.pool.query(`UPDATE ${this.schema}.wallet_security SET pin_failures=pin_failures+1,locked_until=CASE WHEN pin_failures>=4 THEN $2 ELSE locked_until END WHERE wallet_id=$1`,[walletId,this.ledger.clock()+900000]);fail('Incorrect transaction PIN.',401);
  }
  const policy=await this.policy(walletId);
  await this.ledger.refreshBankBalance(walletId);
  const result=await this.ledger.transaction(async c=>{
   await c.query(`SELECT id FROM ${this.schema}.accounts WHERE id=$1 FOR UPDATE`,[policy.wallet.accountId]);
   await c.query(`SELECT id FROM ${this.schema}.wallets WHERE id=$1 FOR UPDATE`,[walletId]);
   const secured=(await c.query(`SELECT * FROM ${this.schema}.wallet_security WHERE wallet_id=$1 FOR UPDATE`,[walletId])).rows[0];
   if(secured.pin_hash!==security.pin_hash||Number(secured.locked_until)>this.ledger.clock())fail('Wallet security changed. Retry.',403);
   const prior=(await c.query(`SELECT * FROM ${this.schema}.payouts WHERE quote_id=$1`,[quoteId])).rows[0];if(prior)return prior;
   if(!await this.checkOtp(c,{walletId,purpose:'withdrawal',binding:quoteId,challengeId,otp}))return {invalidOtp:true};
   // Settings are re-read under a shared lock so a concurrent policy edit cannot be missed.
   const settings=(await c.query(`SELECT * FROM ${this.schema}.settings WHERE id=1 FOR SHARE`)).rows[0],limits=settings.tiers[policy.tier];
   if(!limits||!settings.approval_threshold_kobo)fail('Approved withdrawal policy is required.',503);
   const sums=(await c.query(`SELECT coalesce(sum(amount_kobo) FILTER(WHERE created_at>=((to_timestamp($2/1000.0) AT TIME ZONE 'Africa/Lagos')::date AT TIME ZONE 'Africa/Lagos')),0) daily,
    coalesce(sum(amount_kobo),0) monthly FROM ${this.schema}.payouts WHERE wallet_id=$1 AND state NOT IN ('failed','rejected') AND created_at>= (date_trunc('month',to_timestamp($2/1000.0) AT TIME ZONE 'Africa/Lagos') AT TIME ZONE 'Africa/Lagos')`,[walletId,this.ledger.clock()])).rows[0];
   const amount=Number(quote.amount_kobo);if(amount>limits.perTransactionKobo||BigInt(sums.daily)+BigInt(amount)>BigInt(limits.dailyKobo)||BigInt(sums.monthly)+BigInt(amount)>BigInt(limits.monthlyKobo))fail('Withdrawal exceeds the configured KYC limits.');
   const bank=(await c.query(`SELECT w.*,a.balance_kobo FROM ${this.schema}.wallets w JOIN ${this.schema}.accounts a ON a.id=w.account_id WHERE w.id=$1 FOR UPDATE OF w`,[walletId])).rows[0];
   if(bank.bank_status!=='matched'||Number(bank.bank_balance_kobo)!==Number(bank.balance_kobo)||this.ledger.clock()-Number(bank.bank_observed_at)>this.ledger.freshnessMs)fail('Reconcile the bank balance before withdrawing.');
   await c.query(`UPDATE ${this.schema}.accounts SET held_kobo=held_kobo+$2 WHERE id=$1`,[policy.wallet.accountId,amount]);
   await c.query(`UPDATE ${this.schema}.wallet_security SET pin_failures=0 WHERE wallet_id=$1`,[walletId]);
   return (await c.query(`INSERT INTO ${this.schema}.payouts(id,wallet_id,quote_id,idempotency_key,amount_kobo,tier) VALUES($1,$2,$3,$4,$5,$6) RETURNING *`,[randomUUID(),walletId,quoteId,quote.idempotency_key,amount,policy.tier])).rows[0];
  });if(result.invalidOtp)fail('Wallet code is incorrect, used or expired.',401);return result;
 }
 async settle(task,result) {
  await this.ledger.transaction(async c=>{
   const wallet=await this.ledger.read(task.source_wallet_id);
   await c.query(`SELECT id FROM ${this.schema}.accounts WHERE id=ANY($1::uuid[]) ORDER BY id FOR UPDATE`,[[wallet.accountId,BANK_ACCOUNT]]);
   const current=(await c.query(`SELECT * FROM ${this.schema}.outbox WHERE id=$1 FOR UPDATE`,[task.id])).rows[0];if(current.status!=='processing'||current.lease_token!==task.lease_token)return;
   const payout=(await c.query(`SELECT * FROM ${this.schema}.payouts WHERE id=$1 FOR UPDATE`,[task.payout_id])).rows[0];if(!payout||payout.state!=='pending')fail('Invalid pending payout.');
   const amount=Number(task.amount_kobo);
   await c.query(`UPDATE ${this.schema}.accounts SET held_kobo=held_kobo-$2 WHERE id=$1`,[wallet.accountId,amount]);
   let journal;
   if(result.status==='success')journal=await this.ledger.postInTransaction(c,{idempotencyKey:'payout-settle:'+payout.id,kind:'withdrawal',reference:task.idempotency_key,lines:[{accountId:wallet.accountId,debitKobo:amount},{accountId:BANK_ACCOUNT,creditKobo:amount}]});
   await c.query(`UPDATE ${this.schema}.payouts SET state=$2,journal_id=$3 WHERE id=$1`,[payout.id,result.status==='success'?'paid':'failed',journal?.id||null]);
   await c.query(`UPDATE ${this.schema}.outbox SET status=$2,result_code=$3,lease_token=NULL,lease_until=0 WHERE id=$1`,[task.id,result.status==='success'?'done':'failed',result.status==='success'?'bank_confirmed':'bank_rejected']);
   await c.query(`UPDATE ${this.schema}.wallets SET bank_status='unconfirmed' WHERE id=$1`,[wallet.id]);
  });
 }
}

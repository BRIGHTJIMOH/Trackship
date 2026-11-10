import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {walletFixture} from './fixture.mjs';
import {WalletWithdrawals} from '../../server/wallet/withdrawals.mjs';
const run=(name,fn)=>test(name,{skip:!process.env.WALLET_TEST_DATABASE_URL},async t=>fn(t,await walletFixture(t)));
async function setup(f,amount=1000){
 const texts=[],withdrawals=new WalletWithdrawals({ledger:f.ledger,pepper:'private-synthetic-wallet-security-secret',deliverOtp:async p=>texts.push(p)});
 const wallet=await f.wallet('vendor',amount);
 const otp=await withdrawals.requestOtp({walletId:wallet.id,purpose:'pin'});
 await withdrawals.setPin({walletId:wallet.id,pin:'135790',challengeId:otp.challengeId,otp:texts.at(-1).code});
 return {withdrawals,wallet,texts};
}
async function policy(f){await f.pool.query(`UPDATE ${f.schema}.settings SET approval_threshold_kobo=500,tiers=$1 WHERE id=1`,[JSON.stringify({TEST_TIER:{perTransactionKobo:1000,dailyKobo:1500,monthlyKobo:2000}})]);}
async function prepare(f,s,amount=800){const quote=await s.withdrawals.prepare({walletId:s.wallet.id,amountKobo:amount,bankCode:'999',accountNumber:'0000000000',idempotencyKey:randomUUID()});f.advance(61000);const otp=await s.withdrawals.requestOtp({walletId:s.wallet.id,purpose:'withdrawal',quoteId:quote.id});return {walletId:s.wallet.id,quoteId:quote.id,pin:'135790',challengeId:otp.challengeId,otp:s.texts.at(-1).code};}
run('withdrawals: missing approved settings fail closed; PIN enrollment needs OTP; codes are single use',async(t,f)=>{
 const s=await setup(f);
 await assert.rejects(s.withdrawals.prepare({walletId:s.wallet.id,amountKobo:100,bankCode:'999',accountNumber:'0000000000',idempotencyKey:randomUUID()}),/configure approved/);
 const challenge=(await f.pool.query(`SELECT id FROM ${f.schema}.wallet_challenges`)).rows[0];
 await assert.rejects(s.withdrawals.setPin({walletId:s.wallet.id,pin:'246802',challengeId:challenge.id,otp:s.texts[0].code}),/used or expired/);
 await policy(f);const input=await prepare(f,s);const payout=await s.withdrawals.confirm(input);
 assert.equal(payout.state,'awaiting_approval');assert.equal((await f.ledger.read(s.wallet.id)).heldKobo,800);
 assert.equal((await s.withdrawals.confirm(input)).id,payout.id);
 assert.equal((await f.provider.getBalance({walletId:s.wallet.providerWalletId})).balanceKobo,1000);
});
run('withdrawals: simultaneous hold and withdrawal cannot spend the same money',async(t,f)=>{
 const s=await setup(f);await policy(f);const input=await prepare(f,s);
 const outcomes=await Promise.allSettled([s.withdrawals.confirm(input),f.holds.reserve({shipmentId:randomUUID(),vendorWalletId:s.wallet.id,deliveryType:'intrastate',totalKobo:800,fees:{pickup:800}})]);
 assert.equal(outcomes.filter(o=>o.status==='fulfilled').length,1);
 assert.equal((await f.ledger.read(s.wallet.id)).heldKobo,800);
 await assert.rejects(f.pool.query(`UPDATE ${f.schema}.accounts SET held_kobo=0 WHERE id=$1`,[s.wallet.accountId]),/Reserved balance/);
});
run('withdrawals: wrong PIN locks, wrong OTP attempts persist, and expired codes cannot reserve funds',async(t,f)=>{
 const s=await setup(f);await policy(f);const input=await prepare(f,s,100);
 for(let i=0;i<5;i++)await assert.rejects(s.withdrawals.confirm({...input,pin:'000000'}),/Incorrect transaction PIN/);
 await assert.rejects(s.withdrawals.confirm(input),/security lock/);
 f.advance(901000);
 const renewed=await prepare(f,s,100);
 for(let i=0;i<5;i++)await assert.rejects(s.withdrawals.confirm({...renewed,otp:'000000'}),/code is incorrect/);
 await assert.rejects(s.withdrawals.confirm(renewed),/code is incorrect/);
 const expired=await prepare(f,s,100);f.advance(301000);
 await assert.rejects(s.withdrawals.confirm(expired),/code is incorrect/);
 assert.equal((await f.ledger.read(s.wallet.id)).heldKobo,0);
});

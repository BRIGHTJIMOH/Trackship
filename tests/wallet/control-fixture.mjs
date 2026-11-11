import {walletFixture} from './fixture.mjs';
import {WalletAdmin} from '../../server/wallet/admin.mjs';
import {WalletWithdrawals} from '../../server/wallet/withdrawals.mjs';
import {FinanceAuth} from '../../server/wallet/finance-auth.mjs';
export const owner={id:'owner:synthetic-owner',role:'Admin',username:'synthetic-owner'};
export const checker={id:'staff:synthetic-checker',role:'Finance'};
export const support={id:'staff:synthetic-support',role:'Support'};
export async function controlFixture(t){
 const f=await walletFixture(t),texts=[];
 const admin=new WalletAdmin({ledger:f.ledger,holds:f.holds});
 const auth=new FinanceAuth({admin,secret:'private-synthetic-finance-test-session-key'});
 const withdrawals=new WalletWithdrawals({ledger:f.ledger,pepper:'private-synthetic-wallet-security-secret',deliverOtp:async p=>texts.push(p)});
 f.worker.withdrawals=withdrawals;
 const policy=()=>admin.updateSettings(owner,{revision:1,tiers:{TEST_TIER:{perTransactionKobo:100000,dailyKobo:200000,monthlyKobo:500000}},approvalThresholdKobo:500,reason:'Synthetic bank policy for isolated tests'});
 async function payout(amount=800){const wallet=await f.wallet('rider',1000);let code=await withdrawals.requestOtp({walletId:wallet.id,purpose:'pin'});await withdrawals.setPin({walletId:wallet.id,pin:'135790',challengeId:code.challengeId,otp:texts.at(-1).code});
  const q=await withdrawals.prepare({walletId:wallet.id,amountKobo:amount,bankCode:'999',accountNumber:'0000000000',idempotencyKey:crypto.randomUUID()});f.advance(61000);
  code=await withdrawals.requestOtp({walletId:wallet.id,purpose:'withdrawal',quoteId:q.id});const p=await withdrawals.confirm({walletId:wallet.id,quoteId:q.id,pin:'135790',challengeId:code.challengeId,otp:texts.at(-1).code});return {wallet,payout:p};
 }
 return {...f,admin,auth,withdrawals,texts,policy,payout};
}

import {randomUUID,createHmac} from 'node:crypto';
import pg from 'pg';
import {migrateWallet} from '../../server/wallet/migrate.mjs';
import {MockBankProvider} from '../../server/wallet/mock-bank-provider.mjs';
import {WalletLedger} from '../../server/wallet/ledger.mjs';
import {WalletFunding} from '../../server/wallet/funding.mjs';
import {WalletHolds} from '../../server/wallet/holds.mjs';
import {WalletWorker} from '../../server/wallet/worker.mjs';
export async function walletFixture(t) {
 const pool=new pg.Pool({connectionString:process.env.WALLET_TEST_DATABASE_URL,max:12});
 const schema='control_test_'+randomUUID().replaceAll('-','');
 t.after(async()=>{await pool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);await pool.end();});
 await migrateWallet(pool,{schema});let clock=Date.now();
 const secret='isolated-mock-wallet-control-test-secret';
 const provider=new MockBankProvider({webhookSecret:secret,allowTestOperations:true,clock:()=>clock});
 const ledger=new WalletLedger({pool,schema,provider,clock:()=>clock,kycLookup:async()=>({status:'approved',reference:'synthetic-kyc-only'})});
 const funding=new WalletFunding({ledger});
 async function wallet(role,amount=0){const w=await ledger.createWallet({role,ownerId:randomUUID()});
  if(amount){const credit=provider.fundForTest(w.providerWalletId,amount,randomUUID());
   const rawBody=Buffer.from(JSON.stringify({version:1,type:'wallet.funded',mode:'mock',eventId:randomUUID(),providerTransactionId:credit.providerTransactionId,walletId:w.providerWalletId,amountKobo:amount,currency:'NGN',occurredAt:clock}));
   await funding.receive({rawBody,signature:createHmac('sha256',secret).update(rawBody).digest('hex')});}
  return ledger.read(w.id);
 }
 const fee=await provider.createWallet({ownerReference:'synthetic-platform',kycReference:'synthetic-business-kyc',idempotencyKey:'platform-wallet'});
 const holds=new WalletHolds({ledger,platformProviderWalletId:fee.walletId});
 const worker=new WalletWorker({ledger});
 return {pool,schema,provider,ledger,funding,holds,worker,wallet,advance(ms){clock+=ms;}};
}

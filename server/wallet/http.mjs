import {WalletError} from './provider.mjs';
import {requireRole} from './admin.mjs';
const fail=(message,status=400)=>{throw new WalletError(message,status);};
const PREFIX='/api/wallet';
async function json(req){let size=0,parts=[];for await(const chunk of req){size+=chunk.length;if(size>65536)fail('Request is too large.',413);parts.push(chunk);}try{return JSON.parse(Buffer.concat(parts).toString());}catch{fail('Invalid JSON.');}}
const csvCell=value=>'"'+String(value??'').replace(/^[=+@\-\t\r]/,"'$&").replaceAll('"','""')+'"';
export function createWalletHttp({admin,auth,withdrawals,reconciliation,resolveOwner,resolveUser,custodyTimeline,env=process.env}){
 if(env.NODE_ENV==='production'||process.env.NODE_ENV==='production'||admin.ledger.provider.mode!=='mock')throw new Error('Mock finance APIs cannot run in production.');
 const ledger=admin.ledger,requests=new Map();
 function rate(req){const key=req.socket.remoteAddress||'unknown',now=Date.now();if(requests.size>10000)for(const [key,r] of requests)if(r.until<now)requests.delete(key);const r=requests.get(key)||{count:0,until:now+60000};if(r.until<now){r.count=0;r.until=now+60000;}r.count++;requests.set(key,r);if(r.count>180)fail('Too many wallet requests. Retry shortly.',429);}
 const appOrigins=new Set(String(env.ALLOWED_ORIGINS||'https://appassets.trackship.ng').split(',').map(v=>v.trim()).filter(Boolean));
 function origin(req,allowApp=false){const supplied=req.headers.origin,configured=env.TRACKSHIP_PUBLIC_URL||env.RENDER_EXTERNAL_URL;
  const local=/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(req.headers.host||'')?'http://'+req.headers.host:null;
  if(!supplied||supplied!==(configured?new URL(configured).origin:local)&&!(allowApp&&appOrigins.has(supplied)))fail('Open finance forms from this site.',403);
 }
 async function actor(req){const staff=await auth.session(req);if(staff)return staff;try{const owner=await resolveOwner(req);return {id:'owner:'+owner.actor,username:owner.actor,role:'Admin',csrf:owner.csrf,owner:true};}catch(e){if(e.status===403)fail('Refresh the finance session before making changes.',403);if(e.status!==401)throw e;fail('Log in to finance or the owner dashboard.',401);}}
 const cookie=(token,req)=>`sendrack_finance=${token}; HttpOnly; SameSite=Strict; Path=/api/wallet/admin; Max-Age=${token?14400:0}${req.headers.origin?.startsWith('https:')?'; Secure':''}`;
 return {matches:req=>req.url?.startsWith(PREFIX+'/')&&!req.url.startsWith(PREFIX+'/webhooks/'),async handle(req,res){
  res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');
  const send=(value,status=200)=>{res.writeHead(status);res.end(JSON.stringify(value));};
  try{
   rate(req);const url=new URL(req.url,'http://localhost'),path=url.pathname.slice(PREFIX.length),mutation=!['GET','HEAD'].includes(req.method);
   const appOrigin=!path.startsWith('/admin/')&&appOrigins.has(req.headers.origin);
   if(appOrigin){res.setHeader('Access-Control-Allow-Origin',req.headers.origin);res.setHeader('Vary','Origin');res.setHeader('Access-Control-Allow-Headers','Content-Type, Authorization');res.setHeader('Access-Control-Allow-Methods','GET, POST, OPTIONS');}
   if(req.method==='OPTIONS'){if(!appOrigin)fail('Origin is not permitted.',403);res.writeHead(204);res.end();return;}
   if(!['GET','POST'].includes(req.method))fail('Use GET or POST.',405);
   if(mutation){origin(req,!path.startsWith('/admin/'));if(!/^application\/json(?:;\s*charset=utf-8)?$/i.test(req.headers['content-type']||''))fail('Use application/json.',415);}
   if(path==='/admin/login'&&req.method==='POST'){
    const p=await json(req),login=await auth.login({...p,ip:req.socket.remoteAddress||'unknown'});res.setHeader('Set-Cookie',cookie(login.token,req));return send(login.actor);
   }
   if(path.startsWith('/admin/')){
    const a=await actor(req);if(mutation)auth.verifyCsrf(req,a);
    if(path==='/admin/session')return send(a);
    if(path==='/admin/logout'&&mutation){await auth.logout(req);res.setHeader('Set-Cookie',cookie('',req));return send({loggedOut:true});}
    if(path==='/admin/overview'&&!mutation)return send({...await admin.overview(a),...(reconciliation?{monitoring:await reconciliation.monitor(a)}:{})});
    if(path==='/admin/settings')return send(mutation?await admin.updateSettings(a,await json(req)):await admin.settings(a));
    if(path==='/admin/staff'){
     requireRole(a,['Admin']);return send(mutation?await auth.createStaff(a,await json(req)):(await admin.pool.query(`SELECT id,username,role,enabled FROM ${admin.schema}.finance_staff ORDER BY username LIMIT 200`)).rows);
    }
    if(path==='/admin/staff-access'&&mutation)return send(await auth.setStaff(a,await json(req)));
    if(path==='/admin/action'&&mutation)return send(await admin.propose(a,await json(req)));
    if(path==='/admin/check'&&mutation)return send(await admin.check(a,await json(req)));
    if(path==='/admin/dispute'&&mutation)return send(await admin.dispute(a,await json(req)));
    const evidence=path.match(/^\/admin\/evidence\/([a-f0-9-]{36})$/);
    if(evidence&&!mutation){requireRole(a);const d=(await admin.pool.query(`SELECT h.shipment_id FROM ${admin.schema}.holds h WHERE h.id=$1`,[evidence[1]])).rows[0];if(!d)fail('Hold not found.',404);return send({shipmentId:d.shipment_id,timeline:await custodyTimeline(d.shipment_id)});}
    const wallet=path.match(/^\/admin\/wallets\/([a-f0-9-]{36})$/);if(wallet&&!mutation)return send(await admin.walletDetail(a,wallet[1]));
    if(path==='/admin/reconciliation'&&!mutation){requireRole(a);if(!reconciliation)fail('Reconciliation is not configured.',503);return send(await reconciliation.list(a));}
    if(path==='/admin/reconcile'&&mutation){requireRole(a,['Admin','Finance']);if(!reconciliation)fail('Reconciliation is not configured.',503);const p=await json(req);return send(await reconciliation.run({actor:a,idempotencyKey:p.idempotencyKey}));}
    if(path==='/admin/resolve-mismatch'&&mutation){if(!reconciliation)fail('Reconciliation is not configured.',503);return send(await reconciliation.resolve(a,await json(req)));}
    const view=path.match(/^\/admin\/(wallets|holds|transactions|payouts|decisions|disputes|audit|transfers)(\.csv)?$/);
    if(view&&!mutation){
     const options={offset:Number(url.searchParams.get('offset')||0),status:url.searchParams.get('status')||'',query:url.searchParams.get('q')||''};
     const rows=await admin.list(a,view[1],options);
     if(view[2]){const columns=rows.length?Object.keys(rows[0]):['id'];res.setHeader('Content-Type','text/csv; charset=utf-8');res.setHeader('Content-Disposition',`attachment; filename="sendrack-${view[1]}-page.csv"`);res.end([columns.map(csvCell).join(','),...rows.map(row=>columns.map(key=>csvCell(typeof row[key]==='object'?JSON.stringify(row[key]):row[key])).join(','))].join('\r\n'));return;}
     return send({rows,limit:50,offset:options.offset});
    }
    fail('Finance route not found.',404);
   }
   const principal=await resolveUser(req);if(!principal)fail('Sign in to your vendor or rider account.',401);
   let wallet=(await admin.pool.query(`SELECT id FROM ${admin.schema}.wallets WHERE owner_role=$1 AND owner_id=$2`,[principal.role,principal.ownerId])).rows[0];
   if(path==='/create'&&mutation)return send(await ledger.createWallet(principal));
   if(!wallet)fail('Your approved bank wallet is not connected yet.',404);
   wallet=await ledger.read(wallet.id);
   if(path==='/me'&&!mutation){
    const activity=(await admin.pool.query(`SELECT e.debit_kobo,e.credit_kobo,e.created_at,t.kind FROM ${admin.schema}.ledger_entries e JOIN ${admin.schema}.transactions t ON t.id=e.transaction_id WHERE e.account_id=$1 ORDER BY e.created_at DESC LIMIT 30`,[wallet.accountId])).rows.map(row=>({title:row.kind==='wallet_funding'?'Money added':row.kind==='withdrawal'?'Withdrawal':Number(row.credit_kobo)>0?'Delivery earning':'Delivery payment',amountKobo:Number(row.credit_kobo)-Number(row.debit_kobo),at:row.created_at,status:'Completed'}));
    const payouts=(await admin.pool.query(`SELECT amount_kobo,state,created_at FROM ${admin.schema}.payouts WHERE wallet_id=$1 AND state<>'paid' ORDER BY created_at DESC LIMIT 20`,[wallet.id])).rows.map(row=>({title:'Withdrawal',amountKobo:-Number(row.amount_kobo),at:row.created_at,status:row.state==='failed'?'Unsuccessful':row.state==='rejected'?'Not completed':'Processing'}));
    return send({name:principal.displayName||'Your account',balanceKobo:wallet.spendableKobo,testMode:ledger.provider.mode==='mock',activity:[...activity,...payouts].sort((a,b)=>Date.parse(b.at)-Date.parse(a.at)).slice(0,30)});
   }
   if(path==='/refresh'&&mutation){await ledger.refreshBankBalance(wallet.id);return send({updated:true});}
   if(!withdrawals)fail('Wallet security is not configured.',503);
   const p=mutation?await json(req):{};
   if(path==='/withdrawal/quote'&&mutation)return send(await withdrawals.prepare({...p,walletId:wallet.id}));
   if(path==='/security/code'&&mutation)return send(await withdrawals.requestOtp({...p,walletId:wallet.id}));
   if(path==='/security/pin'&&mutation)return send(await withdrawals.setPin({...p,walletId:wallet.id}));
   if(path==='/withdrawal/confirm'&&mutation)return send(await withdrawals.confirm({...p,walletId:wallet.id}));
   fail('Wallet route not found.',404);
  }catch(error){const status=error instanceof WalletError?error.status:503;res.setHeader('Connection','close');if(status===429||status===503)res.setHeader('Retry-After','60');if(!res.headersSent)send({error:error instanceof WalletError?error.message:'Wallet service unavailable. Retry with the same reference.'},status);else res.end();}
 }};
}

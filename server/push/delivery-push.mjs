import {sharedRequestLimits} from '../request-controls.mjs';
import {PUSH_ACCOUNTS_SQL} from './principals.mjs';
import {createHash,timingSafeEqual} from 'node:crypto';
import {createFcmSender} from './fcm.mjs';
const hash=value=>createHash('sha256').update(value).digest('hex');
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
function fail(message,status=400){throw Object.assign(new Error(message),{status});}
const matches=(a,b)=>typeof a==='string'&&typeof b==='string'&&a.length===b.length&&timingSafeEqual(Buffer.from(a),Buffer.from(b));
export async function deliveryPush(db,{env=process.env,body,rider,vendor,sender=createFcmSender({env}),now=Date.now,canDeliver=async()=>true,onRegistered=async()=>{},logger=entry=>console.error(JSON.stringify(entry))}={}){
 await db.exec(`CREATE TABLE IF NOT EXISTS push_installations(installation_id TEXT PRIMARY KEY,secret_hash TEXT NOT NULL,rider_id TEXT NOT NULL,session_hash TEXT NOT NULL,fcm_token TEXT NOT NULL,token_hash TEXT NOT NULL UNIQUE,enabled INTEGER NOT NULL DEFAULT 1,updated INTEGER NOT NULL);
 CREATE INDEX IF NOT EXISTS push_installations_rider ON push_installations(rider_id);
 CREATE TABLE IF NOT EXISTS push_deliveries(notification_id TEXT NOT NULL,installation_id TEXT NOT NULL,state TEXT NOT NULL DEFAULT 'pending',attempts INTEGER NOT NULL DEFAULT 0,next_attempt INTEGER NOT NULL DEFAULT 0,lease_until INTEGER NOT NULL DEFAULT 0,provider_reference TEXT,last_error TEXT,PRIMARY KEY(notification_id,installation_id));`);
 for(const table of ['push_installations','delivery_notifications'])if(!(await db.prepare('PRAGMA table_info('+table+')').all()).some(c=>c.name==='account_role'))await db.exec("ALTER TABLE "+table+" ADD COLUMN account_role TEXT NOT NULL DEFAULT 'rider'");
 async function route(req,path,send){
  const match=path.match(/^\/api\/v4\/(rider|vendor)\/push\/(register|unregister)$/);if(!match||req.method!=='POST')return false;
  const role=match[1];if(role==='vendor'&&!vendor)fail('Vendor sign-in is required.',401);const account=await (role==='vendor'?vendor(req):rider(req)),p=await body(req,8192);
  if(!uuid.test(p.installationId||'')||!/^[a-f0-9]{64}$/.test(p.installationSecret||''))fail('Invalid notification installation.');
  const existing=await db.prepare('SELECT * FROM push_installations WHERE installation_id=?').get(p.installationId);
  if(existing&&!matches(existing.secret_hash,hash(p.installationSecret)))fail('This notification installation cannot be changed.',403);
  if(path.endsWith('/unregister')){
   if(existing&&existing.account_role===role&&existing.rider_id===account.id&&existing.session_hash===account.sessionHash)await db.prepare('DELETE FROM push_installations WHERE installation_id=? AND session_hash=?').run(p.installationId,account.sessionHash);
   send(200,{unregistered:true});return true;
  }
  if(typeof p.token!=='string'||p.token.length<30||p.token.length>4096||!/^[\x21-\x7e]+$/.test(p.token))fail('Invalid Firebase registration token.');
  const duplicate=await db.prepare('SELECT installation_id FROM push_installations WHERE token_hash=?').get(hash(p.token));if(duplicate&&duplicate.installation_id!==p.installationId)fail('This notification token is already registered.',409);
  if(!existing&&(await db.prepare('SELECT count(*) AS count FROM push_installations WHERE rider_id=? AND account_role=?').get(account.id,role)).count>=10)fail('Remove an old notification device before adding another.',409);
  if(existing&&!existing.enabled&&existing.token_hash===hash(p.token)){send(200,{registered:false,tokenRefreshRequired:true,pushReady:sender.ready});return true;}
  if(existing&&existing.session_hash!==account.sessionHash)await db.prepare('DELETE FROM push_deliveries WHERE installation_id=?').run(p.installationId);
  await db.prepare(`INSERT INTO push_installations(installation_id,secret_hash,rider_id,session_hash,fcm_token,token_hash,enabled,updated,account_role) VALUES (?,?,?,?,?,?,1,?,?) ON CONFLICT(installation_id) DO UPDATE SET rider_id=excluded.rider_id,session_hash=excluded.session_hash,fcm_token=excluded.fcm_token,token_hash=excluded.token_hash,enabled=1,updated=excluded.updated,account_role=excluded.account_role`).run(p.installationId,hash(p.installationSecret),account.id,account.sessionHash,p.token,hash(p.token),now(),role);
  if(existing&&existing.token_hash!==hash(p.token))await db.prepare("UPDATE push_deliveries SET state='pending',attempts=0,next_attempt=0,lease_until=0 WHERE installation_id=? AND state IN ('invalid','failed')").run(p.installationId);
  if(role==='rider')await onRegistered(account);
  await requeue(account.id,role);kick();
  send(200,{registered:true,pushReady:sender.ready});return true;
 }
 async function requeue(riderId,role='rider'){
  // Reconsider only unsent alerts. A successful provider send is never duplicated.
  await db.prepare("UPDATE push_deliveries SET state='pending',attempts=0,next_attempt=0,lease_until=0 WHERE state IN ('obsolete','failed') AND notification_id IN (SELECT id FROM delivery_notifications WHERE rider_id=? AND account_role=? AND seen=0 AND created>?)").run(riderId,role,now()-86400000);
 }
 const option=(key,fallback,max)=>{const n=Number(env[key]);return Number.isSafeInteger(n)&&n>0?Math.min(n,max):fallback;};
 const concurrency=option('PUSH_CONCURRENCY',4,32),batchSize=option('PUSH_BATCH_SIZE',40,500),perSecond=option('PUSH_MAX_PER_SECOND',50,1000),quota=await sharedRequestLimits(db,{}),quotaRequest={socket:{remoteAddress:'push-provider-global'},headers:{}};
 await db.exec("CREATE INDEX IF NOT EXISTS push_delivery_due ON push_deliveries(state,next_attempt,lease_until);CREATE INDEX IF NOT EXISTS notifications_unseen_created ON delivery_notifications(seen,created,id);");
 async function materialize(){return db.withRequest('GET',async()=>{const time=now();await db.prepare("UPDATE push_deliveries SET state='failed',lease_until=0,last_error='WORKER_RETRY_EXHAUSTED' WHERE state='sending' AND attempts>=5 AND lease_until<=?").run(time);await db.prepare(`INSERT INTO push_deliveries(notification_id,installation_id) SELECT n.id,i.installation_id FROM delivery_notifications n JOIN push_installations i ON i.rider_id=n.rider_id AND i.account_role=n.account_role JOIN (${PUSH_ACCOUNTS_SQL}) s ON s.token_hash=i.session_hash AND s.account_role=i.account_role AND s.account_id=i.rider_id LEFT JOIN push_deliveries delivered ON delivered.notification_id=n.id AND delivered.installation_id=i.installation_id WHERE delivered.notification_id IS NULL AND n.seen=0 AND n.created>? AND i.enabled=1 AND s.expires>? AND s.suspended=0 ORDER BY n.created LIMIT 200 ON CONFLICT(notification_id,installation_id) DO NOTHING`).run(time-86400000,time);});}
 async function claim(){return db.withRequest(db.kind==='postgres'?'GET':'POST',async()=>{
  const time=now();
  if(db.kind==='postgres'){const job=await db.prepare(`WITH candidate AS (SELECT d.notification_id,d.installation_id FROM push_deliveries d JOIN push_installations i ON i.installation_id=d.installation_id JOIN (${PUSH_ACCOUNTS_SQL}) s ON s.token_hash=i.session_hash AND s.account_role=i.account_role AND s.account_id=i.rider_id JOIN delivery_notifications n ON n.id=d.notification_id AND n.rider_id=i.rider_id AND n.account_role=i.account_role WHERE d.state IN ('pending','sending') AND d.attempts<5 AND d.next_attempt<=? AND d.lease_until<=? AND i.enabled=1 AND s.expires>? AND s.suspended=0 AND n.seen=0 AND n.created>? ORDER BY n.created LIMIT 1 FOR UPDATE OF d SKIP LOCKED), claimed AS (UPDATE push_deliveries d SET state='sending',attempts=d.attempts+1,lease_until=? FROM candidate c WHERE d.notification_id=c.notification_id AND d.installation_id=c.installation_id RETURNING d.*) SELECT c.notification_id,c.installation_id,c.attempts-1 AS attempts,i.fcm_token,i.session_hash,i.rider_id,i.account_role,n.shipment_id,n.phase FROM claimed c JOIN push_installations i ON i.installation_id=c.installation_id JOIN delivery_notifications n ON n.id=c.notification_id`).get(time,time,time,time-86400000,time+60000);return job?{...job,leaseUntil:time+60000}:null;}
  const job=await db.prepare(`SELECT d.notification_id,d.installation_id,d.attempts,i.fcm_token,i.session_hash,i.rider_id,i.account_role,n.shipment_id,n.phase FROM push_deliveries d JOIN push_installations i ON i.installation_id=d.installation_id JOIN (${PUSH_ACCOUNTS_SQL}) s ON s.token_hash=i.session_hash AND s.account_role=i.account_role AND s.account_id=i.rider_id JOIN delivery_notifications n ON n.id=d.notification_id AND n.rider_id=i.rider_id AND n.account_role=i.account_role WHERE d.state IN ('pending','sending') AND d.attempts<5 AND d.next_attempt<=? AND d.lease_until<=? AND i.enabled=1 AND s.expires>? AND s.suspended=0 AND n.seen=0 AND n.created>? ORDER BY n.created LIMIT 1`).get(time,time,time,time-86400000);if(!job)return null;
  const claimed=await db.prepare("UPDATE push_deliveries SET state='sending',attempts=attempts+1,lease_until=? WHERE notification_id=? AND installation_id=? AND lease_until<=?").run(time+60000,job.notification_id,job.installation_id,time);return claimed.changes?{...job,leaseUntil:time+60000}:null;
 });}
 let running=false,idlePromise=Promise.resolve(),idleResolve;
 async function drain(){if(!sender.ready||running)return;running=true;idlePromise=new Promise(r=>{idleResolve=r;});let count=0;try{
  await materialize();
  const outcomes=await Promise.allSettled(Array.from({length:concurrency},async()=>{while(count++<batchSize){
   if(!await quota(quotaRequest,'fcm-global',perSecond,1000))break;const job=await claim();if(!job)break;let result;
   // Check the binding again immediately before the external request. A late FCM
   // message is also checked against the current binding on the Android device.
   const live=await db.withRequest('GET',()=>db.prepare(`SELECT s.token_hash FROM (${PUSH_ACCOUNTS_SQL}) s JOIN push_installations i ON i.session_hash=s.token_hash AND i.account_role=s.account_role AND i.rider_id=s.account_id WHERE s.token_hash=? AND s.expires>? AND s.suspended=0 AND i.enabled=1 AND i.installation_id=? AND i.token_hash=?`).get(job.session_hash,now(),job.installation_id,hash(job.fcm_token)));
   if(!live)continue;
   const relevant=await db.withRequest('GET',()=>canDeliver(job));
   if(!relevant){await db.withRequest('GET',()=>db.prepare("UPDATE push_deliveries SET state='obsolete',lease_until=0,last_error='OFFER_NO_LONGER_ELIGIBLE' WHERE notification_id=? AND installation_id=?").run(job.notification_id,job.installation_id));continue;}
   try{result=await sender.send({token:job.fcm_token,eventId:job.notification_id,binding:job.session_hash,accountRole:job.account_role});}catch(error){result={status:'retry',code:/^[A-Z0-9_]{1,80}$/.test(error.code||'')?error.code:'PROVIDER_UNAVAILABLE'};}
   if(result.status!=='sent')logger({event:'delivery_push_send_failed',notificationId:job.notification_id,attempt:job.attempts+1,code:/^[A-Z0-9_]{1,80}$/.test(result.code||'')?result.code:'PROVIDER_UNAVAILABLE'});
   await db.withRequest('GET',async()=>{
    if(result.status==='invalid-token')await db.prepare('UPDATE push_installations SET enabled=0 WHERE installation_id=? AND session_hash=? AND token_hash=?').run(job.installation_id,job.session_hash,hash(job.fcm_token));
    const state=result.status==='sent'?'sent':result.status==='invalid-token'?'invalid':job.attempts+1>=5?'failed':'pending';
    await db.prepare("UPDATE push_deliveries SET state=?,lease_until=0,next_attempt=?,provider_reference=?,last_error=? WHERE notification_id=? AND installation_id=? AND state='sending' AND lease_until=? AND attempts=? AND EXISTS (SELECT 1 FROM push_installations i WHERE i.installation_id=push_deliveries.installation_id AND i.session_hash=? AND i.token_hash=?)").run(state,now()+Math.min(3600000,60000*2**job.attempts)+Math.floor(Math.random()*1000),result.reference||null,result.status==='sent'?null:(result.code||'PROVIDER_UNAVAILABLE'),job.notification_id,job.installation_id,job.leaseUntil,job.attempts+1,job.session_hash,hash(job.fcm_token));
   });
 } }));if(outcomes.some(r=>r.status==='rejected'))throw new Error('Push batch could not complete.');
 }finally{running=false;idleResolve?.();}}
 let timer=null,wake=null;const embedded=env.PUSH_WORKER_MODE!=='api';
 function kick(){if(!embedded||!sender.ready||wake)return;db.outsideRequest(()=>{wake=setImmediate(()=>{wake=null;void drain().catch(()=>logger({event:'delivery_push_worker_failed',code:'PUSH_WORKER_ERROR'}));});wake.unref();});}
 return {route,drain,kick,requeue,ready:sender.ready,projectId:sender.projectId||null,start(){if(embedded&&sender.ready&&!timer){timer=setInterval(()=>{void drain().catch(()=>logger({event:'delivery_push_worker_failed',code:'PUSH_WORKER_ERROR'}));},1000);timer.unref();void drain().catch(()=>logger({event:'delivery_push_worker_failed',code:'PUSH_WORKER_ERROR'}));}},stop(){if(timer)clearInterval(timer);if(wake)clearImmediate(wake);timer=null;wake=null;return idlePromise;}};
}

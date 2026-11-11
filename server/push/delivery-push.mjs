import {createHash,timingSafeEqual} from 'node:crypto';
import {createFcmSender} from './fcm.mjs';
const hash=value=>createHash('sha256').update(value).digest('hex');
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
function fail(message,status=400){throw Object.assign(new Error(message),{status});}
const matches=(a,b)=>typeof a==='string'&&typeof b==='string'&&a.length===b.length&&timingSafeEqual(Buffer.from(a),Buffer.from(b));
export async function deliveryPush(db,{env=process.env,body,rider,sender=createFcmSender({env}),now=Date.now}={}){
 await db.exec(`CREATE TABLE IF NOT EXISTS push_installations(installation_id TEXT PRIMARY KEY,secret_hash TEXT NOT NULL,rider_id TEXT NOT NULL,session_hash TEXT NOT NULL,fcm_token TEXT NOT NULL,token_hash TEXT NOT NULL UNIQUE,enabled INTEGER NOT NULL DEFAULT 1,updated INTEGER NOT NULL);
 CREATE INDEX IF NOT EXISTS push_installations_rider ON push_installations(rider_id);
 CREATE TABLE IF NOT EXISTS push_deliveries(notification_id TEXT NOT NULL,installation_id TEXT NOT NULL,state TEXT NOT NULL DEFAULT 'pending',attempts INTEGER NOT NULL DEFAULT 0,next_attempt INTEGER NOT NULL DEFAULT 0,lease_until INTEGER NOT NULL DEFAULT 0,provider_reference TEXT,last_error TEXT,PRIMARY KEY(notification_id,installation_id));`);
 async function route(req,path,send){
  if(!['/api/v4/rider/push/register','/api/v4/rider/push/unregister'].includes(path)||req.method!=='POST')return false;
  const account=await rider(req),p=await body(req,8192);
  if(!uuid.test(p.installationId||'')||!/^[a-f0-9]{64}$/.test(p.installationSecret||''))fail('Invalid notification installation.');
  const existing=await db.prepare('SELECT * FROM push_installations WHERE installation_id=?').get(p.installationId);
  if(existing&&!matches(existing.secret_hash,hash(p.installationSecret)))fail('This notification installation cannot be changed.',403);
  if(path.endsWith('/unregister')){
   if(existing&&existing.session_hash===account.sessionHash)await db.prepare('DELETE FROM push_installations WHERE installation_id=? AND session_hash=?').run(p.installationId,account.sessionHash);
   send(200,{unregistered:true});return true;
  }
  if(typeof p.token!=='string'||p.token.length<30||p.token.length>4096||!/^[\x21-\x7e]+$/.test(p.token))fail('Invalid Firebase registration token.');
  const duplicate=await db.prepare('SELECT installation_id FROM push_installations WHERE token_hash=?').get(hash(p.token));if(duplicate&&duplicate.installation_id!==p.installationId)fail('This notification token is already registered.',409);
  if(!existing&&(await db.prepare('SELECT count(*) AS count FROM push_installations WHERE rider_id=?').get(account.id)).count>=10)fail('Remove an old notification device before adding another.',409);
  if(existing&&existing.session_hash!==account.sessionHash)await db.prepare('DELETE FROM push_deliveries WHERE installation_id=?').run(p.installationId);
  await db.prepare(`INSERT INTO push_installations(installation_id,secret_hash,rider_id,session_hash,fcm_token,token_hash,enabled,updated) VALUES (?,?,?,?,?,?,1,?) ON CONFLICT(installation_id) DO UPDATE SET rider_id=excluded.rider_id,session_hash=excluded.session_hash,fcm_token=excluded.fcm_token,token_hash=excluded.token_hash,enabled=1,updated=excluded.updated`).run(p.installationId,hash(p.installationSecret),account.id,account.sessionHash,p.token,hash(p.token),now());
  if(existing&&existing.token_hash!==hash(p.token))await db.prepare("UPDATE push_deliveries SET state='pending',attempts=0,next_attempt=0,lease_until=0 WHERE installation_id=? AND state IN ('invalid','failed')").run(p.installationId);
  send(200,{registered:true,pushReady:sender.ready});return true;
 }
 async function claim(){return db.withRequest('POST',async()=>{
  const time=now();
  // The inbox is the durable source. Scanning also repairs an interrupted enqueue.
  const events=await db.prepare(`SELECT n.id AS event_id,i.installation_id FROM delivery_notifications n JOIN push_installations i ON i.rider_id=n.rider_id JOIN rider_sessions s ON s.token_hash=i.session_hash JOIN rider_profiles r ON r.id=i.rider_id LEFT JOIN push_deliveries delivered ON delivered.notification_id=n.id AND delivered.installation_id=i.installation_id WHERE delivered.notification_id IS NULL AND n.seen=0 AND n.created>? AND i.enabled=1 AND s.expires>? AND COALESCE(r.suspended,0)=0 ORDER BY n.created LIMIT 200`).all(time-86400000,time);
  for(const event of events)await db.prepare('INSERT OR IGNORE INTO push_deliveries(notification_id,installation_id) VALUES (?,?)').run(event.event_id,event.installation_id);
  const job=await db.prepare(`SELECT d.notification_id,d.installation_id,d.attempts,i.fcm_token,i.session_hash FROM push_deliveries d JOIN push_installations i ON i.installation_id=d.installation_id JOIN rider_sessions s ON s.token_hash=i.session_hash JOIN rider_profiles r ON r.id=i.rider_id JOIN delivery_notifications n ON n.id=d.notification_id AND n.rider_id=i.rider_id WHERE d.state IN ('pending','sending') AND d.attempts<5 AND d.next_attempt<=? AND d.lease_until<=? AND i.enabled=1 AND s.expires>? AND COALESCE(r.suspended,0)=0 AND n.seen=0 AND n.created>? ORDER BY n.created LIMIT 1`).get(time,time,time,time-86400000);
  if(!job)return null;
  const claimed=await db.prepare("UPDATE push_deliveries SET state='sending',attempts=attempts+1,lease_until=? WHERE notification_id=? AND installation_id=? AND lease_until<=?").run(time+60000,job.notification_id,job.installation_id,time);
  return claimed.changes?job:null;
 });}
 let running=false;
 async function drain(){if(!sender.ready||running)return;running=true;try{
  for(let count=0;count<10;count++){
   const job=await claim();if(!job)break;let result;
   // Check the binding again immediately before the external request. A late FCM
   // message is also checked against the current binding on the Android device.
   const live=await db.withRequest('GET',()=>db.prepare('SELECT s.token_hash FROM rider_sessions s JOIN rider_profiles r ON r.id=s.rider_id JOIN push_installations i ON i.session_hash=s.token_hash WHERE s.token_hash=? AND s.expires>? AND COALESCE(r.suspended,0)=0 AND i.enabled=1 AND i.installation_id=? AND i.token_hash=?').get(job.session_hash,now(),job.installation_id,hash(job.fcm_token)));
   if(!live)continue;
   try{result=await sender.send({token:job.fcm_token,eventId:job.notification_id,binding:job.session_hash});}catch{result={status:'retry',code:'PROVIDER_UNAVAILABLE'};}
   await db.withRequest('POST',async()=>{
    if(result.status==='invalid-token')await db.prepare('UPDATE push_installations SET enabled=0 WHERE installation_id=? AND session_hash=? AND token_hash=?').run(job.installation_id,job.session_hash,hash(job.fcm_token));
    const state=result.status==='sent'?'sent':result.status==='invalid-token'?'invalid':job.attempts+1>=5?'failed':'pending';
    await db.prepare('UPDATE push_deliveries SET state=?,lease_until=0,next_attempt=?,provider_reference=?,last_error=? WHERE notification_id=? AND installation_id=?').run(state,now()+Math.min(3600000,60000*2**job.attempts),result.reference||null,result.status==='sent'?null:(result.code||'PROVIDER_UNAVAILABLE'),job.notification_id,job.installation_id);
   });
  }
 }finally{running=false;}}
 let timer=null;
 return {route,drain,ready:sender.ready,start(){if(sender.ready&&!timer){timer=setInterval(()=>{void drain().catch(()=>{});},15000);timer.unref();void drain().catch(()=>{});}},stop(){if(timer)clearInterval(timer);timer=null;}};
}

import {configuredRoute} from './rider-route-fixture.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,createHash,randomUUID,randomBytes,verify} from 'node:crypto';
import {createFcmSender} from '../server/push/fcm.mjs';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {deliveryPush} from '../server/push/delivery-push.mjs';
import {adminFixture,riderProfile,vendorProfile} from './admin-fixture.mjs';
const digest=s=>createHash('sha256').update(s).digest('hex');
const installation=()=>({installationId:randomUUID(),installationSecret:randomBytes(32).toString('hex'),token:'example_firebase_token_'+randomBytes(30).toString('hex')});
async function event(db,riderId,id=randomUUID()){await db.prepare('INSERT INTO delivery_notifications(id,rider_id,shipment_id,phase,title,body,created) VALUES (?,?,?,?,?,?,?)').run(id,riderId,randomUUID(),'created','PRIVATE CUSTOMER TITLE','PRIVATE ADDRESS AND PHONE',Date.now());return id;}

test('FCM uses cached OAuth v1 credentials and sends only an opaque inbox reference and session binding',async()=>{
 const {privateKey,publicKey}=generateKeyPairSync('rsa',{modulusLength:2048}),account={type:'service_account',project_id:'sendrack-test-project',client_email:'sender@sendrack-test-project.iam.gserviceaccount.com',private_key:privateKey.export({format:'pem',type:'pkcs8'})};
 const secretDirectory=mkdtempSync(path.join(tmpdir(),'sendrack-fcm-'));try{const secretPath=path.join(secretDirectory,'service-account.json');writeFileSync(secretPath,JSON.stringify(account),{mode:0o600});assert.equal(createFcmSender({env:{FCM_ENABLED:'true',FCM_SERVICE_ACCOUNT_FILE:secretPath}}).ready,true);assert.throws(()=>createFcmSender({env:{FCM_ENABLED:'true',FCM_SERVICE_ACCOUNT_FILE:path.join(secretDirectory,'missing.json')}}),/not readable/);}finally{rmSync(secretDirectory,{recursive:true,force:true});}
 let tokens=0,sends=0;const sender=createFcmSender({env:{FCM_ENABLED:'true',FCM_SERVICE_ACCOUNT_JSON:JSON.stringify(account)},fetchImpl:async(url,options)=>{
  assert.equal(options.redirect,'error');
  if(url==='https://oauth2.googleapis.com/token'){tokens++;const jwt=options.body.get('assertion'),[header,body,signature]=jwt.split('.');assert.equal(verify('RSA-SHA256',Buffer.from(header+'.'+body),publicKey,Buffer.from(signature,'base64url')),true);const claims=JSON.parse(Buffer.from(body,'base64url'));assert.equal(claims.aud,'https://oauth2.googleapis.com/token');assert.equal(claims.scope,'https://www.googleapis.com/auth/firebase.messaging');return Response.json({access_token:'mock-oauth-token',expires_in:3600});}
  assert.equal(url,'https://fcm.googleapis.com/v1/projects/sendrack-test-project/messages:send');assert.equal(options.headers.Authorization,'Bearer mock-oauth-token');const payload=JSON.parse(options.body);assert.deepEqual(Object.keys(payload.message.data).sort(),['binding','eventId']);assert.equal(payload.message.notification,undefined);assert.equal(payload.message.android.restricted_package_name,'ng.sendrack.test');sends++;return Response.json({name:'projects/sendrack-test-project/messages/'+sends});
 }});
 const payload={token:'device-token',eventId:randomUUID(),binding:digest('account-session')};assert.equal((await sender.send(payload)).status,'sent');assert.equal((await sender.send(payload)).status,'sent');assert.equal(tokens,1);assert.equal(sends,2);assert.equal(createFcmSender({env:{}}).ready,false);assert.throws(()=>createFcmSender({env:{FCM_ENABLED:'true'}}),/private service-account/);
});

test('push registration requires rider authentication and an installation secret; logout revokes only that session',async()=>{
 const f=await adminFixture();try{
  const device=installation();assert.equal((await f.api('/api/v4/rider/push/register',device)).status,401);
  const vendor=await f.account('vendor',vendorProfile);assert.equal((await f.api('/api/v4/rider/push/register',device,{token:vendor.token})).status,401);
  const rider=await f.account('rider',riderProfile),other=await f.account('rider',{...riderProfile,phone:'08098765433'});
  const response=await f.api('/api/v4/rider/push/register',device,{token:rider.token});assert.equal(response.status,200);assert.deepEqual(await response.json(),{registered:true,pushReady:false});
  assert.equal((await f.api('/api/v4/rider/push/register',{...device,installationSecret:'f'.repeat(64)},{token:other.token})).status,403);
  assert.equal((await f.api('/api/v4/rider/push/register',{...installation(),token:device.token},{token:other.token})).status,409);
  const second=installation();assert.equal((await f.api('/api/v4/rider/push/register',second,{token:other.token})).status,200);
  assert.equal((await f.api('/api/auth/logout',{}, {token:rider.token})).status,200);
  const rows=await f.server.database.prepare('SELECT installation_id FROM push_installations').all();assert.deepEqual(rows.map(r=>r.installation_id),[second.installationId]);
 }finally{await f.close();}
});

test('durable push retries survive a worker restart, do not duplicate successful sends, and stop after logout',async()=>{
 const f=await adminFixture();try{
  const rider=await f.account('rider',riderProfile),device=installation();await f.api('/api/v4/rider/push/register',device,{token:rider.token});const id=await event(f.server.database,rider.profile.id);let time=Date.now(),attempts=0;
  const sender={ready:true,async send(payload){attempts++;assert.equal(payload.eventId,id);assert.equal(payload.binding,digest(rider.token));assert.equal(Object.keys(payload).includes('body'),false);return attempts===1?{status:'retry',code:'FCM_HTTP_503'}:{status:'sent',reference:'projects/test/messages/sent'};}};
  const first=await deliveryPush(f.server.database,{env:{},sender,now:()=>time});await Promise.all([first.drain(),first.drain()]);assert.equal(attempts,1);
  const restarted=await deliveryPush(f.server.database,{env:{},sender,now:()=>time});await restarted.drain();assert.equal(attempts,1);time+=61000;await restarted.drain();await restarted.drain();assert.equal(attempts,2);assert.equal((await f.server.database.prepare('SELECT state FROM push_deliveries WHERE notification_id=?').get(id)).state,'sent');
  await event(f.server.database,rider.profile.id);await f.api('/api/auth/logout',{}, {token:rider.token});await restarted.drain();assert.equal(attempts,2);
 }finally{await f.close();}
});

test('an unregistered token is disabled, and a refreshed token can retry its unsent alert',async()=>{
 const f=await adminFixture();try{
  const rider=await f.account('rider',riderProfile),device=installation();await f.api('/api/v4/rider/push/register',device,{token:rider.token});await event(f.server.database,rider.profile.id);let attempts=0;
  const push=await deliveryPush(f.server.database,{env:{},sender:{ready:true,async send(){attempts++;return attempts===1?{status:'invalid-token',code:'UNREGISTERED'}:{status:'sent',reference:'sent-after-refresh'};}}});
  await push.drain();assert.equal((await f.server.database.prepare('SELECT enabled FROM push_installations WHERE installation_id=?').get(device.installationId)).enabled,0);
  await f.api('/api/v4/rider/push/register',{...device,token:device.token+'-refreshed'},{token:rider.token});await push.drain();assert.equal(attempts,2);assert.equal((await f.server.database.prepare('SELECT state FROM push_deliveries').get()).state,'sent');
 }finally{await f.close();}
});

test('eligible riders each receive a shipment alert; wrong-area riders do not; first acceptance claims it once',async()=>{
 const {newTransport}=await import('../web/lifecycle.mjs');const f=await adminFixture();let push;
 try{
  const vendor=await f.account('vendor',vendorProfile),a=await f.account('rider',riderProfile),b=await f.account('rider',{...riderProfile,phone:'08098765433',fullName:'Second Rider'}),other=await f.account('rider',{...riderProfile,phone:'08098765434',city:'Abuja',state:'FCT Abuja'});
  for(const r of [a,b,other])await f.identity('rider',r);
  const devices=[installation(),installation(),installation()];for(const [i,r] of [a,b,other].entries())await f.api('/api/v4/rider/push/register',devices[i],{token:r.token});
  const routeId=await configuredRoute(f,{origin:'Zaria',originState:'Kaduna',destination:'Kaduna',destinationState:'Kaduna',deliveryType:'intrastate',deliveryFee:'1000'},[a,b,other]);
  const local=newTransport({routeId,sender:vendorProfile.businessName,recipient:'Sample Customer',phone:'08011112222',description:'Two-rider offer',origin:'Zaria',originState:'Kaduna',destination:'Kaduna',destinationState:'Kaduna',address:'Sample address',deliveryType:'intrastate',deliveryFee:'1000'},vendorProfile.businessName);
  const created=await f.api('/api/v3/shipments',local,{token:vendor.token});assert.equal(created.status,201);const s=await created.json();
  const notifications=await f.server.database.prepare('SELECT * FROM delivery_notifications WHERE shipment_id=?').all(s.id);assert.deepEqual(new Set(notifications.map(n=>n.rider_id)),new Set([a.profile.id,b.profile.id]));
  const sent=[];push=await deliveryPush(f.server.database,{sender:{ready:true,async send(payload){sent.push(payload);return {status:'sent',reference:'test-sent-'+sent.length};}}});
  // A notification wake must not inherit the soon-to-be-released request database scope.
  await f.server.database.withRequest('POST',async()=>{push.kick();});
  for(let i=0;i<100&&sent.length<2;i++)await new Promise(r=>setTimeout(r,10));assert.equal(sent.length,2);assert.deepEqual(new Set(sent.map(p=>p.token)),new Set(devices.slice(0,2).map(d=>d.token)));
  await f.api(`/api/v3/shipments/${s.id}/pay`,{email:'sample@example.test'},{token:vendor.token});await f.api(`/api/v3/shipments/${s.id}/verify-payment`,{},{token:vendor.token});
  const responses=await Promise.all([a,b].map(r=>f.api(`/api/v4/rider/offers/${s.id}/accept`,{},{token:r.token})));assert.deepEqual(responses.map(r=>r.status).sort(),[200,409]);
  const rejected=responses[0].status===409?a:b;const offers=await(await f.api('/api/v4/rider/offers',undefined,{token:rejected.token})).json();assert.equal(offers.offers.some(o=>o.id===s.id),false);
 }finally{push?.stop();await f.close();}
});

test('push delivery rechecks route eligibility immediately before sending and suppresses obsolete offers',async()=>{
 const f=await adminFixture();try{const rider=await f.account('rider',riderProfile),device=installation();await f.api('/api/v4/rider/push/register',device,{token:rider.token});const id=await event(f.server.database,rider.profile.id);let sends=0;
 const push=await deliveryPush(f.server.database,{sender:{ready:true,async send(){sends++;return {status:'sent'};}},canDeliver:async job=>{assert.equal(job.rider_id,rider.profile.id);assert.ok(job.shipment_id);return false;}});await push.drain();assert.equal(sends,0);assert.equal((await f.server.database.prepare('SELECT state FROM push_deliveries WHERE notification_id=?').get(id)).state,'obsolete');await push.drain();assert.equal(sends,0);
 }finally{await f.close();}
});

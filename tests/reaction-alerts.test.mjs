import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,randomUUID,randomBytes} from 'node:crypto';
import {adminFixture,vendorProfile,riderProfile} from './admin-fixture.mjs';
import {newTransport} from '../web/lifecycle.mjs';
import {deliveryPush} from '../server/push/delivery-push.mjs';
import {reactionStillRelevant} from '../server/push/reaction-notifications.mjs';
const hash=s=>createHash('sha256').update(s).digest('hex');
test('reaction changes create one durable cross-account alert with exact shipment target and opaque FCM reference',async()=>{
 const f=await adminFixture();let worker;try{
 const vendor=await f.account('vendor',vendorProfile),rider=await f.account('rider',riderProfile),other=await f.account('rider',{...riderProfile,phone:'08077778888'});
 const s=newTransport({sender:'Ada Store',recipient:'Customer',phone:'08011112222',description:'Parcel',origin:'Zaria',originState:'Kaduna',destination:'Zaria',destinationState:'Kaduna',address:'Destination',deliveryType:'intrastate',deliveryFee:'1000'},'Ada Store');s.status='Out for delivery';s.custodian='pickup';s.actors={pickup:{id:rider.profile.id,name:'Chika'}};
 const owner=(await f.server.database.prepare('SELECT owner_key FROM vendor_accounts WHERE id=?').get(vendor.profile.id)).owner_key;
 await f.server.database.prepare('INSERT INTO shipments(id,owner,public_hash,payload) VALUES(?,?,?,?)').run(s.id,owner,hash(s.publicToken),JSON.stringify(s));await f.server.database.prepare('INSERT INTO job_tokens(token_hash,shipment_id,leg) VALUES(?,?,?)').run(hash(s.jobTokens.pickup),s.id,'pickup');
 const devices=[];for(const [role,a]of [['vendor',vendor],['rider',rider],['rider',other]]){const device={installationId:randomUUID(),installationSecret:randomBytes(32).toString('hex'),token:'fcm_test_'+randomBytes(30).toString('hex')};devices.push(device);assert.equal((await f.api('/api/v4/'+role+'/push/register',device,{token:a.token})).status,200);}
 const vp='/api/v3/shipments/'+s.id+'/reactions',rp='/api/v3/jobs/'+s.jobTokens.pickup+'/reactions';
 assert.equal((await f.api(vp,{reaction:'happy'},{token:vendor.token})).status,200);assert.equal((await f.api(vp,{reaction:'happy'},{token:vendor.token})).status,200);
 const notices=()=>f.server.database.prepare("SELECT * FROM delivery_notifications WHERE phase LIKE 'reaction:%'").all();assert.equal((await notices()).length,1);
 assert.equal((await f.api(rp,{reaction:'love'},{token:rider.token})).status,200);const rows=await notices();assert.equal(rows.length,2);const toRider=rows.find(n=>n.account_role==='rider'),toVendor=rows.find(n=>n.account_role==='vendor');assert.equal(toRider.rider_id,rider.profile.id);assert.match(toRider.title,/😊 Ada Store/);assert.equal(toVendor.rider_id,vendor.profile.id);assert.match(toVendor.title,/❤️ Chika/);
 for(const [role,account,n]of [['rider',rider,toRider],['vendor',vendor,toVendor]]){const res=await f.api('/api/v4/'+role+'/notifications/'+n.id,undefined,{token:account.token});assert.equal(res.status,200);const item=(await res.json()).notification;assert.equal(item.shipmentId,s.id);assert.equal(item.type,'reaction');assert.equal('phase'in item,false);}
 assert.equal((await f.api('/api/v4/rider/notifications/'+toRider.id,undefined,{token:other.token})).status,404);assert.equal((await f.api('/api/v4/rider/notifications/'+toRider.id)).status,401);
 const sent=[];worker=await deliveryPush(f.server.database,{env:{PUSH_WORKER_MODE:'api'},sender:{ready:true,async send(p){sent.push(p);return {status:'sent',reference:randomUUID()};}},canDeliver:async j=>reactionStillRelevant(s,j.phase,j.account_role,j.rider_id)});await worker.drain();await worker.drain();assert.equal(sent.length,2);assert.deepEqual(new Set(sent.map(p=>p.token)),new Set(devices.slice(0,2).map(d=>d.token)));for(const p of sent){assert.deepEqual(Object.keys(p).sort(),['accountRole','binding','eventId','token']);assert.ok(rows.some(n=>n.id===p.eventId));}
 // A previously delivered alert remains tappable after completion.
 const activeStatus=s.status,activeCustodian=s.custodian;s.status='Delivered';s.custodian='customer';await f.server.database.prepare('UPDATE shipments SET payload=? WHERE id=?').run(JSON.stringify(s),s.id);assert.equal((await f.api('/api/v4/rider/notifications/'+toRider.id,undefined,{token:rider.token})).status,200);assert.equal(reactionStillRelevant(s,toRider.phase,'rider',rider.profile.id),false);s.status=activeStatus;s.custodian=activeCustodian;
 // An obsolete handler must not receive an alert after custody/assignment changes.
 s.actors.pickup.id=other.profile.id;await f.server.database.prepare('UPDATE shipments SET payload=? WHERE id=?').run(JSON.stringify(s),s.id);assert.equal(reactionStillRelevant(s,toRider.phase,'rider',rider.profile.id),false);assert.equal((await f.api('/api/v4/rider/notifications/'+toRider.id,undefined,{token:rider.token})).status,404);
 const inbox=await(await f.api('/api/v4/rider/notifications',undefined,{token:rider.token})).json();assert.equal(inbox.notifications.some(n=>n.id===toRider.id),false);
 }finally{await worker?.stop();await f.close();}
});

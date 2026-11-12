import {test} from 'node:test';
import assert from 'node:assert/strict';
import {adminFixture,vendorProfile,riderProfile} from './admin-fixture.mjs';
import {newTransport} from '../web/lifecycle.mjs';
import {isHistoryShipment,isEarlierUpdate,HISTORY_AGE_MS} from '../web/history.mjs';
const fields={sender:'Sample shop',recipient:'Sample recipient',phone:'08011112222',description:'Test cleanup parcel',origin:'Zaria',originState:'Kaduna',destination:'Zaria',destinationState:'Kaduna',address:'Sample destination',deliveryType:'intrastate',deliveryFee:'1000'};
async function create(f,vendor,extra={}){const local={...newTransport(fields,'Sample shop'),...extra},response=await f.api('/api/v3/shipments',local,{token:vendor.token});assert.equal(response.status,201);return response.json();}
test('test cleanup is owner/CSRF protected, atomic with live-record protection, audited and reversible to cancelled history',async()=>{
 const f=await adminFixture();try{
 const owner=await f.login(),vendor=await f.account('vendor',vendorProfile),a=await create(f,vendor,{testRemoval:{actor:'forged'}}),protectedShipment=await create(f,vendor);assert.equal(a.testRemoval,undefined);
 await f.server.database.prepare('INSERT INTO payments(reference,shipment_id,amount,mode,status,created) VALUES (?,?,?,?,?,?)').run('synthetic-live-reference',protectedShipment.id,100000,'live','initialized',Date.now());
 const preview='/api/admin/test-shipments/preview',remove='/api/admin/test-shipments/remove',input={ids:[a.id],confirmTestData:true,confirmation:'DELETE TEST SHIPMENTS',reason:'Remove my sample test data'};
 assert.equal((await f.api(preview,{ids:[a.id]})).status,401);assert.equal((await f.api(remove,input,{token:vendor.token})).status,401);assert.equal((await f.api(remove,input,{cookie:owner.cookie})).status,403);assert.equal((await f.api(remove,{...input,confirmTestData:false},owner)).status,400);
 const reviewed=await(await f.api(preview,{ids:[a.id,protectedShipment.id]},owner)).json();assert.equal(reviewed.records[0].eligible,true);assert.equal(reviewed.records[1].eligible,false);
 assert.equal((await f.api(remove,{...input,ids:[a.id,protectedShipment.id]},owner)).status,409);assert.equal((await f.api('/api/track/'+a.publicToken)).status,200);
 assert.equal((await f.api(remove,input,owner)).status,200);assert.equal((await f.api('/api/track/'+a.publicToken)).status,410);assert.equal((await f.api('/api/v3/jobs/'+a.jobTokens.pickup)).status,410);assert.equal((await f.api('/api/track/'+protectedShipment.publicToken)).status,200);
 const normal=await(await f.api('/api/admin/shipments',undefined,owner)).json();assert.equal(normal.shipments.some(s=>s.id===a.id),false);const deleted=await(await f.api('/api/admin/shipments?status=removed-tests',undefined,owner)).json();assert.equal(deleted.shipments.some(s=>s.id===a.id),true);
 const stored=JSON.parse((await f.server.database.prepare('SELECT payload FROM shipments WHERE id=?').get(a.id)).payload);assert.equal(stored.status,'Cancelled');assert.equal(stored.location,null);assert.equal(stored.testRemoval.actor,'owner');assert.equal((await f.server.database.prepare("SELECT COUNT(*) AS total FROM admin_audit WHERE action='shipment.test_removed'").get()).total,1);assert.equal((await f.server.database.prepare('SELECT COUNT(*) AS total FROM payments WHERE shipment_id=?').get(protectedShipment.id)).total,1);
 assert.equal((await f.api('/api/admin/test-shipments/restore',{ids:[a.id],reason:'Restore sample history'},owner)).status,200);const restored=JSON.parse((await f.server.database.prepare('SELECT payload FROM shipments WHERE id=?').get(a.id)).payload);assert.equal(restored.testRemoval,undefined);assert.equal(restored.status,'Cancelled');assert.equal((await f.api('/api/track/'+a.publicToken)).status,200);
 }finally{await f.close();}
});
test('wallet-linked shipments cannot be removed and unpaid test cleanup does not erase financial records',async()=>{
 const f=await adminFixture();try{const owner=await f.login(),vendor=await f.account('vendor',vendorProfile),s=await create(f,vendor);s.payment={...s.payment,mode:'wallet_mock',status:'held',holdId:'sample-hold'};await f.server.database.prepare('UPDATE shipments SET payload=? WHERE id=?').run(JSON.stringify(s),s.id);const response=await f.api('/api/admin/test-shipments/remove',{ids:[s.id],confirmTestData:true,confirmation:'DELETE TEST SHIPMENTS',reason:'Test cleanup'},owner);assert.equal(response.status,409);assert.match((await response.json()).error,/Wallet-linked/);assert.equal((await f.api('/api/track/'+s.publicToken)).status,200);}finally{await f.close();}
});
test('history contains terminal deliveries; aging alone never hides pending work',()=>{
 const now=Date.now(),old=new Date(now-3*HISTORY_AGE_MS).toISOString();for(const status of ['Created','Rider accepted','Picked up','In transit','Out for delivery','Delivery OTP sent'])assert.equal(isHistoryShipment({status,createdAt:old}),false);for(const status of ['Delivered','Cancelled'])assert.equal(isHistoryShipment({status}),true);assert.equal(isEarlierUpdate({created:now-HISTORY_AGE_MS-1},[],now),true);assert.equal(isEarlierUpdate({created:now,shipmentId:'done'},[{id:'done',status:'Delivered'}],now),true);assert.equal(isEarlierUpdate({created:now,shipmentId:'active'},[{id:'active',status:'Picked up'}],now),false);
});

test('owner can enable unpaid test dispatch without cash; normal unpaid and live records remain protected',async()=>{
 const f=await adminFixture();try{
  const owner=await f.login(),vendor=await f.account('vendor',vendorProfile),rider=await f.account('rider',riderProfile);await f.identity('rider',rider);
  const s=await create(f,vendor),url='/api/admin/test-shipments/enable-dispatch',input={ids:[s.id],confirmTestData:true,reason:'Test pickup and delivery'};
  assert.equal((await f.api('/api/v4/rider/offers/'+s.id+'/accept',{}, {token:rider.token})).status,409);
  assert.equal((await f.api(url,input,{token:vendor.token})).status,401);assert.equal((await f.api(url,input,{cookie:owner.cookie})).status,403);assert.equal((await f.api(url,{...input,confirmTestData:false},owner)).status,400);
  assert.equal((await f.api(url,input,owner)).status,200);assert.equal((await f.api(url,input,owner)).status,200);
  const stored=JSON.parse((await f.server.database.prepare('SELECT payload FROM shipments WHERE id=?').get(s.id)).payload);assert.equal(stored.payment.simulated,true);assert.equal(stored.payment.mode,'test');assert.equal(stored.payment.amount,0);assert.equal((await f.server.database.prepare("SELECT COUNT(*) AS total FROM admin_audit WHERE action='shipment.test_dispatch_enabled'").get()).total,1);
  const accepted=await f.api('/api/v4/rider/offers/'+s.id+'/accept',{}, {token:rider.token});assert.equal(accepted.status,200);assert.equal((await accepted.json()).status,'Rider accepted');
  const other=await create(f,vendor);await f.server.database.prepare('INSERT INTO payments(reference,shipment_id,amount,mode,status,created) VALUES (?,?,?,?,?,?)').run('protected-live-test',other.id,100000,'live','initialized',Date.now());assert.equal((await f.api(url,{...input,ids:[other.id]},owner)).status,409);
 }finally{await f.close();}
});

test('owner test mode allows unpaid accept then explicit collect, while off/live-checkout records remain gated',async()=>{
 const f=await adminFixture();try{const owner=await f.login(),vendor=await f.account('vendor',vendorProfile),rider=await f.account('rider',riderProfile);await f.identity('rider',rider);const s=await create(f,vendor),mode='/api/admin/test-dispatch-mode';assert.equal((await f.api(mode,{enabled:true,confirmTestData:true,reason:'Test delivery'}, {token:rider.token})).status,401);assert.equal((await f.api(mode,{enabled:true,confirmTestData:true,reason:'Test delivery'}, {cookie:owner.cookie})).status,403);assert.equal((await f.api(mode,{enabled:true,confirmTestData:true,reason:'Test delivery'},owner)).status,200);
 const offers=await(await f.api('/api/v4/rider/dispatch/sync',{}, {token:rider.token})).json();assert.equal(offers.offers.find(o=>o.id===s.id).testDispatchAvailable,true);const accept=await f.api('/api/v4/rider/offers/'+s.id+'/accept',{}, {token:rider.token});assert.equal(accept.status,200);const accepted=await accept.json();assert.equal(accepted.custodian,'vendor');assert.equal(accepted.payment.mode,'test');assert.equal(accepted.payment.amount,0);const collect=await f.api('/api/v3/jobs/'+s.jobTokens.pickup+'/actions',{action:'pickup'}, {token:rider.token});assert.equal(collect.status,200);assert.equal((await collect.json()).custodian,'pickup');
 const protectedJob=await create(f,vendor);await f.server.database.prepare('INSERT INTO payments(reference,shipment_id,amount,mode,status,created) VALUES (?,?,?,?,?,?)').run('existing-checkout-test',protectedJob.id,100000,'live','initialized',Date.now());assert.equal((await f.api('/api/v4/rider/offers/'+protectedJob.id+'/accept',{}, {token:rider.token})).status,409);
 assert.equal((await f.api(mode,{enabled:false,reason:'Testing finished'},owner)).status,200);const unpaid=await create(f,vendor);assert.equal((await f.api('/api/v4/rider/offers/'+unpaid.id+'/accept',{}, {token:rider.token})).status,409);
 }finally{await f.close();}
});

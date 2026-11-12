import {test} from 'node:test';
import assert from 'node:assert/strict';
import {adminFixture,vendorProfile,riderProfile} from './admin-fixture.mjs';
import {newTransport} from '../web/lifecycle.mjs';
import {dispatchMatchReasons} from '../server/dispatch-match.mjs';
const fields={sender:'Sample shop',recipient:'Sample recipient',phone:'08011112222',description:'Missed notification recovery',origin:'Zaria',originState:'Kaduna',destination:'Zaria',destinationState:'Kaduna',address:'Sample destination',deliveryType:'intrastate',deliveryFee:'1000'};
test('automatic dispatch sync recovers a pre-registration offer and inbox event once, without funding/identity bypass',async()=>{
 const f=await adminFixture();try{
 const vendor=await f.account('vendor',vendorProfile),local=newTransport(fields,'Sample shop'),created=await f.api('/api/v3/shipments',local,{token:vendor.token});assert.equal(created.status,201);const s=await created.json();
 const rider=await f.account('rider',riderProfile),sync=()=>f.api('/api/v4/rider/dispatch/sync',{}, {token:rider.token});
 const before=await(await sync()).json();assert.equal(before.identityRequired,true);assert.equal(before.offers.length,0);assert.equal(before.notifications.length,0);
 await f.identity('rider',rider);const recovered=await(await sync()).json();assert.equal(recovered.offers.length,1);assert.equal(recovered.notifications.length,1);assert.equal(recovered.offers[0].paymentStatus,'unpaid');assert.equal((await(await sync()).json()).notifications.length,1);
 assert.equal((await f.api('/api/v4/rider/offers/'+s.id+'/accept',{}, {token:rider.token})).status,409);
 const owner=await f.login(),path='/api/admin/dispatch-diagnostics?shipmentId='+s.id+'&riderId='+rider.profile.id;assert.equal((await f.api(path)).status,401);assert.equal((await f.api(path,undefined,{token:rider.token})).status,401);
 const diagnostic=await(await f.api(path,undefined,owner)).json();assert.equal(diagnostic.matches,true);assert.equal(diagnostic.notifications,1);assert.equal(diagnostic.activeDevices,0);const text=JSON.stringify(diagnostic);for(const value of [rider.token,riderProfile.phone,s.publicToken,s.jobTokens.pickup])assert.equal(text.includes(value),false);
 assert.equal((await f.api('/api/v4/rider/area',{city:'Abuja',state:'Kaduna',community:'',vehicle:'Bicycle'},{token:rider.token})).status,200);const mismatch=await(await f.api(path,undefined,owner)).json();assert.deepEqual(mismatch.reasons,['pickup-city-mismatch']);assert.equal((await(await sync()).json()).offers.length,0);
 }finally{await f.close();}
});
test('dispatch explanations preserve vehicle, identity, city/state, capacity and open-shipment gates; payment is separate',()=>{
 const s={...newTransport(fields,'Sample'),status:'Created'},r={id:'rider',phone:riderProfile.phone,identity_status:'submitted',identity_format:4,public_profile:JSON.stringify(riderProfile)};
 assert.deepEqual(dispatchMatchReasons(r,s),[]);assert.ok(dispatchMatchReasons(r,{...s,vehicleClass:'car'}).includes('vehicle-or-weight-mismatch'));assert.ok(dispatchMatchReasons({...r,identity_format:1},s).includes('identity-incomplete'));assert.ok(dispatchMatchReasons(r,s,{activeCount:5}).includes('rider-at-capacity'));assert.ok(dispatchMatchReasons(r,{...s,status:'Delivered'}).includes('shipment-not-open'));assert.ok(dispatchMatchReasons(r,{...s,originState:'Lagos'}).includes('pickup-state-mismatch'));
});

test('replaying a confirmed create repairs a missing rider notification without duplicating shipment or alert',async()=>{
 const f=await adminFixture();try{const vendor=await f.account('vendor',vendorProfile),rider=await f.account('rider',riderProfile);await f.identity('rider',rider);const local=newTransport(fields,'Sample shop');assert.equal((await f.api('/api/v3/shipments',local,{token:vendor.token})).status,201);await f.server.database.prepare('DELETE FROM delivery_notifications WHERE shipment_id=?').run(local.id);for(let i=0;i<2;i++)assert.equal((await f.api('/api/v3/shipments',local,{token:vendor.token})).status,200);assert.equal((await f.server.database.prepare('SELECT COUNT(*) AS total FROM shipments WHERE id=?').get(local.id)).total,1);assert.equal((await f.server.database.prepare('SELECT COUNT(*) AS total FROM delivery_notifications WHERE shipment_id=?').get(local.id)).total,1);const owner=await f.login();assert.equal((await(await f.api('/api/admin/shipments',undefined,owner)).json()).shipments.length,1);}finally{await f.close();}
});

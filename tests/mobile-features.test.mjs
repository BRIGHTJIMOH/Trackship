import test from 'node:test';
import assert from 'node:assert/strict';
import {adminFixture,vendorProfile,riderProfile} from './admin-fixture.mjs';
import {newTransport} from '../web/lifecycle.mjs';
import {configuredRoute} from './rider-route-fixture.mjs';
test('mobile switches default off and require owner, CSRF and current revision',async()=>{
 const f=await adminFixture();try{
 assert.deepEqual(await(await f.api('/api/mobile-features')).json(),{revision:0,bulkShipments:false,receiveParcel:false});
 const owner=await f.login(),value={revision:0,bulkShipments:true,receiveParcel:true};
 assert.equal((await f.api('/api/admin/mobile-features',value)).status,401);
 assert.equal((await f.api('/api/admin/mobile-features',value,{cookie:owner.cookie})).status,403);
 assert.equal((await f.api('/api/admin/mobile-features',{...value,receiveParcel:'true'},owner)).status,400);
 assert.equal((await f.api('/api/admin/mobile-features',value,owner)).status,200);
 assert.equal((await f.api('/api/admin/mobile-features',value,owner)).status,409);
 assert.equal((await(await f.api('/api/mobile-features')).json()).receiveParcel,true);
 assert.ok(await f.server.database.prepare("SELECT id FROM admin_audit WHERE action='mobile_features.update'").get());
 const password='Synthetic regional feature access 2026!';await f.api('/api/admin/regional-admins',{username:'feature-kano',password,states:['Kano']},owner);const res=await f.api('/api/admin/login',{username:'feature-kano',password}),region={...await res.json(),cookie:res.headers.get('set-cookie').split(';')[0]};
 assert.equal((await f.api('/api/admin/mobile-features',undefined,region)).status,403);
 }finally{await f.close();}
});
test('receive and bulk gates protect new requests; existing receive custody and contacts continue after disabling',async()=>{
 const f=await adminFixture();try{
 const owner=await f.login(),v=await f.account('vendor',vendorProfile),r=await f.account('rider',riderProfile);await f.identity('rider',r);
 const fields={sender:'Original sender',recipient:vendorProfile.ownerName,phone:vendorProfile.phone,description:'Requested parcel',origin:'Zaria',destination:'Zaria',originState:'Kaduna',destinationState:'Kaduna',deliveryType:'intrastate',deliveryFee:'1000',address:vendorProfile.pickupAddress,pickupAddress:'20 Sender Street, Zaria',pickupPhone:'08011112222'};
 const routeId=await configuredRoute(f,fields,[r]);const input=newTransport({...fields,routeId,requestType:'receive'},vendorProfile.businessName),bulk=newTransport({...fields,routeId,creationMode:'bulk'},vendorProfile.businessName);
 for(const row of [input,bulk])assert.equal((await f.api('/api/v3/shipments',row,{token:v.token})).status,403);
 await f.api('/api/admin/mobile-features',{revision:0,bulkShipments:true,receiveParcel:true},owner);
 assert.equal((await f.api('/api/v3/shipments',input,{token:v.token})).status,201);assert.equal((await f.api('/api/v3/shipments',bulk,{token:v.token})).status,201);
 const invalid=newTransport({...fields,routeId},vendorProfile.businessName);Object.assign(invalid,{requestType:'receive',pickupPhone:'bad'});assert.equal((await f.api('/api/v3/shipments',invalid,{token:v.token})).status,400);
 await f.api('/api/admin/test-dispatch-mode',{enabled:true,confirmTestData:true,reason:'Receive flow test'},owner);await f.api('/api/v4/rider/offers/'+input.id+'/accept',{},{token:r.token});
 let contacts=await(await f.api('/api/v3/jobs/'+input.jobTokens.pickup+'/contacts',undefined,{token:r.token})).json();assert.equal(contacts.contacts.find(c=>c.id==='vendor').phone,fields.pickupPhone);assert.equal(contacts.primaryContactId,'vendor');
 await f.api('/api/admin/mobile-features',{revision:1,bulkShipments:false,receiveParcel:false},owner);
 assert.equal((await f.api('/api/v3/shipments',input,{token:v.token})).status,200,'idempotent retry survives switch off');
 assert.equal((await f.api('/api/v3/jobs/'+input.jobTokens.pickup+'/actions',{action:'pickup',autoStart:true},{token:r.token})).status,200);
 contacts=await(await f.api('/api/v3/jobs/'+input.jobTokens.pickup+'/contacts',undefined,{token:r.token})).json();assert.equal(contacts.primaryContactId,'recipient');assert.equal(contacts.contacts.find(c=>c.id==='recipient').phone,vendorProfile.phone);
 const publicRow=await(await f.api('/api/track/'+input.publicToken)).json();assert.equal('pickupPhone' in publicRow,false);
 assert.equal((await f.api('/api/v3/shipments',newTransport({...fields,routeId,requestType:'receive'},vendorProfile.businessName),{token:v.token})).status,403);
 }finally{await f.close();}
});

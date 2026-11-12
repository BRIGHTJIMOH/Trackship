import {test} from 'node:test';
import assert from 'node:assert/strict';
import {adminFixture,vendorProfile,riderProfile} from './admin-fixture.mjs';
import {newTransport} from '../web/lifecycle.mjs';
async function setup(){
 const f=await adminFixture(),vendor=await f.account('vendor',vendorProfile),otherVendor=await f.account('vendor',{...vendorProfile,phone:'08022223333'}),rider=await f.account('rider',riderProfile),other=await f.account('rider',{...riderProfile,phone:'08077778888'});
 await f.identity('rider',rider);
 const local=newTransport({sender:'Sample vendor',recipient:'Sample customer',phone:'08011112222',description:'Call test parcel',origin:'Zaria',originState:'Kaduna',destination:'Zaria',destinationState:'Kaduna',address:'Sample destination',deliveryType:'intrastate',deliveryFee:'1000'},vendorProfile.businessName);
 const created=await f.api('/api/v3/shipments',local,{token:vendor.token});assert.equal(created.status,201);const shipment=await created.json();
 return {...f,vendor,otherVendor,rider,other,shipment};
}
test('delivery calls require assignment and ownership, preserve payment checks and stop on completion',async()=>{
 const f=await setup();try{
 const s=f.shipment,vendorPath='/api/v3/shipments/'+s.id+'/contacts',riderPath='/api/v3/jobs/'+s.jobTokens.pickup+'/contacts',accept='/api/v4/rider/offers/'+s.id+'/accept';
 assert.equal((await f.api(vendorPath)).status,401);assert.equal((await f.api(vendorPath,undefined,{token:f.otherVendor.token})).status,404);assert.equal((await f.api(riderPath,undefined,{token:f.rider.token})).status,403);
 assert.deepEqual((await(await f.api(vendorPath,undefined,{token:f.vendor.token})).json()).contacts,[]);
 assert.equal((await f.api(accept,{}, {token:f.rider.token})).status,409);
 await f.api('/api/v3/shipments/'+s.id+'/pay',{email:'sample@example.invalid'},{token:f.vendor.token});assert.equal((await f.api('/api/v3/shipments/'+s.id+'/verify-payment',{}, {token:f.vendor.token})).status,200);
 assert.equal((await f.api(accept,{}, {token:f.rider.token})).status,200);
 const vendorResponse=await f.api(vendorPath,undefined,{token:f.vendor.token});assert.equal(vendorResponse.headers.get('cache-control'),'no-store');const vendor=await vendorResponse.json(),rider=await(await f.api(riderPath,undefined,{token:f.rider.token})).json();assert.deepEqual(vendor.contacts.map(c=>c.phone),[riderProfile.phone]);assert.equal(vendor.contacts[0].id,'pickup');assert.deepEqual(rider.contacts.map(c=>c.phone),[vendorProfile.phone]);assert.equal((await f.api(riderPath,undefined,{token:f.other.token})).status,403);
 const publicView=JSON.stringify(await(await f.api('/api/track/'+s.publicToken)).json());for(const value of [riderProfile.phone,vendorProfile.phone,'contacts'])assert.equal(publicView.includes(value),false);
 await f.server.database.prepare('UPDATE rider_profiles SET suspended=1 WHERE id=?').run(f.rider.profile.id);assert.equal((await f.api(riderPath,undefined,{token:f.rider.token})).status,403);assert.deepEqual((await(await f.api(vendorPath,undefined,{token:f.vendor.token})).json()).contacts,[]);await f.server.database.prepare('UPDATE rider_profiles SET suspended=0 WHERE id=?').run(f.rider.profile.id);
 const row=await f.server.database.prepare('SELECT payload FROM shipments WHERE id=?').get(s.id),payload=JSON.parse(row.payload);payload.actors.pickup.id=f.other.profile.id;await f.server.database.prepare('UPDATE shipments SET payload=? WHERE id=?').run(JSON.stringify(payload),s.id);assert.equal((await f.api(riderPath,undefined,{token:f.rider.token})).status,403);
 payload.status='Delivered';await f.server.database.prepare('UPDATE shipments SET payload=? WHERE id=?').run(JSON.stringify(payload),s.id);assert.deepEqual((await(await f.api(vendorPath,undefined,{token:f.vendor.token})).json()).contacts,[]);assert.deepEqual((await(await f.api(riderPath,undefined,{token:f.other.token})).json()).contacts,[]);
 }finally{await f.close();}
});
test('delivery setup is owner-only and distinguishes configuration, provider acknowledgements and live bank funding',async()=>{
 const f=await adminFixture();try{
 const owner=await f.login(),rider=await f.account('rider',riderProfile),path='/api/admin/delivery-readiness';assert.equal((await f.api(path)).status,401);assert.equal((await f.api(path,undefined,{token:rider.token})).status,401);
 const response=await f.api(path,undefined,owner);assert.equal(response.status,200);const state=await response.json();assert.equal(state.push.configured,false);assert.equal(state.push.activeDevices,0);assert.equal(state.funding.liveAutomaticBankFunding,false);assert.equal(state.funding.checkoutMode,'test');assert.match(state.verification,/do not establish device receipt/);
 const text=JSON.stringify(state);for(const secret of [rider.token,riderProfile.phone,f.env.TRACKSHIP_ADMIN_TOKEN,f.env.TRACKSHIP_IDENTITY_KEY])assert.equal(text.includes(secret),false);
 }finally{await f.close();}
});

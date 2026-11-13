import {test} from 'node:test';
import assert from 'node:assert/strict';
import {adminFixture,vendorProfile,riderProfile} from './admin-fixture.mjs';
import {newTransport} from '../web/lifecycle.mjs';
async function setup(t){const f=await adminFixture();t.after(()=>f.close());const vendor=await f.account('vendor',vendorProfile),rider=await f.account('rider',riderProfile);await f.identity('rider',rider);
 async function parcel(){const local=newTransport({sender:vendorProfile.businessName,recipient:'Sample Customer',phone:'08011112222',description:'Automatic tracking test',origin:'Zaria',originState:'Kaduna',destination:'Kaduna',destinationState:'Kaduna',address:'Test address',deliveryType:'intrastate',deliveryFee:'1000',service:'Standard'},vendorProfile.businessName);const s=await(await f.api('/api/v3/shipments',local,{token:vendor.token})).json();await f.api(`/api/v3/shipments/${s.id}/pay`,{email:'sample@example.test'},{token:vendor.token});await f.api(`/api/v3/shipments/${s.id}/verify-payment`,{},{token:vendor.token});return s;}
 return {...f,vendor,rider,parcel,gps:(body,token=rider.token)=>f.api('/api/v3/rider/location',body,{token})};
}
test('automatic rider tracking begins on acceptance, updates every assigned parcel, and preserves physical custody',async t=>{
 const f=await setup(t),a=await f.parcel(),b=await f.parcel();assert.equal((await f.gps({start:true}).then(r=>r.json())).tracked,0);
 for(const s of [a,b])assert.equal((await f.api(`/api/v3/jobs/${s.jobTokens.pickup}/actions`,{action:'accept',autoStart:true},{token:f.rider.token})).status,200);
 const response=await f.gps({lat:11.08,lng:7.72,accuracy:15,observedAt:Date.now()});assert.equal(response.status,200);assert.equal((await response.json()).tracked,2);
 for(const s of [a,b]){const publicView=await(await f.api('/api/track/'+s.publicToken)).json();assert.equal(publicView.status,'Rider accepted');assert.equal(publicView.custodian,'vendor');assert.equal(publicView.location.lat,11.08);assert.equal(publicView.location.leg,'pickup');}
 const outsider=await f.account('rider',{...riderProfile,phone:'08077778888',fullName:'Other Rider'});assert.equal((await f.gps({lat:10,lng:5,accuracy:1,observedAt:Date.now()},outsider.token).then(r=>r.json())).tracked,0);
 assert.equal((await f.gps({lat:11,lng:7,accuracy:5,observedAt:Date.now()-31000})).status,400);
 assert.equal((await f.gps({lat:NaN,lng:7,accuracy:5,observedAt:Date.now()})).status,400);
});
test('collection automatically starts delivery, completion ends GPS, and logout revokes further updates',async t=>{
 const f=await setup(t),s=await f.parcel(),action=(name,extra={})=>f.api(`/api/v3/jobs/${s.jobTokens.pickup}/actions`,{action:name,autoStart:true,...extra},{token:f.rider.token});
 await action('accept');const collected=await action('pickup');assert.equal(collected.status,200);const trip=await collected.json();assert.equal(trip.status,'Out for delivery');assert.deepEqual(trip.events.slice(-2).map(e=>e.status),['Picked up','Out for delivery']);
 await f.gps({lat:11,lng:7,accuracy:10,observedAt:Date.now()});assert.equal((await action('request-otp')).status,200);const otp=f.texts.at(-1).message.match(/\b\d{6}\b/)[0];assert.equal((await action('complete',{otp})).status,200);
 assert.equal((await f.gps({start:true}).then(r=>r.json())).tracked,0);const pub=await(await f.api('/api/track/'+s.publicToken)).json();assert.equal(pub.location,null);assert.equal(pub.locationSharing,false);
 await f.api('/api/auth/logout',{},{token:f.rider.token});assert.equal((await f.gps({lat:11,lng:7,accuracy:10,observedAt:Date.now()})).status,401);
});

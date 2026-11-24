import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {adminFixture,vendorProfile,riderProfile} from './admin-fixture.mjs';
import {newTransport} from '../web/lifecycle.mjs';
import {REACTION_OPTIONS} from '../web/reaction-options.mjs';
const hash=s=>createHash('sha256').update(s).digest('hex');
test('shipment feelings require ownership, assignment or private tracking link; remain independent of delivery state',async()=>{
 const f=await adminFixture();try{
 const vendor=await f.account('vendor',vendorProfile),otherVendor=await f.account('vendor',{...vendorProfile,phone:'08022223333'}),rider=await f.account('rider',riderProfile),other=await f.account('rider',{...riderProfile,phone:'08077778888'});
 const s=newTransport({sender:'Sample vendor',recipient:'Sample customer',phone:'08011112222',description:'Parcel',origin:'Zaria',originState:'Kaduna',destination:'Zaria',destinationState:'Kaduna',address:'Destination',deliveryType:'intrastate',deliveryFee:'1000'},vendorProfile.businessName);
 const owner=(await f.server.database.prepare('SELECT owner_key FROM vendor_accounts WHERE phone=?').get(vendorProfile.phone)).owner_key;
 s.actors={pickup:{id:rider.profile.id,name:'Handler'}};s.status='Rider accepted';
 const save=()=>f.server.database.prepare('UPDATE shipments SET payload=? WHERE id=?').run(JSON.stringify(s),s.id);
 await f.server.database.prepare('INSERT INTO shipments(id,owner,public_hash,payload) VALUES(?,?,?,?)').run(s.id,owner,hash(s.publicToken),JSON.stringify(s));
 await f.server.database.prepare('INSERT INTO job_tokens(token_hash,shipment_id,leg) VALUES(?,?,?)').run(hash(s.jobTokens.pickup),s.id,'pickup');
 const vp='/api/v3/shipments/'+s.id+'/reactions',rp='/api/v3/jobs/'+s.jobTokens.pickup+'/reactions',pp='/api/track/'+s.publicToken+'/reactions';
 assert.equal((await f.api(vp)).status,401);assert.equal((await f.api(vp,undefined,{token:otherVendor.token})).status,404);assert.equal((await f.api(rp,undefined,{token:other.token})).status,403);
 assert.equal((await(await f.api(pp)).json()).available,false);assert.equal((await f.api(pp,{reaction:'happy'})).status,409);
 s.custodian='pickup';s.status='Picked up';await save();const original=JSON.stringify(s);
 for(const option of REACTION_OPTIONS){await f.server.database.prepare('UPDATE shipment_reactions SET updated=?').run(Date.now()-20000);const response=await f.api(vp,{reaction:option.id},{token:vendor.token});assert.equal(response.status,200,await response.clone().text());assert.equal((await response.json()).ownReaction,option.id);}
 assert.equal((await f.api(vp,{reaction:'no-such-emoji'},{token:vendor.token})).status,400);
 assert.equal((await f.api(vp,{reaction:'relieved'},{token:vendor.token})).status,200);
 assert.equal((await f.api(vp,{reaction:'angry'},{token:vendor.token})).status,429);
 assert.equal((await f.api(pp,{reaction:'waiting'})).status,200);assert.equal((await f.api(rp,{reaction:'thanks'},{token:rider.token})).status,200);
 const publicResponse=await f.api(pp),text=await publicResponse.text();assert.equal(publicResponse.headers.get('cache-control'),'no-store');const state=JSON.parse(text);assert.equal(state.reactions.length,3);assert.ok(state.reactions.some(r=>r.sender==='Tracking viewer'&&r.own));
 for(const secret of [vendor.token,rider.profile.id,vendorProfile.phone,s.publicToken,s.jobTokens.pickup,'sender_key'])assert.equal(text.includes(secret),false);
 assert.equal((await f.server.database.prepare('SELECT payload FROM shipments WHERE id=?').get(s.id)).payload,original);
 s.actors.pickup.id=other.profile.id;await save();assert.equal((await f.api(rp,{reaction:'thanks'},{token:rider.token})).status,403);assert.deepEqual((await(await f.api(pp)).json()).reactions,[]);
 s.status='Delivered';await save();assert.equal((await f.api(pp,{reaction:'happy'})).status,409);assert.equal((await(await f.api(pp)).json()).available,false);
 s.status='Picked up';s.testRemoval={at:new Date().toISOString()};await save();assert.equal((await f.api(pp)).status,404);
 assert.equal((await f.api('/api/track/'+'0'.repeat(64)+'/reactions')).status,404);
 }finally{await f.close();}
});

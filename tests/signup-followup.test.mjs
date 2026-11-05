import test from 'node:test';
import assert from 'node:assert/strict';
import {adminFixture,vendorProfile,photo} from './admin-fixture.mjs';
const route={origin:'Zaria',originState:'Kaduna',destination:'Abuja',destinationState:'FCT Abuja',pickupFee:'1000',carrierFee:'2000',lastMileFee:'1000',active:true};
test('route fee overrides combine flat and percentage, inherit explicitly, and reject stale edits',async()=>{
 const f=await adminFixture();try{const owner=await f.login();await f.api('/api/admin/pricing',{revision:0,platformPercent:'5',priorityFee:'0'},owner);
 const r=await(await f.api('/api/admin/routes',{...route,platformPercent:'2.5',platformFlatFee:'150'},owner)).json();assert.ok(r.id);
 const input={...route,deliveryType:'interstate',service:'Standard'};
 const quote=async()=>await(await f.api('/api/routes/'+r.id+'/quote',input)).json();const q=await quote();assert.equal(q.handlerKobo,400000);assert.equal(q.platformKobo,25000);assert.equal(q.totalKobo,425000);
 assert.equal((await f.api('/api/admin/routes/'+r.id,{...route,revision:r.revision,platformPercent:'',platformFlatFee:'0'},owner)).status,200);assert.equal((await quote()).platformKobo,20000);assert.equal(q.platformKobo,25000);
 assert.equal((await f.api('/api/admin/routes/'+r.id,{...route,revision:r.revision,platformPercent:'0'},owner)).status,409);
 const latest=await(await f.api('/api/admin/routes/'+r.id,{...route,revision:r.revision+1,platformPercent:'0',platformFlatFee:'75'},owner)).json();assert.equal(latest.platformPercent,0);assert.equal((await quote()).platformKobo,7500);
 assert.equal((await f.api('/api/admin/routes',{...route,platformFlatFee:'-1'},owner)).status,400);
 }finally{await f.close();}
});
test('waitlist validates consent, deduplicates email, and saves durable records without exposing them',async()=>{
 const f=await adminFixture();try{const p={name:'Ada',email:'ADA@example.com',city:'Abuja',role:'vendor',consent:true};assert.equal((await f.api('/api/waitlist',{...p,consent:false})).status,400);assert.equal((await f.api('/api/waitlist',p)).status,200);assert.equal((await f.api('/api/waitlist',{...p,email:'ada@example.com'})).status,200);assert.equal((await f.api('/api/waitlist')).status,404);
 const rows=await f.server.database.prepare('SELECT * FROM marketing_waitlist').all();assert.equal(rows.length,1);assert.equal(rows[0].email,'ada@example.com');assert.equal((await f.api('/welcome')).status,200);
 }finally{await f.close();}
});
test('optional profile photos survive signup and login, and unsafe photos are rejected',async()=>{
 const f=await adminFixture();try{const account=await f.account('vendor',{...vendorProfile,profilePhoto:photo});assert.equal(account.profile.profilePhoto,photo);
 assert.equal((await f.api('/api/accounts/profile',{...vendorProfile,profilePhoto:'javascript:alert(1)'},{token:account.token})).status,400);
 assert.equal((await f.api('/api/accounts/profile',{...vendorProfile,profilePhoto:''},{token:account.token})).status,200);
 }finally{await f.close();}
});

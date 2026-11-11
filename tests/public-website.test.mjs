import test from 'node:test';
import assert from 'node:assert/strict';
import {adminFixture,vendorProfile} from './admin-fixture.mjs';
test('public website and app have distinct routes; legacy and callback URLs remain available',async()=>{
 const f=await adminFixture();try{
 const website=await(await f.api('/')).text();assert.match(website,/Every delivery/);assert.doesNotMatch(website,/href="\/app"/);assert.match(website,/href="#waitlist"/);assert.doesNotMatch(website,/id="app"/);
 for(const path of ['/app','/app/','/index.html','/sendrack-entry.html','/t/'+'a'.repeat(64),'/r/'+'b'.repeat(64),'/payment-return?reference=preserve-me']){const r=await f.api(path);assert.equal(r.status,200,path);assert.match(await r.text(),/id="app"/,path);}
 assert.match(await(await f.api('/admin')).text(),/Owner console/);assert.match(await(await f.api('/welcome')).text(),/Every delivery/);
 const v=await f.account('vendor',vendorProfile);assert.equal(v.profile.phone,vendorProfile.phone);assert.equal((await f.server.database.prepare('SELECT count(*) AS count FROM vendor_accounts').get()).count,1);
 }finally{await f.close();}
});
test('waitlist duplicates retain the original entry and only the owner can list signups',async()=>{
 const f=await adminFixture();try{const p={name:'Website Test',email:'Website@example.com',city:'Abuja',role:'rider',consent:true};assert.equal((await f.api('/api/waitlist',{...p,consent:false})).status,400);assert.equal((await f.api('/api/waitlist',p)).status,200);assert.equal((await f.api('/api/waitlist',{...p,name:'Duplicate',email:'website@example.com',city:'Lagos'})).status,200);
 assert.equal((await f.api('/api/admin/waitlist')).status,401);const vendor=await f.account('vendor',vendorProfile);assert.equal((await f.api('/api/admin/waitlist',undefined,{token:vendor.token})).status,401);
 const owner=await f.login(),list=await(await f.api('/api/admin/waitlist',undefined,owner)).json();assert.equal(list.total,1);assert.equal(list.entries[0].name,p.name);assert.equal(list.entries[0].email,'website@example.com');assert.equal(list.entries[0].city,p.city);assert.equal(list.entries[0].role,'rider');assert.ok(list.entries[0].created_at);assert.deepEqual((await(await f.api('/api/admin/waitlist?page=2',undefined,owner)).json()).entries,[]);
 }finally{await f.close();}
});

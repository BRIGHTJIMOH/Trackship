import test from 'node:test';
import assert from 'node:assert/strict';
import {adminFixture,vendorProfile} from './admin-fixture.mjs';
test('team profiles are owner-managed, published selectively, revision protected and audited',async()=>{
 const f=await adminFixture();try{
 assert.equal((await f.api('/team')).status,200);assert.equal((await f.api('/team/')).status,200);
 assert.equal((await f.api('/api/admin/website-team')).status,401);
 const vendor=await f.account('vendor',vendorProfile);assert.equal((await f.api('/api/admin/website-team',undefined,{token:vendor.token})).status,401);
 const owner=await f.login(),config=await(await f.api('/api/admin/website-team',undefined,owner)).json();assert.equal(config.members.length,1);assert.equal(config.members[0].name,'Bright Jimoh');
 config.members.push({id:'sample-member',name:'Private draft',role:'Operations',responsibility:'Handler support',bio:'Internal draft',published:false});
 assert.equal((await f.api('/api/admin/website-team',config,{cookie:owner.cookie})).status,403);
 let response=await f.api('/api/admin/website-team',config,owner);assert.equal(response.status,200);let saved=await response.json();
 let publicData=await(await f.api('/api/website-team')).json();assert.equal(publicData.members.length,1);assert.equal('published'in publicData.members[0],false);assert.equal('revision'in publicData,false);
 assert.equal((await f.api('/api/admin/website-team',config,owner)).status,409);
 saved.members[1].published=true;response=await f.api('/api/admin/website-team',saved,owner);assert.equal(response.status,200);saved=await response.json();assert.equal((await(await f.api('/api/website-team')).json()).members.length,2);
 const bad=structuredClone(saved);bad.members[1].name='';assert.equal((await f.api('/api/admin/website-team',bad,owner)).status,400);bad.members[1]=bad.members[0];assert.equal((await f.api('/api/admin/website-team',bad,owner)).status,400);
 saved.members=[];assert.equal((await f.api('/api/admin/website-team',saved,owner)).status,200);assert.deepEqual((await(await f.api('/api/website-team')).json()).members,[]);
 assert.ok((await f.server.database.prepare("SELECT * FROM admin_audit WHERE action='website_team.update'").all()).length>=3);
 }finally{await f.close();}
});

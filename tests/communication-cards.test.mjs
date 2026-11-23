import test from 'node:test';import assert from 'node:assert/strict';import {adminFixture} from './admin-fixture.mjs';
const card={title:'New announcement',message:'A test message for everyone.',audience:'both',startsAt:'',endsAt:'',action:'track',buttonLabel:'Track package'};
test('owner-only card lifecycle protects drafts, audience, scheduling, stale edits and turn-off',async()=>{
 const f=await adminFixture();try{
  assert.deepEqual(await(await f.api('/api/communication-cards?role=vendor')).json(),{card:null});
  assert.equal((await f.api('/api/admin/communication-cards')).status,401);
  const owner=await f.login();const change=(p,auth=owner)=>f.api('/api/admin/communication-cards',p,auth);
  assert.equal((await change({revision:0,operation:'publish',card},{cookie:owner.cookie})).status,403);
  assert.equal((await change({revision:0,operation:'publish',card},{...owner,origin:'https://attacker.example'})).status,403);
  const saved=await(await change({revision:0,operation:'save',card})).json();assert.equal(saved.revision,1);assert.equal(saved.published,null);
  assert.equal((await change({revision:0,operation:'publish',card})).status,409);
  const published=await(await change({revision:1,operation:'publish',card})).json();assert.ok(published.published.id);
  for(const role of ['vendor','rider'])assert.equal((await(await f.api('/api/communication-cards?role='+role)).json()).card.title,card.title);
  const draft=await(await change({revision:2,operation:'save',card:{...card,title:'Private draft'}})).json();assert.equal(draft.published.title,card.title);assert.equal((await(await f.api('/api/communication-cards?role=vendor')).json()).card.title,card.title);
  const targeted=await(await change({revision:3,operation:'publish',card:{...card,audience:'vendor'}})).json();assert.notEqual(targeted.published.id,published.published.id);
  assert.equal((await(await f.api('/api/communication-cards?role=rider')).json()).card,null);
  assert.equal((await change({revision:4,operation:'publish',card:{...card,action:'javascript:alert(1)'}})).status,400);
  assert.equal((await change({revision:4,operation:'publish',card:{...card,endsAt:'not-a-date'}})).status,400);
  assert.equal((await change({revision:4,operation:'publish',card:{...card,startsAt:new Date(Date.now()+3600000).toISOString()}})).status,200);
  assert.equal((await(await f.api('/api/communication-cards?role=vendor')).json()).card,null);
  const off=await(await change({revision:5,operation:'unpublish'})).json();assert.equal(off.published,null);
  assert.ok(await f.server.database.prepare("SELECT id FROM admin_audit WHERE action='communication_card.publish'").get());
  const password='Communication regional test 2026';await f.api('/api/admin/regional-admins',{username:'communications-region',password,states:['Kaduna']},owner);const response=await f.api('/api/admin/login',{username:'communications-region',password});const region={...await response.json(),cookie:response.headers.get('set-cookie').split(';')[0]};assert.equal((await f.api('/api/admin/communication-cards',undefined,region)).status,403);
 }finally{await f.close();}
});

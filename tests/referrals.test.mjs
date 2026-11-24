import test from 'node:test';import assert from 'node:assert/strict';import {adminFixture,vendorProfile,riderProfile} from './admin-fixture.mjs';
const settings={revision:0,enabled:true,title:'Invite people',terms:'New unique waitlist contacts. Reviewed totals only. No prize announced. Equal totals remain tied.',startsAt:'',endsAt:''};
const signup=(referralCode,email='new@example.test',whatsapp='08011112222')=>({name:'New contact',email,city:'Zaria',role:'vendor',consent:true,whatsapp,whatsappConsent:true,referralCode});
test('vendor and rider codes are persistent, account scoped and authenticated; settings require owner and CSRF',async()=>{
 const f=await adminFixture();try{
  assert.equal((await f.api('/api/referrals/code',{})).status,401);const v=await f.account('vendor',vendorProfile),r=await f.account('rider',riderProfile),owner=await f.login();
  assert.equal((await f.api('/api/admin/referrals')).status,401);assert.equal((await f.api('/api/admin/referrals',settings,{cookie:owner.cookie})).status,403);assert.equal((await f.api('/api/admin/referrals',{...settings,terms:''},owner)).status,400);
  const a=await(await f.api('/api/referrals/code',{},{token:v.token})).json(),b=await(await f.api('/api/referrals/code',{},{token:r.token})).json();assert.match(a.code,/^SR-V-[A-F0-9]{16}$/);assert.match(b.code,/^SR-R-[A-F0-9]{16}$/);assert.notEqual(a.code,b.code);assert.equal(a.campaign.active,false);assert.equal((await(await f.api('/api/referrals/code',{},{token:v.token})).json()).code,a.code);assert.match(a.link,/\?ref=SR-V-/);
  assert.equal((await f.api('/api/admin/referrals',settings,owner)).status,200);assert.equal((await f.api('/api/admin/referrals',settings,owner)).status,409);
  assert.equal((await f.api('/api/admin/users/'+v.profile.id+'/suspend',{role:'vendor'},owner)).status,200);assert.equal((await f.api('/api/referrals/me',undefined,{token:v.token})).status,401);
  const password='Referral regional test 2026';await f.api('/api/admin/regional-admins',{username:'referral-region',password,states:['Kaduna']},owner);const response=await f.api('/api/admin/login',{username:'referral-region',password});const regional={...await response.json(),cookie:response.headers.get('set-cookie').split(';')[0]};assert.equal((await f.api('/api/admin/referrals',undefined,regional)).status,403);
 }finally{await f.close();}
});
test('attribution excludes duplicates and self referrals; owner review drives totals without exposing contact details',async()=>{
 const f=await adminFixture();try{const v=await f.account('vendor',vendorProfile),r=await f.account('rider',riderProfile),owner=await f.login();const a=await(await f.api('/api/referrals/code',{},{token:v.token})).json(),b=await(await f.api('/api/referrals/code',{},{token:r.token})).json();await f.api('/api/admin/referrals',settings,owner);
  assert.equal((await f.api('/api/waitlist',signup('SR-V-0000000000000000'))).status,400);
  const first=await f.api('/api/waitlist',signup(a.code));assert.equal(first.status,200);assert.match((await first.json()).referralMessage,/pending review/);
  assert.equal((await f.api('/api/waitlist',signup(b.code))).status,200);assert.equal((await f.api('/api/waitlist',signup(b.code,'another@example.test'))).status,200);assert.equal((await f.api('/api/waitlist',signup(a.code,'self@example.test',vendorProfile.phone))).status,200);
  let report=await(await f.api('/api/admin/referrals',undefined,owner)).json();assert.equal(report.pending.length,1);assert.equal(report.pending[0].referrer_code,a.code);assert.equal(report.leaders.find(x=>x.code===a.code).pending,1);
  const own=await(await f.api('/api/referrals/me',undefined,{token:v.token})).json();assert.equal(own.counts.pending,1);assert.equal(own.counts.approved,0);assert.equal(JSON.stringify(own).includes('new@example.test'),false);
  const id=report.pending[0].id;assert.equal((await f.api('/api/admin/referrals/review',{id,status:'approved',reason:'Confirmed genuine contact'},owner)).status,200);assert.equal((await f.api('/api/admin/referrals/review',{id,status:'rejected',reason:'Try twice'},owner)).status,409);
  assert.equal((await(await f.api('/api/referrals/me',undefined,{token:v.token})).json()).counts.approved,1);assert.equal((await(await f.api('/api/referrals/me',undefined,{token:r.token})).json()).counts.approved,0);assert.ok(await f.server.database.prepare("SELECT id FROM admin_audit WHERE action='referral.approved'").get());
 }finally{await f.close();}
});
test('disabled and future campaigns do not credit signups; existing uncredited WhatsApp contacts cannot be reintroduced',async()=>{
 const f=await adminFixture();try{const v=await f.account('vendor',vendorProfile),owner=await f.login(),a=await(await f.api('/api/referrals/code',{},{token:v.token})).json();assert.equal((await f.api('/api/waitlist',signup(a.code))).status,200);
  assert.equal((await f.api('/api/admin/referrals',{...settings,startsAt:new Date(Date.now()+3600000).toISOString()},owner)).status,200);assert.equal((await f.api('/api/waitlist',signup(a.code,'future@example.test','08011112223'))).status,200);
  await f.api('/api/admin/referrals',{...settings,revision:1},owner);assert.equal((await f.api('/api/waitlist',signup(a.code,'repeat-phone@example.test'))).status,200);
  assert.equal((await f.api('/api/waitlist',signup(a.code,'active@example.test','08011112224'))).status,200);const report=await(await f.api('/api/admin/referrals',undefined,owner)).json();assert.equal(report.pending.length,1);
 }finally{await f.close();}
});

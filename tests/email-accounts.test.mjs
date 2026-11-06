import test from 'node:test';
import assert from 'node:assert/strict';
import {adminFixture,vendorProfile,riderProfile} from './admin-fixture.mjs';
const request=(f,p,token)=>f.api('/api/accounts/email/request-code',p,token?{token}:{});
const verify=(f,id,code,token)=>f.api('/api/accounts/email/verify-code',{challengeId:id,code},token?{token}:{});
const signup=(role='vendor')=>({role,intent:'signup',email:role+'@example.com',phone:role==='vendor'?vendorProfile.phone:riderProfile.phone,profile:role==='vendor'?vendorProfile:riderProfile});
const code=f=>f.emails.at(-1).text.match(/\b\d{6}\b/)[0];
const age=async f=>f.server.database.prepare('UPDATE email_account_challenges SET created=?').run(Date.now()-61000);
test('vendor and rider email signup requires a code; code is single use and identity stays unapproved',async()=>{
 const f=await adminFixture();try{for(const role of ['vendor','rider']){const response=await request(f,signup(role));assert.equal(response.status,200);const c=await response.json();assert.ok(c.expiresAt>Date.now());const secret=code(f),row=await f.server.database.prepare('SELECT * FROM email_account_challenges WHERE id=?').get(c.challengeId);assert.notEqual(row.hash,secret);assert.equal(JSON.stringify(row).includes('code'),false);
 assert.equal((await verify(f,c.challengeId,'000000')).status,401);assert.equal((await f.server.database.prepare('SELECT count(*) AS count FROM '+(role==='vendor'?'vendor_accounts':'rider_profiles')).get()).count,0);
 const results=await Promise.all([verify(f,c.challengeId,secret),verify(f,c.challengeId,secret)]);assert.deepEqual(results.map(r=>r.status).sort(),[200,401]);const account=await results.find(r=>r.status===200).json();assert.equal(account.profile.email,role+'@example.com');assert.ok(account.profile.emailVerifiedAt);assert.equal(account.profile.identityStatus,'missing');assert.equal(account.role,role);assert.equal(account.created,true);
 }}finally{await f.close();}
});
test('resends supersede older codes and enforce cooldown and hourly limits across attempts',async()=>{
 const f=await adminFixture();try{let c=await(await request(f,signup())).json(),old=code(f);assert.equal((await request(f,signup())).status,429);await age(f);const next=await request(f,signup());assert.equal(next.status,200);const second=await next.json();assert.equal((await verify(f,c.challengeId,old)).status,401);c=second;
 for(let i=0;i<3;i++){await age(f);const r=await request(f,signup());assert.equal(r.status,200);c=await r.json();}await age(f);assert.equal((await request(f,signup())).status,429);assert.equal(f.emails.length,5);assert.equal((await verify(f,c.challengeId,code(f))).status,200);
 }finally{await f.close();}
});
test('expired and attempt-locked email codes cannot establish an account',async()=>{
 const f=await adminFixture();try{const c=await(await request(f,signup())).json();for(let i=0;i<5;i++)assert.equal((await verify(f,c.challengeId,'000000')).status,401);assert.equal((await verify(f,c.challengeId,code(f))).status,401);await age(f);const next=await(await request(f,signup())).json();await f.server.database.prepare('UPDATE email_account_challenges SET expires=? WHERE id=?').run(Date.now()-1,next.challengeId);assert.equal((await verify(f,next.challengeId,code(f))).status,401);assert.equal((await f.server.database.prepare('SELECT count(*) AS count FROM vendor_accounts').get()).count,0);
 }finally{await f.close();}
});
test('email-only returning login preserves account IDs and rejects a different email or role',async()=>{
 const f=await adminFixture();try{const c=await(await request(f,signup())).json(),account=await(await verify(f,c.challengeId,code(f))).json();await age(f);assert.equal((await request(f,{role:'vendor',intent:'login',email:'other@example.com'})).status,404);assert.equal((await request(f,{role:'rider',intent:'login',email:'vendor@example.com'})).status,404);
 const login=await request(f,{role:'vendor',intent:'login',email:' VENDOR@example.com '});assert.equal(login.status,200);const id=(await login.json()).challengeId,result=await(await verify(f,id,code(f))).json();assert.equal(result.created,false);assert.equal(result.profile.id,account.profile.id);assert.equal(result.profile.phone,vendorProfile.phone);assert.equal((await f.api('/api/accounts/vendor/shipments',undefined,{token:result.token})).status,200);
 }finally{await f.close();}
});
test('legacy accounts require authenticated email linking; knowing a phone and a new email cannot take over',async()=>{
 const f=await adminFixture();try{const legacy=await f.account('vendor',vendorProfile);await f.identity('vendor',legacy);const originalIdentity=(await f.server.database.prepare('SELECT identity_cipher FROM vendor_accounts WHERE id=?').get(legacy.profile.id)).identity_cipher;assert.equal((await request(f,signup())).status,409);const link={role:'vendor',intent:'link',email:'linked@example.com'};assert.equal((await request(f,link)).status,401);const c=await(await request(f,link,legacy.token)).json(),secret=code(f);assert.equal((await verify(f,c.challengeId,secret)).status,401);const result=await(await verify(f,c.challengeId,secret,legacy.token)).json();assert.equal(result.profile.id,legacy.profile.id);assert.equal(result.profile.email,'linked@example.com');assert.equal((await f.server.database.prepare('SELECT identity_cipher FROM vendor_accounts WHERE id=?').get(legacy.profile.id)).identity_cipher,originalIdentity);await age(f);const login=await request(f,{role:'vendor',intent:'login',email:'linked@example.com'});assert.equal(login.status,200);assert.equal((await verify(f,(await login.json()).challengeId,code(f))).status,200);
 }finally{await f.close();}
});
test('email provider configuration and send failures fail closed without creating verified accounts',async()=>{
 const f=await adminFixture();try{f.providers.emailReady=false;assert.equal((await request(f,signup())).status,503);f.providers.emailReady=true;f.providers.email=async()=>{throw Object.assign(new Error('Delivery unavailable'),{status:503});};assert.equal((await request(f,signup())).status,503);assert.equal((await f.server.database.prepare('SELECT count(*) AS count FROM vendor_accounts').get()).count,0);const c=await f.server.database.prepare('SELECT * FROM email_account_challenges').get();assert.equal(c.used,1);assert.equal((await verify(f,c.id,'123456')).status,401);
 }finally{await f.close();}
});
test('revoking a legacy session prevents linking even with the correct email code',async()=>{
 const f=await adminFixture();try{const rider=await f.account('rider',riderProfile),c=await(await request(f,{role:'rider',intent:'link',email:'rider-link@example.com'},rider.token)).json(),secret=code(f);await f.server.database.prepare('DELETE FROM rider_sessions WHERE rider_id=?').run(rider.profile.id);assert.equal((await verify(f,c.challengeId,secret,rider.token)).status,401);const row=await f.server.database.prepare('SELECT email,email_verified_at FROM rider_profiles WHERE id=?').get(rider.profile.id);assert.equal(row.email,null);assert.equal(row.email_verified_at,null);
 }finally{await f.close();}
});

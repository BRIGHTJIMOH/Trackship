import test from 'node:test';
import assert from 'node:assert/strict';
import {adminFixture} from './admin-fixture.mjs';
const entry={name:'Waitlist test',email:'contact@example.test',city:'Zaria',role:'vendor',consent:true};
test('optional WhatsApp details require separate consent, stay private and cannot overwrite an existing signup',async()=>{
 const f=await adminFixture();try{
  assert.equal((await f.api('/api/waitlist',{...entry,whatsapp:'08012345678'})).status,400);
  assert.equal((await f.api('/api/waitlist',{...entry,whatsappConsent:true})).status,400);
  assert.equal((await f.api('/api/waitlist',{...entry,whatsapp:'00000000000',whatsappConsent:true})).status,400);
  assert.equal((await f.api('/api/waitlist',{...entry,whatsapp:'+234 801 234 5678',whatsappConsent:true})).status,200);
  assert.equal((await f.api('/api/admin/waitlist')).status,401);
  const owner=await f.login();let list=await(await f.api('/api/admin/waitlist',undefined,owner)).json();
  assert.equal(list.entries[0].whatsapp,'08012345678');assert.equal(list.entries[0].whatsapp_consent,1);assert.ok(list.entries[0].whatsapp_consented_at);
  assert.equal((await f.api('/api/waitlist',{...entry,whatsapp:'09012345678',whatsappConsent:true})).status,200);
  list=await(await f.api('/api/admin/waitlist',undefined,owner)).json();assert.equal(list.total,1);assert.equal(list.entries[0].whatsapp,'08012345678');
 }finally{await f.close();}
});
test('existing email-only waitlist signup remains supported without assumed WhatsApp consent',async()=>{
 const f=await adminFixture();try{assert.equal((await f.api('/api/waitlist',entry)).status,200);const owner=await f.login();const list=await(await f.api('/api/admin/waitlist',undefined,owner)).json();assert.equal(list.entries[0].whatsapp,null);assert.equal(list.entries[0].whatsapp_consent,0);}finally{await f.close();}
});

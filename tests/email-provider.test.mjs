import test from 'node:test';
import assert from 'node:assert/strict';
import {providersFromEnv} from '../server/providers.mjs';
test('Resend adapter requires a private key and sender, sends code only to provider, and rejects failed delivery',async()=>{
 assert.equal(providersFromEnv({}).emailReady,false);assert.equal(providersFromEnv({RESEND_API_KEY:'re_test'}).emailReady,false);
 await assert.rejects(providersFromEnv({}).email('user@example.com','Code','123456'),/not connected/);
 const original=globalThis.fetch,provider=providersFromEnv({RESEND_API_KEY:'re_test_only',EMAIL_FROM:'SendRack <accounts@example.com>'});assert.equal(provider.emailReady,true);
 try{let calls=0;globalThis.fetch=async(url,options)=>{calls++;assert.equal(url,'https://api.resend.com/emails');const body=JSON.parse(options.body);assert.deepEqual(body.to,['user@example.com']);assert.equal(body.from,'SendRack <accounts@example.com>');assert.equal(body.text,'Your code is 123456');assert.equal(options.headers.Authorization,'Bearer re_test_only');return {ok:true,json:async()=>({id:'test-message'})};};assert.equal(await provider.email('user@example.com','SendRack code','Your code is 123456'),true);assert.equal(calls,1);
 globalThis.fetch=async()=>({ok:false,json:async()=>({message:'private provider failure'})});await assert.rejects(provider.email('user@example.com','Code','123456'),e=>e.status===503&&!e.message.includes('123456')&&!e.message.includes('private provider'));
 }finally{globalThis.fetch=original;}
});
test('Resend account-only test sender stays configurable and reports restricted recipients without pretending to send',async()=>{
 const original=globalThis.fetch,provider=providersFromEnv({RESEND_API_KEY:'re_test_only',EMAIL_FROM:'SendRack <onboarding@resend.dev>'});assert.equal(provider.emailReady,true);
 try{
  let actual;
  globalThis.fetch=async(url,options)=>{actual=JSON.parse(options.body);return {ok:true,status:200,json:async()=>({id:'account-only-test'})};};
  assert.equal(await provider.email('account-owner@example.com','Signup code','Your code is 123456'),true);assert.equal(actual.from,'SendRack <onboarding@resend.dev>');assert.deepEqual(actual.to,['account-owner@example.com']);assert.equal(actual.text,'Your code is 123456');
  globalThis.fetch=async()=>({ok:false,status:403,json:async()=>({message:'private account email or provider detail'})});
  await assert.rejects(provider.email('someone-else@example.com','Signup code','Your code is 123456'),e=>e.status===503&&e.message.includes('email registered to your Resend account')&&!e.message.includes('123456')&&!e.message.includes('private account'));
  assert.equal(providersFromEnv({RESEND_API_KEY:'re_test_only'}).emailReady,false);
 }finally{globalThis.fetch=original;}
});

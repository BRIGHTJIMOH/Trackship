import {test} from 'node:test';
import assert from 'node:assert/strict';
import {publicMapConfig} from '../server/maps.mjs';
test('maps use a public display key and never expose payment or identity secrets',()=>{const config=publicMapConfig({PUBLIC_MAPTILER_KEY:'test_public_12345',PAYSTACK_SECRET_KEY:'private-payment-key',TRACKSHIP_IDENTITY_KEY:'private-identity-key'});assert.equal(config.provider,'maptiler');assert.equal(config.tileUrl,'https://api.maptiler.com/maps/streets-v2/{z}/{x}/{y}.png?key=test_public_12345');assert.equal(JSON.stringify(config).includes('private-'),false);assert.equal(publicMapConfig({PUBLIC_MAPTILER_KEY:'<invalid>'}).provider,'openstreetmap-pilot');});
import {validatedMapConfig} from '../web/map-display.mjs';
import {adminFixture} from './admin-fixture.mjs';
test('only supported provider tile origins are accepted; no private URLs or arbitrary hosts',()=>{
 for(const config of [publicMapConfig({}),publicMapConfig({PUBLIC_MAPTILER_KEY:'test_public_12345'})])assert.equal(validatedMapConfig(config).provider,config.provider);
 for(const value of [null,{provider:'maptiler',tileUrl:'https://untrusted.test/private'},{provider:'maptiler',tileUrl:'https://api.maptiler.com/maps/streets-v2/{z}/{x}/{y}.png?key=test_public_12345&private=token'},{provider:'openstreetmap-pilot',tileUrl:'/t/private-token'}])assert.throws(()=>validatedMapConfig(value));
});
test('capabilities and operations feed use the same fresh configuration after rotation/removal',async()=>{
 const f=await adminFixture();try{
 const owner=await f.login();
 for(const key of ['test_public_12345','rotated_public_12345',undefined]){
  if(key)f.env.PUBLIC_MAPTILER_KEY=key;else delete f.env.PUBLIC_MAPTILER_KEY;
  const caps=await(await f.api('/api/capabilities')).json(),feed=await(await f.api('/api/admin/live-operations',undefined,owner)).json();assert.deepEqual(feed.maps,caps.maps);assert.equal(caps.maps.provider,key?'maptiler':'openstreetmap-pilot');if(key)assert.ok(caps.maps.tileUrl.endsWith(key));
 }
 const asset=await f.api('/map-display.mjs');assert.equal(asset.status,200);assert.match(asset.headers.get('content-type'),/javascript/);assert.equal(asset.headers.get('referrer-policy'),'no-referrer');assert.match(await asset.text(),/strict-origin-when-cross-origin/);
 }finally{await f.close();}
});

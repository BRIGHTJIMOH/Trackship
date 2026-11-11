import {test} from 'node:test';
import assert from 'node:assert/strict';
import {verifyMapProvider,validatedMapConfig} from '../web/map-display.mjs';
import {pickupLocation} from '../server/maps.mjs';
import {flowPublic} from '../web/lifecycle.mjs';
test('maps: HTTP-200 invalid-key images never count as a verified MapTiler configuration',async()=>{
 const config=validatedMapConfig({provider:'maptiler',tileUrl:'https://api.maptiler.com/maps/streets-v2/{z}/{x}/{y}.png?key=synthetic_public_key'});
 await assert.rejects(verifyMapProvider(config,{fetchImpl:async()=>new Response('Invalid key image',{status:200,headers:{'Content-Type':'image/png'}})}),/invalid TileJSON/);
 await assert.rejects(verifyMapProvider(config,{fetchImpl:async()=>Response.json({error:'Invalid key'},{status:403})}),/HTTP 403/);
 await verifyMapProvider(config,{fetchImpl:async(url,options)=>{assert.equal(url,'https://api.maptiler.com/maps/streets-v2/tiles.json?key=synthetic_public_key');assert.equal(options.credentials,'omit');assert.equal(options.referrerPolicy,'strict-origin-when-cross-origin');assert.equal(options.cache,'no-store');return Response.json({tilejson:'2.0.0',tiles:['https://api.maptiler.com/map.png']});}});
});
test('pickup pins: explicit sender confirmation, finite coordinates and coarser public display',()=>{
 assert.throws(()=>pickupLocation({lat:9,lng:7,accuracy:10}),/Confirm/);assert.throws(()=>pickupLocation({confirmed:true,lat:Infinity,lng:7,accuracy:10}),/Confirm/);const pin=pickupLocation({confirmed:true,lat:9.123456,lng:7.654321,accuracy:15},Date.now()),s={pickupLocation:pin,workflowVersion:3,status:'Created',custodian:'vendor',deliveryType:'intrastate',events:[]};const view=flowPublic(s);assert.equal(view.pickupLocation.lat,9.12);assert.equal(view.pickupLocation.lng,7.65);assert.equal(view.pickupLocation.accuracy,1500);assert.equal(view.pickupLocation.approximate,true);assert.equal(view.location,null);assert.equal(flowPublic({...s,status:'Delivered',custodian:'customer'}).pickupLocation,null);
});
import {adminFixture,vendorProfile} from './admin-fixture.mjs';
import {newTransport} from '../web/lifecycle.mjs';
test('pickup pin updates require the owning vendor, explicit confirmation and unaccepted shipment; no GPS or custody mutation',async()=>{
 const f=await adminFixture();try{
 const vendor=await f.account('vendor',vendorProfile),other=await f.account('vendor',{...vendorProfile,phone:'08022223333'});
 const shipment=newTransport({sender:'Sample shop',recipient:'Sample recipient',phone:'08033334444',description:'Sample parcel',origin:'Zaria',originState:'Kaduna',destination:'Zaria',destinationState:'Kaduna',address:'Sample destination',deliveryType:'intrastate',deliveryFee:'2500'},'Sample shop');
 const created=await f.api('/api/v3/shipments',shipment,{token:vendor.token});assert.equal(created.status,201);const before=await created.json(),path='/api/v3/shipments/'+shipment.id+'/pickup-location',fix={confirmed:true,lat:11.085432,lng:7.719876,accuracy:24};
 assert.equal((await f.api(path,fix)).status,401);assert.equal((await f.api(path,fix,{token:other.token})).status,404);
 assert.equal((await f.api(path,{...fix,confirmed:false},{token:vendor.token})).status,400);
 const saved=await f.api(path,fix,{token:vendor.token});assert.equal(saved.status,200);assert.equal((await saved.json()).pickupLocation.source,'sender-confirmed');
 const row=await f.server.database.prepare('SELECT payload FROM shipments WHERE id=?').get(shipment.id),after=JSON.parse(row.payload);assert.equal(after.custodian,before.custodian);assert.deepEqual(after.events,before.events);assert.equal(after.location,null);assert.equal(after.locationConsent,before.locationConsent);
 const publicView=flowPublic(after);assert.equal(publicView.pickupLocation.approximate,true);assert.notEqual(publicView.pickupLocation.lat,fix.lat);
 after.status='Rider accepted';await f.server.database.prepare('UPDATE shipments SET payload=? WHERE id=?').run(JSON.stringify(after),after.id);assert.equal((await f.api(path,fix,{token:vendor.token})).status,409);
 }finally{await f.close();}
});

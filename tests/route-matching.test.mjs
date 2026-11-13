import test from 'node:test';
import assert from 'node:assert/strict';
import {adminFixture,vendorProfile,riderProfile} from './admin-fixture.mjs';
import {configuredRoute,selectRoute} from './rider-route-fixture.mjs';
import {newTransport} from '../web/lifecycle.mjs';
const fields={sender:'Sample Vendor',recipient:'Sample Customer',phone:'08011112222',description:'Route matching parcel',origin:'Zaria',originState:'Kaduna',destination:'Kaduna',destinationState:'Kaduna',address:'Sample address',deliveryType:'intrastate',deliveryFee:'1000'};
async function create(f,vendor,routeId,overrides={}){const response=await f.api('/api/v3/shipments',newTransport({...fields,...(routeId?{routeId}:{}),...overrides},vendorProfile.businessName),{token:vendor.token});assert.equal(response.status,201,await response.clone().text());return response.json();}
async function register(f,i){const r=await f.account('rider',{...riderProfile,phone:'0802222000'+i,fullName:'Route Rider '+i});await f.identity('rider',r);return r;}
test('route offers notify only selected direction and destination; matching riders compete for one claim',async()=>{
 const f=await adminFixture();try{
  const vendor=await f.account('vendor',vendorProfile),a=await register(f,1),b=await register(f,2),reverse=await register(f,3),different=await register(f,4);
  const route=await configuredRoute(f,fields,[a,b]);await selectRoute(f,reverse,route,'reverse');await configuredRoute(f,{...fields,destination:'Sabon Gari'},[different]);
  const s=await create(f,vendor,route),notices=await f.server.database.prepare('SELECT rider_id FROM delivery_notifications WHERE shipment_id=?').all(s.id);assert.deepEqual(new Set(notices.map(n=>n.rider_id)),new Set([a.profile.id,b.profile.id]));
  for(const r of [reverse,different]){assert.equal((await(await f.api('/api/v4/rider/offers',undefined,{token:r.token})).json()).offers.length,0);assert.equal((await f.api(`/api/v4/rider/offers/${s.id}/accept`,{},{token:r.token})).status,403);}
  await f.api(`/api/v3/shipments/${s.id}/pay`,{email:'sample@example.test'},{token:vendor.token});await f.api(`/api/v3/shipments/${s.id}/verify-payment`,{},{token:vendor.token});
  const results=await Promise.all([a,b].map(r=>f.api(`/api/v4/rider/offers/${s.id}/accept`,{},{token:r.token})));assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);
 }finally{await f.close();}
});
test('paused, stale, inactive and unconfigured routes fail closed; reverse direction requires the matching pickup area',async()=>{
 const f=await adminFixture();try{
  const vendor=await f.account('vendor',vendorProfile),rider=await register(f,1),route=await configuredRoute(f,fields,[rider]);
  await selectRoute(f,rider,route,'forward',false);let s=await create(f,vendor,route);assert.equal((await f.server.database.prepare('SELECT count(*) n FROM delivery_notifications WHERE shipment_id=?').get(s.id)).n,0);
  await f.api('/api/v4/rider/area',{city:'Kaduna',state:'Kaduna',community:'',vehicle:'Bicycle'},{token:rider.token});await selectRoute(f,rider,route,'reverse');s=await create(f,vendor,route,{origin:'Kaduna',destination:'Zaria'});assert.equal((await(await f.api('/api/v4/rider/offers',undefined,{token:rider.token})).json()).offers.some(o=>o.id===s.id),true);
  await f.server.database.prepare('UPDATE admin_routes SET revision=2 WHERE id=?').run(route);assert.equal((await(await f.api('/api/v4/rider/offers',undefined,{token:rider.token})).json()).offers.length,0);
  assert.equal((await f.api('/api/v4/rider/routes',{routes:[{routeId:route,direction:'reverse',revision:1}],available:true},{token:rider.token})).status,409);await selectRoute(f,rider,route,'reverse',true,2);
  await f.server.database.prepare('UPDATE admin_routes SET active=0 WHERE id=?').run(route);assert.equal((await(await f.api('/api/v4/rider/offers',undefined,{token:rider.token})).json()).offers.length,0);
  const unrouted=await create(f,vendor,null,{origin:'Kaduna',destination:'Zaria'});assert.equal((await f.server.database.prepare('SELECT count(*) n FROM delivery_notifications WHERE shipment_id=?').get(unrouted.id)).n,0);
 }finally{await f.close();}
});
test('route settings require rider authentication, valid direction and current route revision',async()=>{
 const f=await adminFixture();try{
  const vendor=await f.account('vendor',vendorProfile),a=await register(f,1),b=await register(f,2),route=await configuredRoute(f,fields,[a]);
  assert.equal((await f.api('/api/v4/rider/routes',undefined,{token:vendor.token})).status,401);
  await f.api('/api/v4/rider/routes',{routes:[{routeId:route,direction:'forward',revision:1}],available:true,riderId:a.profile.id},{token:b.token});assert.equal((await(await f.api('/api/v4/rider/routes',undefined,{token:b.token})).json()).selected.length,1);
  await f.server.database.prepare('UPDATE admin_routes SET bidirectional=0 WHERE id=?').run(route);assert.equal((await f.api('/api/v4/rider/routes',{routes:[{routeId:route,direction:'reverse',revision:1}],available:true},{token:a.token})).status,409);
  await f.api('/api/v4/rider/routes',{routes:[],available:false},{token:a.token});assert.equal((await(await f.api('/api/v4/rider/routes',undefined,{token:a.token})).json()).selected.length,0);assert.equal((await(await f.api('/api/v4/rider/routes',undefined,{token:b.token})).json()).selected.length,1);
 }finally{await f.close();}
});

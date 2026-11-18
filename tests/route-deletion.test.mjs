import {test} from 'node:test';
import assert from 'node:assert/strict';
import {adminFixture,vendorProfile,riderProfile} from './admin-fixture.mjs';
import {newTransport} from '../web/lifecycle.mjs';
import {selectRoute} from './rider-route-fixture.mjs';
const local=(state='Kaduna')=>({name:state+' local',origin:state==='Kaduna'?'Zaria':'City A',originState:state,destination:state==='Kaduna'?'Zaria':'City B',destinationState:state,deliveryType:'intrastate',pickupFee:'1000',active:true,bidirectional:true});
test('route deletion requires owner/CSRF/current revision and preserves assigned shipments and saved prices',async()=>{
 const f=await adminFixture();try{
  const owner=await f.login(),route=await(await f.api('/api/admin/routes',local(),owner)).json(),path='/api/admin/routes/'+route.id+'/delete';
  assert.equal((await f.api(path,{revision:route.revision})).status,401);assert.equal((await f.api(path,{revision:route.revision},{cookie:owner.cookie})).status,403);assert.equal((await f.api(path,{revision:0},owner)).status,409);
  const v=await f.account('vendor',vendorProfile),r=await f.account('rider',riderProfile);await f.identity('rider',r);await selectRoute(f,r,route.id);
  const input=newTransport({routeId:route.id,sender:'Sample vendor',recipient:'Sample recipient',phone:'08011112222',description:'Preserved route shipment',origin:'Zaria',originState:'Kaduna',destination:'Zaria',destinationState:'Kaduna',deliveryType:'intrastate',deliveryFee:'1000',address:'Sample delivery address'},vendorProfile.businessName),created=await f.api('/api/v3/shipments',input,{token:v.token});assert.equal(created.status,201);const s=await created.json();await f.api('/api/v3/shipments/'+s.id+'/pay',{email:'sample@example.invalid'},{token:v.token});await f.api('/api/v3/shipments/'+s.id+'/verify-payment',{},{token:v.token});assert.equal((await f.api('/api/v4/rider/offers/'+s.id+'/accept',{},{token:r.token})).status,200);
  const before=(await f.server.database.prepare('SELECT payload FROM shipments WHERE id=?').get(s.id)).payload;
  assert.equal((await f.api(path,{revision:route.revision},owner)).status,200);
  assert.equal((await f.server.database.prepare('SELECT payload FROM shipments WHERE id=?').get(s.id)).payload,before);
  assert.equal((await(await f.api('/api/admin/routes',undefined,owner)).json()).routes.length,0);assert.equal((await(await f.api('/api/routes')).json()).routes.length,0);
  assert.equal((await f.api('/api/routes/'+route.id+'/quote',input)).status,409);assert.equal((await f.api('/api/admin/routes/'+route.id,{...local(),revision:route.revision},owner)).status,404);
  assert.equal((await f.api('/api/v3/jobs/'+s.jobTokens.pickup+'/actions',{action:'pickup'},{token:r.token})).status,200,'assigned delivery can continue');
  const saved=await f.server.database.prepare('SELECT deleted,active FROM admin_routes WHERE id=?').get(route.id);assert.equal(saved.deleted,1);assert.equal(saved.active,0);assert.ok(await f.server.database.prepare("SELECT id FROM admin_audit WHERE action='route.delete' AND entity_id=?").get(route.id));
 }finally{await f.close();}
});
test('regional managers delete only their assigned intrastate routes',async()=>{
 const f=await adminFixture();try{
  const owner=await f.login(),password='Synthetic regional route deletion 2026!';assert.equal((await f.api('/api/admin/regional-admins',{username:'route-kano',password,states:['Kano']},owner)).status,201);const response=await f.api('/api/admin/login',{username:'route-kano',password}),auth={...await response.json(),cookie:response.headers.get('set-cookie').split(';')[0]};
  const routes=[];for(const value of [local('Kano'),local('Kaduna'),{...local('Kano'),name:'Kano to Kaduna',destinationState:'Kaduna',deliveryType:'interstate',carrierFee:'2000',lastMileFee:'1000'}]){const res=await f.api('/api/admin/routes',value,owner);assert.equal(res.status,201);routes.push(await res.json());}
  for(const route of routes.slice(1))assert.equal((await f.api('/api/admin/routes/'+route.id+'/delete',{revision:route.revision},auth)).status,403);
  assert.equal((await f.api('/api/admin/routes/'+routes[0].id+'/delete',{revision:1},{cookie:auth.cookie})).status,403);assert.equal((await f.api('/api/admin/routes/'+routes[0].id+'/delete',{revision:1},auth)).status,200);
  const remaining=(await(await f.api('/api/admin/routes',undefined,owner)).json()).routes;assert.deepEqual(new Set(remaining.map(r=>r.id)),new Set(routes.slice(1).map(r=>r.id)));assert.ok(await f.server.database.prepare("SELECT id FROM admin_audit WHERE action='regional_route.delete'").get());
 }finally{await f.close();}
});

import {testDatabase} from './database-fixture.mjs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createApp} from '../server/server.mjs';
import {newShipment,addEvent} from '../web/core.mjs';
const fields={sender:'Bright',recipient:'Ada',phone:'08012345678',origin:'Abuja',destination:'Lagos',address:'10 Marina Road',description:'Dresses',rider:'Rider',riderPhone:'08099999999',notes:''};
test('tracking service enforces ownership, transitions, privacy, persistence and CORS',async()=>{
 const database=await testDatabase();const dir=mkdtempSync(path.join(tmpdir(),'trackship-test-'));let server=await createApp({dataDir:dir,env:database.env});await new Promise(r=>server.listen(0,'127.0.0.1',r));let base=`http://127.0.0.1:${server.address().port}`;
 const call=(url,opts={})=>fetch(base+url,opts);
 const register=async()=>{const r=await call('/api/workspaces',{method:'POST',body:'{}'});assert.equal(r.status,201);return(await r.json()).token;};
 const token=await register(),other=await register();
 const put=(s,t=token)=>call('/api/shipments/'+s.id,{method:'PUT',headers:{Authorization:'Bearer '+t,'Content-Type':'application/json'},body:JSON.stringify(s)});
 try{
  assert.equal((await call('/api/health')).status,200);const ready=await(await call('/api/ready')).json();assert.equal(ready.ready,true);assert.equal(ready.database,process.env.SENDRACK_TEST_POSTGRES_URL?'postgres':'sqlite');
  let s=newShipment(fields,'Bright');assert.equal((await put(s,'bad')).status,401);assert.equal((await put(s)).status,201);assert.equal((await put(s)).status,200);assert.equal((await put(s,other)).status,404);
  let r=await call('/api/track/'+s.publicToken);assert.equal(r.status,200);let p=await r.json();assert.equal(p.status,'Created');assert.equal(p.address,undefined);assert.equal(p.recipient,undefined);
  s=addEvent(s,'Picked up','Gate 123');assert.equal((await put(s)).status,200);p=await(await call('/api/track/'+s.publicToken)).json();assert.equal(p.status,'Picked up');assert.equal(JSON.stringify(p).includes('Gate'),false);
  const changed={...s,address:'Unauthorized replacement'};assert.equal((await put(changed)).status,409);
  const bad={...s,status:'Delivered',events:[s.events[0],{...s.events[1],status:'Delivered'}]};assert.equal((await put(bad)).status,400);
  assert.equal((await call('/api/track/'+s.id)).status,404);
  const cors=await call('/api/health',{headers:{Origin:'https://appassets.trackship.ng'}});assert.equal(cors.headers.get('access-control-allow-origin'),'https://appassets.trackship.ng');
  assert.equal((await call('/api/health',{headers:{Origin:'https://evil.example'}})).headers.get('access-control-allow-origin'),null);
  assert.equal((await call('/api/workspaces',{method:'POST',body:'{broken'})).status,400);
  assert.equal((await call('/api/workspaces',{method:'POST',body:JSON.stringify({large:'x'.repeat(70000)})})).status,413);
  assert.equal((await call('/t/'+s.publicToken)).status,200);
  await new Promise(r=>server.close(r));await server.databaseClosed;server=await createApp({dataDir:dir,env:database.env});await new Promise(r=>server.listen(0,'127.0.0.1',r));base=`http://127.0.0.1:${server.address().port}`;
  p=await(await call('/api/track/'+s.publicToken)).json();assert.equal(p.status,'Picked up');assert.equal((await put(s)).status,200);
 }finally{await new Promise(r=>server.close(r));await server.databaseClosed;await database.cleanup();rmSync(dir,{recursive:true,force:true});}
});
test('private rider dispatch can update only its own shipment, and vendor can pull changes',async()=>{
 const database=await testDatabase();const dir=mkdtempSync(path.join(tmpdir(),'trackship-rider-'));const server=await createApp({dataDir:dir,env:database.env});await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`;
 const call=(url,opts={})=>fetch(base+url,opts);
 try{
  const {token}=await(await call('/api/workspaces',{method:'POST',body:'{}'})).json();const s=newShipment(fields,'Bright');const auth={Authorization:'Bearer '+token,'Content-Type':'application/json'};
  assert.equal((await call('/api/shipments/'+s.id,{method:'PUT',headers:auth,body:JSON.stringify(s)})).status,201);
  assert.equal((await call('/api/shipments/'+s.id)).status,401);
  const get=await call('/api/rider/'+s.riderToken);assert.equal(get.status,200);const job=await get.json();assert.equal(job.recipient,'Ada');assert.equal(job.address,'10 Marina Road');assert.equal(job.publicToken,undefined);assert.equal(job.riderToken,undefined);
  assert.equal((await call('/api/rider/'+s.publicToken)).status,404);assert.equal((await call('/api/rider/'+'f'.repeat(64))).status,404);
  const event=addEvent(s,'Picked up','Picked up by Chika').events.at(-1);
  const post=e=>call('/api/rider/'+s.riderToken+'/events',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(e)});
  assert.equal((await post(event)).status,200);assert.equal((await post(event)).status,200);
  assert.equal((await post({...event,id:crypto.randomUUID(),status:'Delivered'})).status,409);
  assert.equal((await post({...event,id:crypto.randomUUID(),status:'Cancelled'})).status,409);
  assert.equal((await call('/api/shipments/'+s.id,{headers:auth})).status,200);const pulled=await(await call('/api/shipments/'+s.id,{headers:auth})).json();assert.equal(pulled.status,'Picked up');
  const customer=await(await call('/api/track/'+s.publicToken)).json();assert.equal(customer.status,'Picked up');assert.equal(customer.address,undefined);assert.equal(customer.riderToken,undefined);
  assert.equal((await call('/api/shipments/'+s.id,{method:'PUT',headers:auth,body:JSON.stringify(s)})).status,409);
  assert.equal((await call('/r/'+s.riderToken)).status,200);
 }finally{await new Promise(r=>server.close(r));await server.databaseClosed;await database.cleanup();rmSync(dir,{recursive:true,force:true});}
});

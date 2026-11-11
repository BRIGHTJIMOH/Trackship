import {chromium} from 'playwright-core';
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {mkdir,readFile} from 'node:fs/promises';
import {adminFixture,vendorProfile} from './admin-fixture.mjs';
import {newTransport,FLOWS} from '../web/lifecycle.mjs';
const f=await adminFixture(),browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
const out='docs/mobile-profile-map';await mkdir(out,{recursive:true});
try{
 const vendor=await f.account('vendor',vendorProfile),owner=(await f.server.database.prepare('SELECT owner_key FROM vendor_accounts WHERE id=?').get(vendor.profile.id)).owner_key;
 const context=await browser.newContext({viewport:{width:390,height:844}}),p=await context.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));
 await context.route(f.base+'/**',async route=>{const path=new URL(route.request().url()).pathname;if(path.startsWith('/t/')||path.startsWith('/api/'))return route.fallback();const aliases={'/sendrack-main.js':'/app.js','/sendrack-ui.css':'/style.css'},name=aliases[path]||path;try{return route.fulfill({contentType:name.endsWith('.css')?'text/css':name.endsWith('.mjs')||name.endsWith('.js')?'text/javascript':name.endsWith('.ttf')?'font/ttf':'application/octet-stream',body:await readFile('web'+name)});}catch{return route.fallback();}});
 await context.route('https://api.maptiler.com/**',r=>r.abort());await context.route('https://tile.openstreetmap.org/**',r=>r.abort());
 for(const type of ['intrastate','interstate']){
  const shipment=newTransport({sender:'Sample vendor',recipient:'Sample recipient',phone:'08011112222',description:'Sample shipment · progress demonstration',origin:'Zaria',originState:'Kaduna',destination:type==='interstate'?'Abuja':'Zaria',destinationState:type==='interstate'?'FCT Abuja':'Kaduna',address:'Sample delivery address',deliveryType:type,deliveryFee:type==='interstate'?'2500':'1000',...(type==='interstate'?{pickupFee:'500',carrierFee:'1500',lastMileFee:'500'}:{})},'Sample Market');
  await f.server.database.prepare('INSERT INTO shipments(id,owner,public_hash,payload) VALUES (?,?,?,?)').run(shipment.id,owner,createHash('sha256').update(shipment.publicToken).digest('hex'),JSON.stringify(shipment));
  const flow=FLOWS[type];
  for(const [stage,status] of flow.entries()){
   const events=flow.slice(0,stage+1).map((status,i)=>({id:randomUUID(),status,at:new Date(Date.now()-(flow.length-i)*60000).toISOString(),note:'Sample recorded custody event'}));
   const next={...shipment,status,events};await f.server.database.prepare('UPDATE shipments SET payload=? WHERE id=?').run(JSON.stringify(next),shipment.id);
   await p.goto(f.base+'/t/'+shipment.publicToken);try{await p.locator('.timeline').waitFor({timeout:5000});}catch(e){console.log('Tracking diagnostic',type,status,await p.locator('body').innerText(),errors,await(await f.api('/api/track/'+shipment.publicToken)).text());throw e;}const complete=await p.locator('.event.completed').count(),active=p.locator('.event.current');assert.equal(complete,status==='Delivered'?flow.length:stage);assert.equal(await active.count(),status==='Delivered'?0:1);assert.equal(await p.locator('.event.pending').count(),flow.length-stage-1);if(status!=='Delivered')assert.equal(await active.getAttribute('data-stage'),status);
   if(status==='Rider accepted'){assert.equal(await p.locator('.event[data-stage="Picked up"]').getAttribute('data-state'),'pending');assert.equal(await p.locator('.event[data-stage=Created]').getAttribute('data-state'),'completed');}
   if(status==='Picked up'){assert.equal(await p.locator('.event[data-stage="Rider accepted"]').getAttribute('data-state'),'completed');assert.equal(await p.locator('.event[data-stage=Created]').getAttribute('data-state'),'completed');}
   assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
   if(['Created','Rider accepted','Picked up','Carrier accepted','Last-mile rider accepted','Delivered'].includes(status))await p.locator('.timeline').screenshot({path:out+'/'+type+'-'+status.toLowerCase().replaceAll(' ','-')+'.png'});
   if(status==='Picked up'){await p.evaluate(()=>document.documentElement.dataset.theme='dark');await p.locator('.timeline').screenshot({path:out+'/'+type+'-dark-progress.png'});await p.emulateMedia({reducedMotion:'reduce'});assert.equal(await active.locator('.event-icon').evaluate(e=>getComputedStyle(e).animationName),'none');await p.emulateMedia({reducedMotion:'no-preference'});}
  }
  const cancelled={...shipment,status:'Cancelled',events:[...shipment.events,{id:randomUUID(),status:'Cancelled',at:new Date().toISOString()}]};await f.server.database.prepare('UPDATE shipments SET payload=? WHERE id=?').run(JSON.stringify(cancelled),shipment.id);await p.goto(f.base+'/t/'+shipment.publicToken);await p.locator('.event.cancelled').waitFor();assert.equal(await p.locator('.event.current,.event.pending').count(),0);
 }
 assert.deepEqual(errors,[]);console.log('PASS: real customer tracking for every intra/interstate custody stage: previous green, current orange, future muted; acceptance is not pickup, delivery/cancellation end animation, dark mode and reduced motion.');
}finally{await browser.close();await f.close();}

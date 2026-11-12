import {chromium} from 'playwright-core';
import assert from 'node:assert/strict';
import {adminFixture} from './admin-fixture.mjs';
const f=await adminFixture(),browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
try{
 const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/dispatch-quiet-test',r=>r.fulfill({contentType:'text/html',body:`<link rel="stylesheet" href="/style.css"><main id="fixture"></main><script type="module">
 import {createFeatures} from '/features.mjs';
 const intervals=[],originalInterval=window.setInterval;window.setInterval=(fn,ms)=>ms===10000?(intervals.push(fn),98765):originalInterval(fn,ms);
 window.state={activeRole:'rider',accounts:{rider:{fullName:'Sample rider'}},riderConnection:{base:location.origin,token:'a'.repeat(64)}};
 window.calls=0;window.pending=[];window.renderCount=0;
 const features=createFeatures({getData:()=>state,getView:()=> 'alerts',getCurrent:()=>null,commit:()=>true,render:()=>{renderCount++;},toast:()=>{},request:(base,path)=>{if(path.endsWith('/read'))return Promise.resolve({read:true});calls++;return new Promise((resolve,reject)=>pending.push({resolve,reject}));},esc:s=>String(s??''),icon:()=>'',openView:()=>{},sync:()=>{},openLink:()=>{},shareText:()=>{},openCloudAccount:()=>{}});
 document.querySelector('#fixture').innerHTML=features.alerts();features.afterRender('alerts');window.tick=()=>intervals[0]();window.loaded=true;
 </script>`}));
 await page.goto(f.base+'/dispatch-quiet-test');await page.waitForFunction(()=>window.loaded&&calls===1);await page.evaluate(()=>{for(let i=0;i<8;i++)tick();});assert.equal(await page.evaluate(()=>calls),1);
 const payload={offers:[{id:'sample',business:'Sample shop',description:'Sample parcel',origin:'Zaria',destination:'Zaria',pickupFeeKobo:100000,paymentStatus:'paid'}],notifications:[]};
 await page.evaluate(payload=>pending.shift().resolve(payload),payload);await page.locator('[data-accept-offer=sample]').waitFor();assert.equal(await page.evaluate(()=>renderCount),0);assert.equal(await page.locator('#refresh-offers,#refresh-alerts,#open-offers').count(),0);
 await page.locator('[data-accept-offer=sample]').focus();const retained=await page.locator('[data-accept-offer=sample]').elementHandle();await page.evaluate(()=>{tick();pending.shift().reject(Object.assign(Error('Controlled outage'),{status:503}));});await page.getByText('Connection interrupted. Reconnecting automatically…',{exact:true}).waitFor();assert.equal(await retained.evaluate(e=>e.isConnected&&e===document.activeElement),true);assert.equal(await page.locator('[data-offer=sample]').count(),1);
 await page.evaluate(payload=>{tick();pending.shift().resolve(payload);},payload);await page.waitForFunction(()=>!document.querySelector('.dispatch-status').textContent);assert.equal(await retained.evaluate(e=>e.isConnected&&e===document.activeElement),true);
 // An old account's in-flight result cannot populate the next rider's screen.
 await page.evaluate(()=>{tick();state={...state,riderConnection:{...state.riderConnection,token:'b'.repeat(64)}};pending.shift().resolve({offers:[{id:'wrong-account',business:'Private other shop'}],notifications:[]});});await page.waitForTimeout(100);assert.equal(await page.locator('[data-offer=wrong-account]').count(),0);
 assert.deepEqual(errors,[]);console.log('PASS: automatic dispatch deduplicates overlapping polls, retains offers/focus across outage, recovers quietly and rejects stale account responses. Controlled browser callbacks.');
}finally{await browser.close();await f.close();}

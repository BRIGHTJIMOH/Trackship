import {chromium} from 'playwright-core';
import {pbkdf2Sync} from 'node:crypto';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {adminFixture,vendorProfile} from './admin-fixture.mjs';
import {newTransport} from '../web/lifecycle.mjs';
const f=await adminFixture(),browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
try{
 const auth=await f.account('vendor',vendorProfile),salt='synthetic-home-test',pin={salt,hash:pbkdf2Sync('836492',salt,210000,32,'sha256').toString('hex'),attempts:0,lockedUntil:0};
 const shipments=Array.from({length:8},(_,i)=>({...newTransport({sender:vendorProfile.businessName,recipient:'Sample Customer '+i,phone:'08011112222',description:'Sample parcel '+i,origin:'Zaria',originState:'Kaduna',destination:'Kaduna',destinationState:'Kaduna',address:'Test address',deliveryType:'intrastate',deliveryFee:'1000',service:'Standard'},vendorProfile.businessName),status:i===7?'Delivered':'Rider accepted',synced:true,dirty:false,createdAt:'2026-11-12T10:00:00.000Z'}));
 let change=false,polls=0;
 const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];page.setDefaultTimeout(20000);page.on('pageerror',e=>{errors.push(e.message);console.log('PAGE ERROR:',e.message);});
 await page.route('**/api/v3/shipments/snapshot',route=>{polls++;return route.fulfill({json:{shipments:shipments.filter(s=>s.status!=='Delivered').map(s=>({...s,description:change&&s.id===shipments[0].id?'Updated parcel description':s.description}))}});});
 const record={role:'vendor',profile:auth.profile,pin,connection:{base:f.base,token:auth.token,verified:true},shipments};
 await page.addInitScript(record=>{localStorage.setItem('trackship-v1',JSON.stringify({accounts:{vendor:record.profile,rider:null},deviceAccounts:{['vendor:'+record.profile.phone]:record},lastRole:'vendor',theme:'dark',shipments:record.shipments}));window.testIntervals=[];const original=window.setInterval;window.setInterval=(fn,ms,...args)=>{if(ms===10000)window.testIntervals.push(fn);return original(fn,ms,...args);};},record);
 await page.goto(f.base+'/app',{waitUntil:'domcontentloaded'});console.log('Opened app');await page.locator('#loginPin').fill('836492');await page.getByRole('button',{name:'Log in',exact:true}).click();await page.locator('#home-history').waitFor();console.log('Opened home');await page.waitForTimeout(400);
 assert.equal(await page.locator('main [data-open],main #package-list').count(),0);
 assert.equal(await page.locator('.vehicle-card').count(),4);assert.match(await page.locator('#home-history').innerText(),/8 shipments · 7 active · 1 delivered/);
 assert.equal(await page.evaluate(()=>document.querySelector('.vehicle-grid').compareDocumentPosition(document.querySelector('.home-history'))&Node.DOCUMENT_POSITION_FOLLOWING),4);
 await page.evaluate(()=>scrollTo(0,250));const y=await page.evaluate(()=>scrollY);assert.ok(y>0);
 await page.evaluate(()=>window.historyBeforePoll=document.querySelector('#home-history'));
 const before=polls;await page.evaluate(()=>window.testIntervals.forEach(fn=>fn()));await page.waitForFunction(()=>!document.querySelector('.shipment-history-link')?.disabled);await page.waitForTimeout(350);assert.ok(polls>before);assert.equal(await page.evaluate(()=>window.historyBeforePoll===document.querySelector('#home-history')),true,'unchanged poll should not rebuild the page');assert.ok(Math.abs(await page.evaluate(()=>scrollY)-y)<2,'unchanged poll should preserve homepage scroll');
 change=true;await page.evaluate(()=>window.testIntervals.forEach(fn=>fn()));await page.waitForTimeout(400);assert.ok(Math.abs(await page.evaluate(()=>scrollY)-y)<2,'changed poll should preserve homepage scroll');
 await mkdir('/workspace/work/vendor-home-history',{recursive:true});await page.screenshot({path:'/workspace/work/vendor-home-history/home-mobile.png',fullPage:true});
 console.log('Opening shipment history');await page.locator('#home-history').click();await page.getByRole('heading',{name:'Shipment history',exact:true}).waitFor();assert.equal(await page.locator('#package-list [data-open]').count(),8);assert.equal(await page.evaluate(()=>scrollY),0);
 await page.locator('[data-stat=Completed]').click();assert.equal(await page.locator('#package-list [data-open]').count(),1);await page.locator('[data-stat=All]').click();
 await page.evaluate(()=>scrollTo(0,650));const listY=await page.evaluate(()=>scrollY);change=false;await page.evaluate(()=>window.testIntervals.forEach(fn=>fn()));await page.waitForTimeout(350);assert.ok(Math.abs(await page.evaluate(()=>scrollY)-listY)<2,'history update should preserve scroll');
 await page.locator(`[data-open="${shipments[0].id}"]`).click();await page.getByRole('heading',{name:'Shipment details',exact:true}).waitFor();assert.equal(await page.locator('main').innerText().then(t=>t.includes(vendorProfile.businessName)),true);assert.equal(await page.evaluate(()=>scrollY),0);
 await page.getByRole('button',{name:'Home',exact:true}).click();await page.locator('#home-history').waitFor();assert.equal(await page.evaluate(()=>scrollY),0);
 await page.setViewportSize({width:1366,height:900});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await page.screenshot({path:'/workspace/work/vendor-home-history/home-desktop.png',fullPage:true});
 for(const device of [{width:320,height:640,top:24,bottom:48,left:0,right:0},{width:360,height:800,top:48,bottom:24,left:0,right:0},{width:390,height:844,top:59,bottom:34,left:0,right:0},{width:430,height:932,top:54,bottom:24,left:0,right:0},{width:844,height:390,top:0,bottom:21,left:44,right:0}]){
  await page.setViewportSize({width:device.width,height:device.height});
  await page.evaluate(d=>{document.documentElement.style.setProperty('--safe-top',d.top+'px');document.documentElement.style.setProperty('--safe-bottom',d.bottom+'px');document.documentElement.style.setProperty('--safe-left',d.left+'px');document.documentElement.style.setProperty('--safe-right',d.right+'px');document.querySelector('.home-greeting h1').textContent='Chukwuebuka Abubakar Oladimeji';document.querySelector('.home-greeting h1').style.fontSize='26px';scrollTo(0,0);},device);
  const boxes=await page.evaluate(()=>{const rect=s=>{const r=document.querySelector(s).getBoundingClientRect();return {top:r.top,left:r.left,right:r.right,bottom:r.bottom};};return {header:rect('.topbar'),greeting:rect('.home-greeting'),actions:rect('.top-actions'),nav:rect('.bottomnav'),overflow:document.documentElement.scrollWidth>innerWidth};});
  assert.equal(boxes.overflow,false,JSON.stringify(device));assert.ok(boxes.header.top>=device.top);assert.ok(boxes.greeting.right<=boxes.actions.left);assert.ok(boxes.nav.bottom<=device.height-device.bottom-12);assert.ok(boxes.nav.left>=device.left+12);assert.ok(boxes.nav.right<=device.width-device.right-12);
 }
 assert.deepEqual(errors,[]);console.log('PASS: vehicle cards precede compact shipment history; counts and detail navigation work; unchanged and changed polls preserve mobile scroll; explicit navigation resets scroll; desktop fits; small screens, large names/text, notches, bottom system bars and landscape safe areas fit.');
}finally{await browser.close();await f.close();}

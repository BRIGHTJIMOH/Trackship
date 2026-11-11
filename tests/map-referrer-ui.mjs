import {chromium} from 'playwright-core';
import assert from 'node:assert/strict';
import http from 'node:http';
import {mkdirSync,writeFileSync} from 'node:fs';
import {adminFixture} from './admin-fixture.mjs';
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a5gAAAABJRU5ErkJggg==','base64');
const f=await adminFixture();f.env.PUBLIC_MAPTILER_KEY='test_public_12345';const owner=await f.login();
const b=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
const received=[],results=[];
let expected;
const receiver=http.createServer((req,res)=>{const status=req.headers.referer===expected?200:403;received.push({referer:req.headers.referer??null,origin:req.headers.origin??null,status});res.writeHead(status,{'Content-Type':status===200?'image/png':'text/plain'});res.end(status===200?png:'Origin restriction rejected');});
const source=http.createServer((req,res)=>{res.writeHead(200,{'Content-Type':'text/html','Referrer-Policy':'no-referrer'});res.end('<!doctype html><title>Private map request experiment</title>');});
await Promise.all([new Promise(r=>receiver.listen(0,'127.0.0.1',r)),new Promise(r=>source.listen(0,'127.0.0.1',r))]);
try{
 const origin=`http://127.0.0.1:${source.address().port}`;expected=origin+'/';const tile=`http://127.0.0.1:${receiver.address().port}/tile.png`;
 const p=await b.newPage();await p.goto(origin+'/t/SYNTHETIC_PRIVATE_TOKEN?private=SYNTHETIC_SECRET');
 for(const policy of [null,'strict-origin-when-cross-origin']){
  const loaded=await p.evaluate(({tile,policy})=>new Promise(resolve=>{const img=new Image();if(policy)img.referrerPolicy=policy;img.onload=()=>resolve(true);img.onerror=()=>resolve(false);img.src=tile+'?case='+String(policy);document.body.append(img)}),{tile,policy});
  assert.equal(loaded,!!policy);
 }
 assert.deepEqual(received,[{referer:null,origin:null,status:403},{referer:expected,origin:null,status:200}]);await p.close();
 const context=await b.newContext({viewport:{width:1366,height:768}});await context.addCookies([{name:'sendrack_owner',value:owner.cookie.split('=')[1],url:f.base}]);
 let reject=false;const requests=[];
 for(const host of ['https://api.maptiler.com/**','https://tile.openstreetmap.org/**'])await context.route(host,async r=>{const req=r.request(),h=await req.allHeaders(),osm=req.url().includes('tile.openstreetmap.org'),json=req.url().includes('/tiles.json'),denied=reject&&!osm;assert.equal(h.referer,f.base+'/');assert.equal(h.origin,osm?undefined:f.base);assert.equal(h.referer.includes('SYNTHETIC'),false);requests.push({referer:h.referer,origin:h.origin??null,status:denied?403:200});await r.fulfill({headers:{'Access-Control-Allow-Origin':f.base},status:denied?403:200,contentType:denied?'text/plain':json?'application/json':'image/png',body:denied?'Origin restriction rejected':json?JSON.stringify({tilejson:'2.0.0',tiles:['https://api.maptiler.com/sample.png']}):png})});
 const app=await context.newPage();const response=await app.goto(f.base+'/app');assert.equal(response.headers()['referrer-policy'],'no-referrer');await app.waitForFunction(()=>!!window.L);
 await app.evaluate(async()=>{history.replaceState(null,'','/t/SYNTHETIC_PRIVATE_TOKEN?private=SYNTHETIC_SECRET#SYNTHETIC_FRAGMENT');const {createFeatures}=await import('/features.mjs');const features=createFeatures({getData:()=>({connection:{base:location.origin}}),esc:String,request:async(base,path)=>(await fetch(base+path)).json()});const section=document.createElement('section');section.innerHTML=features.mapView({status:'Created'});document.body.append(section);document.querySelector('#live-map').style.cssText='width:400px;height:300px';await features.mountMap();});
 await app.waitForFunction(()=>[...document.querySelectorAll('#live-map .leaflet-tile')].some(i=>i.complete&&i.naturalWidth>0));assert.equal(await app.locator('#live-map .leaflet-tile').first().getAttribute('referrerpolicy'),'strict-origin-when-cross-origin');results.push({layer:'customer/app',tileRequests:requests.length,headers:requests[0]});
 reject=true;const admin=await context.newPage();await admin.goto(f.base+'/admin?private=SYNTHETIC_SECRET');await admin.locator('.map-tiles-status[data-state=ready][data-degraded=true]').waitFor();assert.match(await admin.locator('.map-tiles-status').innerText(),/HTTP 403/);assert.match(await admin.locator('.map-connection').innerText(),/^Connected/);assert.equal(await admin.locator('.operations-map .leaflet-tile').first().getAttribute('referrerpolicy'),'strict-origin-when-cross-origin');
 await admin.getByRole('button',{name:'Reconnect / refresh'}).click();await admin.locator('.map-tiles-status[data-state=ready][data-degraded=true]').waitFor();results.push({layer:'admin operations',authorizationFailureSeparateFromConnectedFeed:true,basicMapFallback:true});
 reject=false;await admin.getByRole('button',{name:'Reconnect / refresh'}).click();await admin.locator('.map-tiles-status[data-state=ready][data-provider=maptiler]').waitFor();results.push({layer:'admin operations',recoveredOnExplicitRetry:true,headers:requests.at(-1)});
 mkdirSync('docs/map-referrer',{recursive:true});await admin.screenshot({path:'docs/map-referrer/admin-controlled-tiles.png',fullPage:true});writeFileSync('docs/map-referrer/browser-evidence.json',JSON.stringify({notice:'Controlled local receiver and intercepted provider responses; NOT live MapTiler verification',wireExperiment:received,layers:results},null,2)+'\n');
 console.log('PASS: real cross-origin receiver: no-referrer => neither Referer nor Origin/403; per-image origin-only policy => origin Referer, no private path/200 PNG. Both actual Leaflet layers use the option. Controlled admin 403 uses an explicit basic-map state and recovers on retry. Live provider not tested.');
}finally{await b.close();await f.close();await Promise.all([new Promise(r=>source.close(r)),new Promise(r=>receiver.close(r))]);}

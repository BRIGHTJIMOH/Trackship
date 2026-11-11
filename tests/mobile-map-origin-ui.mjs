// Executes the actual app modules at the unchanged APK virtual origin. Controlled
// provider responses validate client behaviour; this is not a live MapTiler test.
import {chromium} from 'playwright-core';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const origin='https://appassets.trackship.ng',backend='https://sendrack-api.onrender.com';
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a5gAAAABJRU5ErkJggg==','base64'),requests=[];let reject=false,provider='maptiler',capsCalls=0;
try{
 const context=await browser.newContext({viewport:{width:390,height:844}}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await context.route(origin+'/**',async route=>{
  const path=new URL(route.request().url()).pathname;
  if(path==='/')return route.fulfill({contentType:'text/html',headers:{'Referrer-Policy':'no-referrer'},body:`<link rel="stylesheet" href="/assets/leaflet.css"><link rel="stylesheet" href="/style.css"><script src="/assets/leaflet.js"></script><main id="fixture"></main><script type="module">
import {createFeatures} from '/features.mjs';
window.state={activeRole:'vendor',accounts:{vendor:{businessName:'Sample offline account'}},connection:null};
window.shipment={id:'sample-local-only',code:'SAMPLE',status:'Created',custodian:'vendor',location:null};
window.features=createFeatures({getData:()=>state,getView:()=> 'track',getCurrent:()=>shipment,request:async(base,path,options)=>{const r=await fetch(base+path,options);if(!r.ok)throw Error('Config unavailable');return r.json();},esc:s=>String(s??''),icon:()=>'',render:()=>{},commit:()=>{},toast:()=>{},openView:()=>{},sync:()=>{},openLink:()=>{},shareText:()=>{}});
fixture.innerHTML=features.mapView(shipment);await features.mountMap();window.mounted=true;
</script>`});
  if(path.startsWith('/api/'))throw Error('Configuration incorrectly requested from APK assets');
  const file='web'+path;const contentType=path.endsWith('.css')?'text/css':path.endsWith('.mjs')||path.endsWith('.js')?'text/javascript':'application/octet-stream';
  return route.fulfill({contentType,body:path==='/assets/leaflet.js'?(await readFile(file,'utf8'))+'\n;const mapFactory=L.map;L.map=(...args)=>{window.testMap=mapFactory(...args);return testMap};':await readFile(file)});
 });
 await context.route(backend+'/api/capabilities',async route=>{capsCalls++;return route.fulfill({contentType:'application/json',headers:{'Access-Control-Allow-Origin':origin},body:JSON.stringify({maps:provider==='maptiler'?{provider,tileUrl:'https://api.maptiler.com/maps/streets-v2/{z}/{x}/{y}.png?key=synthetic_public_key'}:{provider:'openstreetmap-pilot',tileUrl:'https://tile.openstreetmap.org/{z}/{x}/{y}.png'}})});});
 for(const host of ['https://api.maptiler.com/**','https://tile.openstreetmap.org/**'])await context.route(host,async route=>{const h=await route.request().allHeaders();assert.equal(h.referer,origin+'/');assert.equal(h.origin,undefined);requests.push({provider,referer:h.referer,status:reject?403:200});return route.fulfill({status:reject?403:200,contentType:reject?'text/plain':'image/png',body:reject?'Controlled rejection':png});});
 await page.goto(origin);await page.locator('#map-provider-status[data-state=ready]').waitFor();assert.ok(capsCalls>0);
 await page.evaluate(()=>{testMap.setView([8,7],9,{animate:false});document.querySelector('#live-map').style.width='280px';});await page.waitForFunction(()=>testMap.getSize().x===280);let before=await page.evaluate(()=>({center:testMap.getCenter(),zoom:testMap.getZoom()}));
 reject=true;await page.locator('#refresh-map-provider').click();await page.evaluate(()=>testMap.setZoom(10,{animate:false}));before=await page.evaluate(()=>({center:testMap.getCenter(),zoom:testMap.getZoom()}));await page.locator('#map-provider-status[data-state=error]').waitFor();assert.match(await page.locator('#map-provider-status').innerText(),/appassets\.trackship\.ng/);
 reject=false;provider='osm';await page.locator('#refresh-map-provider').click();await page.locator('#map-provider-status[data-state=ready]').waitFor();assert.match(await page.locator('#map-provider-status').innerText(),/OpenStreetMap/);
 assert.deepEqual(await page.evaluate(()=>({center:testMap.getCenter(),zoom:testMap.getZoom()})),before);assert.equal(await page.locator('img.leaflet-tile').evaluateAll(images=>images.every(i=>i.complete&&i.naturalWidth>0)),true);
 await page.locator('.viewer-shipment').click();assert.match(await page.locator('.viewer-location-status').innerText(),/No fresh shipment/);assert.equal(await page.locator('.viewer-location-dot').count(),0);
 assert.deepEqual(errors,[]);await mkdir('docs/mobile-profile-map',{recursive:true});await writeFile('docs/mobile-profile-map/native-origin-evidence.json',JSON.stringify({notice:'Controlled HTTP tile responses; Chromium virtual-origin test, not Android OS or live provider verification.',capabilitiesBackend:backend,capabilitiesRequests:capsCalls,requests},null,2)+'\n');
 console.log('PASS: offline APK-origin map loads capabilities from configured Render origin, origin-only tile Referer, explicit restricted-key error, removal-to-OSM retry, resize and no substituted rider GPS. Controlled provider only.');
}finally{await browser.close();}

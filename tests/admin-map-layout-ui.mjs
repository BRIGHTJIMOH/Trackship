import {chromium} from 'playwright-core';
import assert from 'node:assert/strict';
import {adminFixture} from './admin-fixture.mjs';
import {mkdirSync} from 'node:fs';
import path from 'node:path';
const output=process.env.SENDRACK_UI_OUTPUT_DIR||'/tmp/sendrack-admin-map-layout';mkdirSync(output,{recursive:true});
const f=await adminFixture();let browser;
try{
 const owner=await f.login();
 browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
 const context=await browser.newContext();
 await context.addCookies([{name:'sendrack_owner',value:owner.cookie.split('=')[1],url:f.base}]);
 await context.route('https://tile.openstreetmap.org/**',r=>r.fulfill({contentType:'image/png',body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a5gAAAABJRU5ErkJggg==','base64')}));
 const page=await context.newPage();await page.goto(f.base+'/admin');await page.locator('.operations-map.leaflet-container').waitFor();
 for(const width of [1440,1920,768,390]){
  await page.setViewportSize({width,height:900});await page.waitForTimeout(250);
  const m=await page.evaluate(()=>{const map=document.querySelector('.operations-map').getBoundingClientRect(),layout=document.querySelector('.operations-layout').getBoundingClientRect(),panel=document.querySelector('#live-operations').getBoundingClientRect(),kpi=document.querySelector('.kpis').getBoundingClientRect();return {width:map.width,layout:layout.width,height:map.height,first:panel.top<kpi.top,overflow:document.documentElement.scrollWidth>innerWidth}});
  assert(m.first);assert(m.width>=m.layout*.98);assert(m.height>=(width<=700?360:480));assert(!m.overflow);console.log('PASS map-first full-width layout',width,m);
 }
 await page.screenshot({path:path.join(output,'admin-map-mobile.png'),fullPage:true});
 await page.setViewportSize({width:1440,height:1000});await page.waitForTimeout(250);await page.screenshot({path:path.join(output,'admin-map-desktop.png'),fullPage:true});
}finally{await browser?.close();await f.close();}

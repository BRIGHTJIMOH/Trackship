import {chromium} from 'playwright-core';
import assert from 'node:assert/strict';
import {adminFixture} from './admin-fixture.mjs';
const f=await adminFixture();
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox','--enable-unsafe-swiftshader']});
try{
 for(const width of [390,1366]){
  const p=await browser.newPage({viewport:{width,height:1000},reducedMotion:'reduce'}),errors=[];
  p.on('pageerror',error=>errors.push(error.message));
  const requests=[];p.on('request',request=>requests.push(request.url()));
  await p.goto(f.base);await p.waitForFunction(()=>document.querySelector('.parcel-world').dataset.scene==='ready',null,{timeout:60000});
  assert.equal(await p.locator('.parcel-canvas').first().evaluate(n=>n.width>0&&n.height>0),true);
  assert.equal(await p.locator('.realistic-parcel-poster').evaluate(n=>n.complete&&n.naturalWidth>0),true);
  assert.equal(await p.locator('.parcel-float').evaluate(n=>getComputedStyle(n).visibility),'hidden');
  assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  assert.equal(await p.locator('.motion-toggle').isDisabled(),true);
  await p.locator('#journey').scrollIntoViewIfNeeded();
  await p.waitForFunction(()=>document.querySelector('.journey-stage').dataset.scene==='ready',null,{timeout:60000});
  assert.equal(await p.locator('.route-building').first().evaluate(n=>getComputedStyle(n).visibility),'hidden');
  assert.equal(await p.locator('a[href="/app"]').count(),0);
  await p.getByRole('button',{name:'I’m a rider'}).click();assert.equal(await p.locator('#role').inputValue(),'rider');
  await p.emulateMedia({reducedMotion:'no-preference'});await p.evaluate(()=>scrollTo({top:0,behavior:'instant'}));
  await p.getByRole('button',{name:'Pause animation',exact:true}).click();assert.equal(await p.locator('body').getAttribute('data-motion'),'false');
  // Losing GPU access must reveal the real poster while keeping the form usable.
  await p.locator('.parcel-world canvas').evaluate(c=>c.getContext('webgl2').getExtension('WEBGL_lose_context').loseContext());
  await p.waitForFunction(()=>document.querySelector('.parcel-world').dataset.scene==='fallback');
  assert.equal(await p.locator('.parcel-float').evaluate(n=>getComputedStyle(n).visibility),'visible');
  await p.getByLabel('Your name',{exact:true}).fill('3D Preview');await p.getByLabel('Your city',{exact:true}).fill('Zaria');await p.getByLabel('Email address',{exact:true}).fill('realistic-'+width+'@example.com');await p.locator('[name=consent]').check();await p.getByRole('button',{name:'Join the waitlist',exact:true}).click();await p.getByRole('status').filter({hasText:'You’re on the list'}).waitFor();
  assert.ok(requests.every(url=>url.startsWith(f.base)),'3D assets must be self-hosted');assert.deepEqual(errors,[]);await p.close();console.log(width+': real WebGL hero/journey, mobile layout, reduced motion, pause, GPU-loss fallback and real waitlist passed');
 }
 const p=await browser.newPage();await p.addInitScript(()=>{const original=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type,...args){return type.startsWith('webgl')?null:original.call(this,type,...args);};});await p.goto(f.base);await p.locator('.realistic-parcel-poster').evaluate(image=>image.decode());assert.equal(await p.locator('.parcel-float').evaluate(n=>getComputedStyle(n).visibility),'visible');assert.equal(await p.locator('.parcel-canvas').count(),0);await p.getByRole('button',{name:'I’m a rider'}).click();assert.equal(await p.locator('#role').inputValue(),'rider');await p.close();console.log('No-WebGL fallback keeps the parcel and workspace selector usable');
}finally{await browser.close();await f.close();}

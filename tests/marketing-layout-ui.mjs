import {chromium} from 'playwright-core';import assert from 'node:assert/strict';import {mkdirSync} from 'node:fs';import {adminFixture} from './admin-fixture.mjs';
const f=await adminFixture(),browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});mkdirSync('docs/screenshots/layout-fix',{recursive:true});
try{
 for(const [width,height] of [[1366,768],[1920,1080],[1093,768],[900,768],[801,768],[768,1024],[430,932],[390,844],[360,800],[320,700]]){
  const p=await browser.newPage({viewport:{width,height},reducedMotion:'no-preference'}),errors=[];p.on('pageerror',e=>errors.push(e.message));await p.goto(f.base+'/');await p.evaluate(()=>document.fonts.ready);await p.locator('#product').scrollIntoViewIfNeeded();await p.waitForFunction(()=>[...document.querySelectorAll('.product-screen')].every(n=>n.complete&&n.naturalWidth>0));
  assert.equal(await p.locator('.scene').evaluate(n=>getComputedStyle(n).overflow),'visible');
  for(const fraction of [0,.125,.25,.375,.5,.625,.75,.875,1]){
   const result=await p.evaluate(fraction=>{for(const a of document.getAnimations()){a.pause();a.currentTime=fraction*5500;}const scene=document.querySelector('.scene').getBoundingClientRect();return {width:innerWidth,scroll:document.documentElement.scrollWidth,outside:[...document.querySelectorAll('body *')].filter(n=>{const r=n.getBoundingClientRect();return r.width&&(r.left<-.5||r.right>innerWidth+.5);}).map(n=>n.className||n.tagName),clipped:[...document.querySelectorAll('.face,.orbit')].filter(n=>{const r=n.getBoundingClientRect();return r.left<scene.left-.5||r.right>scene.right+.5||r.top<scene.top-.5||r.bottom>scene.bottom+.5;}).map(n=>n.className)};},fraction);
   assert.equal(result.scroll,width,JSON.stringify({width,fraction,result}));assert.deepEqual(result.outside,[],JSON.stringify({width,fraction,result}));assert.deepEqual(result.clipped,[],JSON.stringify({width,fraction,result}));
  }
  const center=await p.locator('.hero').evaluate(n=>{const s=getComputedStyle(n);return [parseFloat(s.paddingLeft),parseFloat(s.paddingRight)];});assert.ok(Math.abs(center[0]-center[1])<1,'balanced content gutters');
  await p.emulateMedia({reducedMotion:'reduce'});assert.equal(await p.locator('.parcel-float').evaluate(n=>getComputedStyle(n).animationName),'none');await p.evaluate(()=>scrollTo(0,0));
  if(width===1366)await p.locator('#product').screenshot({path:'docs/screenshots/layout-fix/product-previews.png'});
  if([1366,1920,390,360].includes(width)){await p.screenshot({path:`docs/screenshots/layout-fix/${width}x${height}.png`,fullPage:true});await p.screenshot({path:`docs/screenshots/layout-fix/${width}x${height}-viewport.png`});}
  assert.equal(await p.locator('.sample-label').count(),2);assert.deepEqual(errors,[]);await p.close();console.log(width+'x'+height+': centered, no overflow/clipped 3D faces across 9 phases, sample previews loaded, reduced motion passed');
 }
 for(const [path,marker] of [['/','Good things'],['/app','id="app"'],['/admin','Owner console']]){const r=await fetch(f.base+path);assert.equal(r.status,200);assert.ok((await r.text()).includes(marker));}
 for(const file of ['product-vendor.jpg','product-rider.jpg']){const r=await fetch(f.base+'/assets/'+file);assert.equal(r.status,200);assert.match(r.headers.get('content-type'),/^image\/jpeg/);}
}finally{await browser.close();await f.close();}

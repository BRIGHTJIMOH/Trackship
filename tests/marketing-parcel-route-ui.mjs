import {chromium} from 'playwright-core';
import assert from 'node:assert/strict';
import {adminFixture} from './admin-fixture.mjs';
const fixture=await adminFixture();
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
try{
 for(const width of [390,1366]){
  const page=await browser.newPage({viewport:{width,height:900},reducedMotion:'no-preference'});
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto(fixture.base);
  await page.addStyleTag({content:'html{scroll-behavior:auto!important}'});
  assert.equal(await page.locator('.route-van').count(),0);
  for(const progress of [0,.25,.5,.75,1,0]){
   await page.evaluate(progress=>{const steps=document.querySelector('.story-steps').getBoundingClientRect();scrollTo(0,scrollY+steps.top-innerHeight*.75+progress*steps.height*.85);},progress);
   await page.waitForFunction(progress=>Math.abs(Number(document.querySelector('.journey-stage').style.getPropertyValue('--progress'))-progress)<.004,progress);
   const position=await page.evaluate(()=>{const stage=document.querySelector('.journey-stage'),path=stage.querySelector('.route-track'),parcel=stage.querySelector('.route-parcel'),progress=Number(stage.style.getPropertyValue('--progress')),point=path.getPointAtLength(path.getTotalLength()*progress),matrix=parcel.transform.baseVal.consolidate().matrix;return {error:Math.hypot(matrix.e-point.x,matrix.f-point.y),overflow:document.documentElement.scrollWidth>innerWidth};});
   assert.ok(position.error<.1,'Parcel must stay at the route’s drawn endpoint');assert.equal(position.overflow,false);
  }
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.waitForFunction(()=>document.querySelector('.journey-stage').style.getPropertyValue('--progress')==='1');
  const end=await page.locator('.route-parcel').evaluate(n=>{const m=n.transform.baseVal.consolidate().matrix;return [m.e,m.f];});
  assert.deepEqual(end,[460,120]);assert.deepEqual(errors,[]);
  await page.close();console.log(width+': parcel follows route bends and endpoints in both directions; reduced motion shows destination');
 }
}finally{await browser.close();await fixture.close();}

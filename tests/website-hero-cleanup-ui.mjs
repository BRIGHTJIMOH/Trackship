import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
import {mkdir} from 'node:fs/promises';
import {adminFixture} from './admin-fixture.mjs';
const f=await adminFixture();let browser;
try{
 browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});await mkdir('artifacts/website-hero-cleanup',{recursive:true});
 for(const width of [320,390,768,1440]){
  const page=await browser.newPage({viewport:{width,height:900},reducedMotion:'reduce'});const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(f.base+'/');await page.evaluate(()=>document.fonts.ready);await page.locator('.scooter-art').evaluate(i=>i.decode());
  assert.equal(await page.locator('.stage-disc,.stage-plinth,.stage-word,.stage-detail,.launch-strip').count(),0);
  const layout=await page.evaluate(()=>{const rect=s=>document.querySelector(s).getBoundingClientRect();return {overflow:document.documentElement.scrollWidth>innerWidth,art:rect('.scooter-art').toJSON(),caption:rect('.stage-caption').toJSON(),hero:rect('.launch-hero').toJSON(),vision:rect('.vision-section').toJSON()}});assert.equal(layout.overflow,false,'overflow at '+width);assert.ok(layout.caption.top>=layout.hero.top&&layout.caption.bottom<=layout.hero.bottom+1,'motion control stays within hero at '+width);assert.ok(layout.vision.top>=layout.hero.bottom-1,'sections overlap at '+width);assert.ok(layout.art.width>200,'bike remains visible');
  assert.equal(await page.locator('#vision-heading').evaluate(e=>getComputedStyle(e).opacity),'1');assert.equal(await page.locator('#vendor-card').evaluate(e=>getComputedStyle(e).opacity),'1');
  const colors=await page.locator('#vendor-card').evaluate(el=>({background:getComputedStyle(el).backgroundColor,text:getComputedStyle(el.querySelector('h3')).color}));assert.equal(colors.text,'rgb(0, 33, 71)');assert.notEqual(colors.background,colors.text);
  await page.getByRole('link',{name:'Join as a rider or driver',exact:true}).click();assert.equal(await page.locator('#signup-role').inputValue(),'rider');await page.getByRole('link',{name:'Join as a vendor',exact:true}).click();assert.equal(await page.locator('#signup-role').inputValue(),'vendor');
  await page.evaluate(()=>scrollTo({top:0,behavior:'instant'}));await page.screenshot({path:`artifacts/website-hero-cleanup/hero-${width}.png`});if(width===1440)await page.screenshot({path:'artifacts/website-hero-cleanup/full-desktop.png',fullPage:true});assert.deepEqual(errors,[]);await page.close();
 }
 const noScript=await browser.newPage({javaScriptEnabled:false,viewport:{width:390,height:844}});await noScript.goto(f.base+'/');assert.equal(await noScript.locator('#vision-heading').evaluate(e=>getComputedStyle(e).opacity),'1');await noScript.close();console.log('PASS: clean bike hero, no blue strip/circles, readable sections, no overlap/overflow at 320–1440px, and waitlist role links.');
}finally{await browser?.close();await f.close();}

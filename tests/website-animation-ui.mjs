import {chromium} from 'playwright-core';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {adminFixture} from './admin-fixture.mjs';
const f=await adminFixture(),browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
try{
 const page=await browser.newPage({viewport:{width:1366,height:1000},reducedMotion:'no-preference'}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(f.base);await page.locator('.scooter-art').evaluate(image=>image.decode());await page.waitForFunction(()=>document.body.classList.contains('motion-ready'));
 await page.evaluate(()=>scrollTo({top:280,behavior:'instant'}));assert.equal(await page.locator('.stage-disc,.stage-plinth,.stage-word,.launch-strip').count(),0);
 const nav=await page.locator('.masthead').boundingBox();assert.ok(nav.y>=15&&nav.y<=18,'navigation stays in view while scrolling');
 await page.getByRole('button',{name:'Pause visual motion'}).click();assert.equal(await page.locator('.product-stage').evaluate(el=>el.style.getPropertyValue('--art-x')),'');
 await page.getByRole('button',{name:'Enable visual motion'}).click();
 await page.locator('#vendor-card').scrollIntoViewIfNeeded();assert.equal(await page.locator('#vendor-card').evaluate(el=>getComputedStyle(el).opacity),'1');
 await page.emulateMedia({reducedMotion:'reduce'});await page.waitForFunction(()=>document.querySelector('.motion-control').disabled);assert.equal(await page.locator('.motion-control').isDisabled(),true);
 assert.equal(await page.locator('#launch-signup').evaluate(el=>getComputedStyle(el).opacity),'1');
 await page.locator('#signup-name').focus();assert.equal(await page.locator('#signup-name').evaluate(el=>document.activeElement===el),true);
 await page.evaluate(()=>scrollTo({top:0,behavior:'instant'}));await mkdir('artifacts/website-layered',{recursive:true});await page.screenshot({path:'artifacts/website-layered/desktop.png',fullPage:true});
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:'artifacts/website-layered/mobile.png',fullPage:true});
 assert.deepEqual(errors,[]);console.log('PASS: uncluttered hero, sticky navigation, motion pause, immediately visible sections, reduced motion and keyboard form access.');
}finally{await browser.close();await f.close();}

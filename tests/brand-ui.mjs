import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
import {adminFixture} from './admin-fixture.mjs';
import {mkdir} from 'node:fs/promises';
const f=await adminFixture();let browser;
try{
 browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});await mkdir('artifacts/brand',{recursive:true});const errors=[];
 const page=await browser.newPage({viewport:{width:1440,height:1000},reducedMotion:'reduce'});page.on('pageerror',e=>errors.push(e.message));
 await page.goto(f.base+'/');await page.locator('.brand-wordmark').first().waitFor();await page.screenshot({path:'artifacts/brand/website-desktop.png',fullPage:true});
 assert.equal(await page.locator('.brand-wordmark').first().evaluate(im=>im.complete&&im.naturalWidth>0&&im.getBoundingClientRect().width>=155),true);assert.equal(await page.locator('.launch-hero').evaluate(el=>getComputedStyle(el).backgroundImage),'none');
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:'artifacts/brand/website-mobile.png',fullPage:true});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 await page.goto(f.base+'/app');await page.screenshot({path:'artifacts/brand/mobile-splash.png'});await page.locator('#cloud-login').waitFor();await page.screenshot({path:'artifacts/brand/mobile-login.png'});assert.equal(await page.locator('.brand-wordmark').evaluate(im=>im.complete&&im.naturalWidth>0),true);
 await page.evaluate(()=>document.documentElement.dataset.theme='dark');assert.match(await page.locator('.brand-wordmark').evaluate(el=>getComputedStyle(el).content),/wordmark-white/);assert.equal(await page.locator('.onboard').evaluate(el=>getComputedStyle(el).backgroundImage),'none');await page.screenshot({path:'artifacts/brand/mobile-dark.png'});
 await page.setViewportSize({width:1440,height:1000});await page.goto(f.base+'/admin');await page.locator('#owner-login').waitFor();await page.screenshot({path:'artifacts/brand/admin-login.png'});
 await f.login().then(async session=>{await page.context().addCookies([{name:session.cookie.split('=')[0],value:session.cookie.split('=')[1],url:f.base}]);});await page.reload();await page.locator('.sidebar').waitFor();assert.equal(await page.locator('.sidebar .brand-symbol').isVisible(),true);assert.equal(await page.locator('.sidebar').evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(0, 33, 71)');await page.screenshot({path:'artifacts/brand/admin-desktop.png',fullPage:true});
 const manifest=await(await fetch(f.base+'/admin/manifest.webmanifest')).json();assert.equal(manifest.theme_color,'#002147');assert.deepEqual(errors,[]);
 console.log('PASS: branded website/app/admin, compact sidebar icon, solid light/dark backgrounds, responsive layout and manifest.');
}finally{await browser?.close();await f.close();}

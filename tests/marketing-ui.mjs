import {chromium} from 'playwright-core';
import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {adminFixture,OWNER_PASSWORD} from './admin-fixture.mjs';
const f=await adminFixture(),browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});mkdirSync('docs/screenshots/public-website',{recursive:true});
try{
 for(const [name,width,height] of [['desktop',1440,950],['iphone',390,844],['android',360,800]]){
 const page=await browser.newPage({viewport:{width,height},isMobile:width<500,hasTouch:width<500,reducedMotion:'reduce'}),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(f.base+'/');await page.evaluate(()=>document.fonts.ready);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 assert.equal(await page.locator('.parcel-float').evaluate(n=>getComputedStyle(n).animationName),'none');await page.screenshot({path:`docs/screenshots/public-website/${name}.png`,fullPage:true});
 await page.getByLabel('Your name').fill('Website Preview');await page.getByLabel('Email address').fill(`preview-${name}@example.com`);await page.getByLabel('Your city').fill('Abuja');await page.getByLabel('I’m joining as a').selectOption(name==='android'?'rider':'vendor');await page.locator('[name=consent]').check();await page.getByRole('button',{name:'Join the waitlist'}).click();await page.getByRole('status').filter({hasText:'You’re on the list'}).waitFor();
 await page.evaluate(()=>localStorage.setItem('website-navigation-check','retain-existing-data'));await page.getByRole('link',{name:'Open the app',exact:false}).first().click();await page.locator('#access-signup').waitFor();assert.equal(new URL(page.url()).pathname,'/app');assert.equal(await page.evaluate(()=>localStorage.getItem('website-navigation-check')),'retain-existing-data');if(name==='iphone')await page.screenshot({path:'docs/screenshots/public-website/app.png',fullPage:true});
 await page.getByRole('link',{name:'About SendRack'}).click();await page.getByRole('heading',{name:'Good things. On their way.'}).waitFor();assert.deepEqual(errors,[]);await page.close();
 }
 const page=await browser.newPage({viewport:{width:1440,height:950}});await page.goto(f.base+'/admin');await page.getByLabel('Password',{exact:true}).fill(OWNER_PASSWORD);await page.getByRole('button',{name:'Log in',exact:true}).click();await page.getByRole('button',{name:'Waitlist',exact:true}).click();await page.getByText('preview-android@example.com',{exact:true}).waitFor();assert.equal(await page.locator('#view-records tbody tr').count(),3);await page.screenshot({path:'docs/screenshots/public-website/owner-waitlist.png',fullPage:true});
 await page.goto(f.base+'/payment-return?reference=unchanged');await page.getByRole('heading',{name:'Return to SendRack.'}).waitFor();assert.equal(await page.getByRole('link',{name:'Open SendRack'}).getAttribute('href'),'/app');
 const animated=await browser.newPage({reducedMotion:'no-preference'});await animated.goto(f.base+'/');assert.equal(await animated.locator('.parcel-float').evaluate(n=>getComputedStyle(n).animationName),'float');await animated.close();
 console.log('Website UI passed: desktop/iPhone-size/Android-size layouts, root/app navigation and retained storage, owner-visible waitlist, reduced motion, animated scene and payment return. Screenshots saved.');
}finally{await browser.close();await f.close();}

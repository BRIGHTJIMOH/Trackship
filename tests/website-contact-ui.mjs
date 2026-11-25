import {chromium} from 'playwright-core';
import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {adminFixture} from './admin-fixture.mjs';
const f=await adminFixture();const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
try{
 const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 for(const width of [390,768,1440]){
  await page.setViewportSize({width,height:1000});await page.goto(f.base+'/');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'No overflow at '+width);
  assert.equal(await page.getByLabel('WhatsApp number',{exact:true}).getAttribute('required'),'');
  await page.locator('.purpose-section article').filter({hasText:'OUR MISSION'}).waitFor();
  await page.locator('#enterprise-heading').waitFor();
  assert.match(await page.locator('.rider-card').innerText(),/private car/);
 }
 await page.getByLabel('Your name',{exact:true}).fill('Website Contact Test');await page.getByLabel('Your city',{exact:true}).fill('Zaria');await page.getByLabel('Email address',{exact:true}).fill('website-contact@example.test');
 await page.getByLabel('WhatsApp number',{exact:true}).fill('+234 801 234 5678');
 await page.locator('#signup-role').selectOption('rider');
 assert.equal(await page.locator('#launch-signup').evaluate(f=>f.checkValidity()),false);
 await page.locator('[name=whatsappConsent]').check();await page.locator('[name=consent]').check();
 await page.getByRole('button',{name:'Join waitlist',exact:true}).click();
 await page.getByRole('status').filter({hasText:'email and WhatsApp'}).waitFor();
 const owner=await f.login();const result=await(await f.api('/api/admin/waitlist',undefined,owner)).json();assert.equal(result.entries[0].whatsapp,'08012345678');assert.equal(result.entries[0].role,'rider');assert.equal(result.entries[0].whatsapp_consent,1);
 mkdirSync('artifacts/website-contact',{recursive:true});await page.screenshot({path:'artifacts/website-contact/desktop.png',fullPage:true});
 await page.setViewportSize({width:390,height:844});await page.goto(f.base+'/');await page.locator('.hero-words').evaluate(el=>Promise.all([...el.children].flatMap(child=>child.getAnimations()).map(a=>a.finished)));await page.screenshot({path:'artifacts/website-contact/mobile.png',fullPage:true});
 assert.deepEqual(errors,[]);console.log('PASS: responsive purpose sections, required contact/role/consent, live local form submission and private admin data.');
}finally{await browser.close();await f.close();}

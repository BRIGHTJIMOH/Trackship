import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {chromium} from 'playwright-core';
import {controlFixture,owner} from './control-fixture.mjs';
import {testDatabase} from '../database-fixture.mjs';
import {createApp} from '../../server/server.mjs';
const cleanup=[],t={after:fn=>cleanup.push(fn)};
const f=await controlFixture(t),database=await testDatabase();
if(!database.env.DATABASE_URL)throw Error('Set both disposable PostgreSQL test URLs.');
const server=await createApp({env:{...database.env,NODE_ENV:'test',ADMIN_USERNAME:'synthetic-owner',ADMIN_PASSWORD:'Synthetic UI Test Password!'},walletControl:{admin:f.admin,auth:f.auth,withdrawals:f.withdrawals}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+server.address().port;
let browser;
try{
 const vendor=await f.wallet('vendor',150000);await f.holds.reserve({shipmentId:'SAMPLE-DELIVERY-001',vendorWalletId:vendor.id,deliveryType:'intrastate',totalKobo:15000,fees:{pickup:14000},platformKobo:1000});
 await f.policy();await f.auth.createStaff(owner,{username:'finance-preview',password:'Synthetic Preview Password!',role:'Admin',reason:'Synthetic browser-test staff only'});
 browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
 const context=await browser.newContext({viewport:{width:1366,height:768},deviceScaleFactor:1});const page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base+'/admin/wallet');await page.locator('#login').waitFor();await page.locator('[name=username]').fill('finance-preview');await page.locator('[name=password]').fill('Synthetic Preview Password!');await page.locator('#login button').click();await page.locator('#summary .metric').first().waitFor();
 await mkdir('docs/wallet-control/previews',{recursive:true});
 await page.screenshot({path:'docs/wallet-control/previews/finance-desktop-1366.png',fullPage:true});
 await page.setViewportSize({width:1920,height:1080});await page.screenshot({path:'docs/wallet-control/previews/finance-desktop-1920.png',fullPage:true});
 for(const width of [1366,1920,390]){await page.setViewportSize({width,height:width===390?844:1080});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'overflow '+width);}
 await page.screenshot({path:'docs/wallet-control/previews/finance-mobile.png',fullPage:true});
 await page.locator('[data-view=settings]').click();await page.locator('#policy').waitFor();await page.locator('#policy [name=reason]').fill('Unsaved bank policy draft');await page.locator('#policy [name=threshold]').focus();const scroll=await page.evaluate(()=>scrollY);await page.waitForTimeout(16000);
 assert.equal(await page.locator('#policy [name=reason]').inputValue(),'Unsaved bank policy draft');assert.equal(await page.evaluate(()=>scrollY),scroll);assert.equal(await page.locator('#policy [name=threshold]').evaluate(el=>document.activeElement===el),true);
 await page.route('**/api/wallet/admin/settings',r=>r.abort());await page.locator('#refresh').click();await page.locator('#connection.error').waitFor();assert.equal(await page.locator('#policy [name=reason]').inputValue(),'Unsaved bank policy draft');await page.unroute('**/api/wallet/admin/settings');
 await page.locator('[data-view=holds]').click();await page.locator('[data-action=refund]').first().waitFor();await page.locator('[data-action=refund]').first().click();await page.locator('#action-form [name=reason]').fill('Unsent dispute refund review');await page.waitForTimeout(16000);assert.equal(await page.locator('#action-dialog').evaluate(el=>el.open),true);assert.equal(await page.locator('#action-form [name=reason]').inputValue(),'Unsent dispute refund review');
 await page.screenshot({path:'docs/wallet-control/previews/finance-refund-dialog.png',fullPage:true});
 assert.deepEqual(errors,[]);console.log('Finance UI passed: desktop/mobile containment, preserved policy draft/focus/scroll and dialog across refresh cycles, transient failure preserves form.');
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));await server.databaseClosed;await database.cleanup();for(const fn of cleanup.reverse())await fn();}

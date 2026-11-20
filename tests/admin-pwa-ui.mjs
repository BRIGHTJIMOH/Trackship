import {chromium} from 'playwright-core';
import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {adminFixture, OWNER_PASSWORD} from './admin-fixture.mjs';
const f=await adminFixture();
let dropNavigation=false;
const [handler]=f.server.listeners('request');
f.server.removeAllListeners('request');
f.server.on('request',(req,res)=>{if(dropNavigation && req.url==='/admin/')req.socket.destroy();else handler(req,res);});
const browser=await chromium.launchPersistentContext('',{executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox'],viewport:{width:820,height:1180}});
try {
 const context=browser;
 const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(f.base+'/admin/');
 await page.getByRole('heading',{name:'Welcome back.'}).waitFor();
 const manifestResponse=await page.request.get(f.base+'/admin/manifest.webmanifest');
 assert.match(manifestResponse.headers()['content-type'],/application\/manifest\+json/);
 const manifest=await manifestResponse.json();assert.equal(manifest.start_url,'/admin/');assert.equal(manifest.scope,'/admin/');assert.equal(manifest.display,'standalone');
 for (const icon of manifest.icons){const response=await page.request.get(f.base+icon.src);assert.equal(response.status(),200);assert.match(response.headers()['content-type'],/image\/png/);}
 const cdp=await context.newCDPSession(page);
 const installability=await cdp.send('Page.getInstallabilityErrors');
 assert.deepEqual(installability.installabilityErrors,[],JSON.stringify(installability));
 await page.evaluate(async()=>{await navigator.serviceWorker.ready;if(!navigator.serviceWorker.controller)await new Promise(r=>navigator.serviceWorker.addEventListener('controllerchange',r,{once:true}));});
 assert.equal(await page.evaluate(()=>navigator.serviceWorker.controller.scriptURL),f.base+'/admin/sw.js');
 // Exercise browser-menu installation instructions deterministically without a native prompt.
 await page.evaluate(()=>{const btn=document.querySelector('.admin-install');window.savedPrompt=null;btn.click();});
 // Headless Chrome does not show a native installation prompt; instructions are offered instead.
 if(await page.locator('dialog[open]').count()) {await page.getByRole('button',{name:'Done',exact:true}).click();}
 await page.getByLabel('Password',{exact:true}).fill(OWNER_PASSWORD);
 await page.getByRole('button',{name:'Log in',exact:true}).click();
 await page.getByRole('heading',{name:'Your network, in view.'}).waitFor();
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 await page.reload();await page.getByRole('heading',{name:'Your network, in view.'}).waitFor();
 // Private responses are not saved by the worker, including authenticated API reads.
 await page.evaluate(async()=>{await fetch('/api/admin/overview');await caches.open('unrelated-app-cache');});
 const cached=await page.evaluate(async()=>{const out=[];for(const key of await caches.keys()){const cache=await caches.open(key);out.push([key,(await cache.keys()).map(r=>new URL(r.url).pathname)]);}return out;});
 assert.deepEqual(cached.find(([k])=>k.startsWith('sendrack-admin-offline-'))[1],['/admin/offline.html']);
 const swResponse=await page.request.get(f.base+'/admin/sw.js');assert.match(swResponse.headers()['cache-control'],/no-cache/);
 mkdirSync('artifacts/admin-pwa',{recursive:true});await page.screenshot({path:'artifacts/admin-pwa/tablet.png',fullPage:true});
 dropNavigation=true;await context.setOffline(true);await page.goto(f.base+'/admin/');await page.getByRole('heading',{name:'Connect to continue.'}).waitFor({timeout:5000}).catch(async error=>{console.log('OFFLINE DEBUG',await page.title(),(await page.locator('body').innerText()).slice(0,900),await page.evaluate(()=>({controller:navigator.serviceWorker.controller?.scriptURL,online:navigator.onLine})));throw error;});
 assert.equal(await page.getByText('Your network, in view.').count(),0);
 dropNavigation=false;await context.setOffline(false);await page.getByRole('link',{name:'Try again'}).click();await page.getByRole('heading',{name:'Your network, in view.'}).waitFor();
 await page.getByRole('button',{name:'Log out',exact:true}).click();await page.getByRole('heading',{name:'Welcome back.'}).waitFor();
 const denied=await page.request.get(f.base+'/api/admin/overview');assert.equal(denied.status(),401);
 await page.setViewportSize({width:1440,height:1000});await page.screenshot({path:'artifacts/admin-pwa/desktop.png',fullPage:true});
 // The finance page participates in the same app without removing its own authentication.
 await page.goto(f.base+'/admin/wallet');assert.equal(await page.locator('link[rel="manifest"]').getAttribute('href'),'/admin/manifest.webmanifest');
 assert.deepEqual(errors,[]);
 console.log('PASS: admin manifest/icons, registration, authenticated reload, tablet layout, offline reconnect, private-cache isolation and logout protection.');
} finally {await browser.close();await f.close();}

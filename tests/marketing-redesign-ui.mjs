import {chromium} from 'playwright-core';
import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
const artifacts=new URL('../../work/marketing-redesign/',import.meta.url);
mkdirSync(artifacts,{recursive:true});
import {adminFixture} from './admin-fixture.mjs';
const f=await adminFixture(),b=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
try{
for(const width of [320,360,390,430,700,768,1024,1366,1920]){
const p=await b.newPage({viewport:{width,height:width<700?844:950}}),errors=[];p.on('pageerror',e=>errors.push(e.message));await p.goto(f.base);await p.evaluate(()=>document.fonts.ready);
assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth),width,'overflow '+width);
await p.getByRole('button',{name:'Pause animation',exact:true}).click();assert.equal(await p.locator('body').getAttribute('data-motion'),'false');await p.getByRole('button',{name:'Play animation',exact:true}).click();
await p.getByRole('button',{name:'I’m a rider'}).click();assert.equal(await p.locator('#workspace-image').getAttribute('src'),'/assets/demo-rider-jobs.jpg');assert.equal(await p.locator('#role').inputValue(),'rider');assert.equal(await p.getByRole('button',{name:'I’m a rider'}).getAttribute('aria-pressed'),'true');
await p.getByRole('button',{name:'I’m a vendor'}).click();assert.equal(await p.locator('#role').inputValue(),'vendor');assert.equal(await p.locator('#workspace-image').getAttribute('src'),'/assets/demo-vendor-dashboard.jpg');
await p.emulateMedia({reducedMotion:'reduce'});assert.equal(await p.locator('.parcel-float').evaluate(n=>getComputedStyle(n).animationName),'none');assert.equal(await p.locator('.motion-toggle').isDisabled(),true);
if([390,1366].includes(width)){
await p.getByLabel('Your name',{exact:true}).fill('Design Preview');await p.getByLabel('Your city',{exact:true}).fill('Zaria');await p.getByLabel('Email address',{exact:true}).fill('redesign-'+width+'@example.com');await p.locator('[name=consent]').check();if(width===390){await p.route('**/api/waitlist',route=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'Please try again shortly.'})}));await p.getByRole('button',{name:'Join the waitlist',exact:true}).click();await p.getByRole('status').filter({hasText:'Please try again shortly.'}).waitFor();assert.equal(await p.getByLabel('Your name',{exact:true}).inputValue(),'Design Preview');assert.equal(await p.getByRole('button',{name:'Join the waitlist',exact:true}).isEnabled(),true);await p.unroute('**/api/waitlist');}await p.getByRole('button',{name:'Join the waitlist',exact:true}).click();await p.getByRole('status').filter({hasText:'You’re on the list'}).waitFor();
}
await p.evaluate(()=>scrollTo(0,0));if([390,1366].includes(width))await p.screenshot({path:new URL(width+'.png',artifacts).pathname,fullPage:true});if(width===1366)await p.screenshot({path:new URL('hero.png',artifacts).pathname});
assert.equal(await p.locator('a[href="/app"]').count(),0);await p.locator('.header-cta').click();assert.equal(new URL(p.url()).hash,'#waitlist');assert.equal(await p.locator('#workspace-link').getAttribute('href'),'#waitlist');assert.deepEqual(errors,[]);await p.close();console.log(width+': layout, motion controls, reduced motion, workspace switch and waitlist-only links passed; waitlist covered at 390/1366px');
}
}finally{await b.close();await f.close();}

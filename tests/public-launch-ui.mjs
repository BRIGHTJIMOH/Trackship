import {chromium} from 'playwright-core';
import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {adminFixture} from './admin-fixture.mjs';
const artifacts=new URL('../../work/fresh-launch/',import.meta.url);
mkdirSync(artifacts,{recursive:true});
const f=await adminFixture();
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
try {
  for (const width of [320,360,390,430,750,768,1024,1366,1920]) {
    const page=await browser.newPage({viewport:{width,height:width<750?844:1000},reducedMotion:'reduce'});
    const errors=[],requests=[];
    page.on('pageerror',e=>errors.push(e.message));
    page.on('request',r=>requests.push(r.url()));
    await page.goto(f.base);
    await page.evaluate(()=>document.fonts.ready);
    await page.locator('.scooter-art').evaluate(image=>image.decode());
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),width,'overflow at '+width);
    assert.equal(await page.locator('a[href="/app"]').count(),0);
    assert.equal(await page.locator('.parcel-world,.journey-stage,.app-phone,canvas').count(),0,'Previous website must not appear');
    assert.equal(await page.locator('.motion-control').isDisabled(),true);
    await page.getByRole('link',{name:'Join as a rider',exact:true}).click();
    assert.equal(await page.locator('#signup-role').inputValue(),'rider');
    assert.equal(await page.locator('#rider-card').evaluate(n=>n.classList.contains('is-selected')),true);
    if ([390,1366].includes(width)) {
      await page.getByLabel('Your name',{exact:true}).fill('New Website Preview');
      await page.getByLabel('Your city',{exact:true}).fill('Zaria');
      await page.getByLabel('Email address',{exact:true}).fill('fresh-'+width+'@example.com');
      await page.locator('[name=consent]').check();
      if(width===390){
        await page.route('**/api/waitlist',route=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'Please try again shortly.'})}));
        await page.getByRole('button',{name:'Put me on the list'}).click();
        await page.getByRole('status').filter({hasText:'Please try again shortly.'}).waitFor();
        assert.equal(await page.getByLabel('Your name',{exact:true}).inputValue(),'New Website Preview');
        assert.equal(await page.getByRole('button',{name:'Put me on the list'}).isEnabled(),true);
        await page.unroute('**/api/waitlist');
      }
      await page.getByRole('button',{name:'Put me on the list'}).click();
      await page.getByRole('status').filter({hasText:'You’re on the list'}).waitFor();
      await page.evaluate(()=>scrollTo(0,0));
      await page.screenshot({path:new URL(width+'-full.png',artifacts).pathname,fullPage:true});
      await page.screenshot({path:new URL(width+'-hero.png',artifacts).pathname});
    }
    await page.emulateMedia({reducedMotion:'no-preference'});
    await page.getByRole('button',{name:'Pause visual motion'}).click();
    await page.getByRole('button',{name:'Enable visual motion'}).click();
    assert.ok(requests.every(url=>url.startsWith(f.base)),'Only self-hosted assets');
    assert.deepEqual(errors,[]);
    await page.close();
    console.log(width+': fresh layout, rendered artwork, role selection, motion controls and waitlist-only links passed');
  }
  const owner=await f.login();
  const records=await(await f.api('/api/admin/waitlist',undefined,owner)).json();
  assert.equal(records.total,2);
  assert.ok(records.entries.every(entry=>entry.role==='rider'&&entry.city==='Zaria'));
  console.log('Both local signup records are visible to the owner with the chosen role and city; failed submissions preserve input');
} finally {await browser.close();await f.close();}

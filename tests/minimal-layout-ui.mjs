import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
import {mkdir} from 'node:fs/promises';
import {adminFixture,OWNER_PASSWORD} from './admin-fixture.mjs';
const f=await adminFixture(),browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']}),out='artifacts/minimal-layout',errors=[];
await mkdir(out,{recursive:true});
try{
 const page=await browser.newPage({viewport:{width:1920,height:1080}});page.on('pageerror',e=>errors.push(e.message));await page.goto(f.base+'/admin');await page.locator('#password').fill(OWNER_PASSWORD);await page.locator('#owner-login button').click();await page.locator('.operations-map').waitFor();
 assert.equal(await page.locator('.kpis').count(),0);assert.equal(await page.getByRole('heading',{name:'Recent shipments',exact:true}).count(),0);assert.equal(await page.locator('.operations-location-filters [name=city]').isVisible(),true);assert.equal(await page.locator('.map-legend').isVisible(),true);
 await page.screenshot({path:out+'/overview.png',fullPage:true});
 await page.getByRole('button',{name:'Analytics',exact:true}).click();await page.locator('.kpis').waitFor();await page.getByRole('heading',{name:'Shipment activity',exact:true}).waitFor();await page.getByRole('heading',{name:'Recent shipments',exact:true}).waitFor();assert.equal(await page.locator('.operations-map').count(),0);
 for(const name of ['Shipments','Routes','Users','Website videos','Activity log']){await page.getByRole('button',{name,exact:true}).click();const top=await page.locator('.topbar').evaluate(el=>el.getBoundingClientRect().top);assert.ok(top<30,name+' header must start at top: '+top);}
 await page.getByRole('button',{name:'Routes',exact:true}).click();await page.screenshot({path:out+'/routes.png',fullPage:true});
 const publicPage=await browser.newPage({viewport:{width:390,height:844}});await publicPage.goto(f.base+'/');assert.equal(await publicPage.locator('#stories').isHidden(),true);assert.equal(await publicPage.locator('[data-video-nav]').isHidden(),true);assert.doesNotMatch(await publicPage.locator('body').innerText(),/recording with the team|watch this space/i);
 const owner=await f.login(),config=await(await f.api('/api/admin/website-videos',undefined,owner)).json();config.videos[0]={id:'founder',title:'Meet SendRack',url:'https://youtu.be/abcdefghijk',published:true};assert.equal((await f.api('/api/admin/website-videos',config,owner)).status,200);await publicPage.reload();await publicPage.locator('.founder-story').waitFor();assert.equal(await publicPage.locator('[data-video-nav]').isVisible(),false,'mobile navigation is intentionally collapsed');assert.equal(await publicPage.locator('[data-video-nav]').getAttribute('hidden'),null);await publicPage.screenshot({path:out+'/published-videos.png',fullPage:true});
 assert.deepEqual(errors,[]);console.log('PASS: map-only Overview, Analytics summaries, top-aligned short admin pages, visible city/legend controls and draft-free public video section.');
}finally{await browser.close();await f.close();}

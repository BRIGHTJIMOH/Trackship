import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright-core';
import {adminFixture} from './admin-fixture.mjs';
import {newTransport} from '../web/lifecycle.mjs';
const f=await adminFixture();let browser;
try{
 const s=newTransport({sender:'Vendor',recipient:'Customer',phone:'08011112222',description:'Parcel',origin:'Zaria',originState:'Kaduna',destination:'Zaria',destinationState:'Kaduna',address:'Destination',deliveryType:'intrastate',deliveryFee:'1000'},'Sample store');
 s.status='Picked up';s.custodian='pickup';s.actors={pickup:{id:'sample-handler',name:'Rider'}};
 await f.server.database.prepare('INSERT INTO shipments(id,owner,public_hash,payload) VALUES(?,?,?,?)').run(s.id,'test-owner',createHash('sha256').update(s.publicToken).digest('hex'),JSON.stringify(s));
 browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});const page=await browser.newPage({viewport:{width:320,height:740}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(f.base+'/t/'+s.publicToken);await page.getByRole('button',{name:'Delivery reactions',exact:true}).waitFor();assert.equal(await page.locator('.reaction-popover').isVisible(),false);await page.getByRole('button',{name:'Delivery reactions',exact:true}).click();await page.getByRole('button',{name:'Waiting',exact:true}).waitFor();assert.equal(await page.locator('.reaction-choice').count(),8);
 await page.getByRole('button',{name:'Waiting',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.reaction-toggle')?.getAttribute('aria-expanded')==='false');await page.getByRole('button',{name:'Delivery reactions',exact:true}).click();await page.locator('[data-reaction="waiting"][aria-pressed="true"]').waitFor();assert.match(await page.locator('.reaction-feed').innerText(),/Tracking viewer \(you\).*Waiting/);
 await page.getByRole('button',{name:'Angry',exact:true}).click();await page.getByRole('status').filter({hasText:'Wait a few seconds'}).waitFor();assert.equal(await page.locator('[data-reaction="waiting"]').getAttribute('aria-pressed'),'true');
 await page.waitForTimeout(5500);assert.equal(await page.locator('[data-reaction="waiting"]').getAttribute('aria-pressed'),'true');
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 await page.evaluate(()=>document.documentElement.dataset.theme='dark');const colors=await page.locator('.shipment-reactions').evaluate(el=>({background:getComputedStyle(el).backgroundColor,color:getComputedStyle(el).color}));assert.notEqual(colors.background,colors.color);
 s.status='Delivered';await f.server.database.prepare('UPDATE shipments SET payload=? WHERE id=?').run(JSON.stringify(s),s.id);await page.waitForFunction(()=>document.querySelector('.shipment-reactions')?.textContent.includes('closed'));assert.equal(await page.locator('.reaction-choice').count(),0);assert.deepEqual(errors,[]);
 console.log('Reaction UI passed: eight choices, inline feedback, cooldown, polling, mobile width, dark colors and completion.');
}finally{await browser?.close();await f.close();}

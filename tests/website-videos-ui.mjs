import {chromium} from 'playwright-core';
import assert from 'node:assert/strict';
import {adminFixture,OWNER_PASSWORD} from './admin-fixture.mjs';
const f=await adminFixture(),browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
try{
 const page=await browser.newPage({viewport:{width:390,height:844}});
 await page.goto(f.base+'/admin');await page.locator('#password').fill(OWNER_PASSWORD);await page.locator('#owner-login button').click();await page.locator('[data-view="website-videos"]').click();await page.locator('#vt0').fill('A word from our founder');await page.locator('#vu0').fill('https://youtu.be/abcdefghijk');await page.locator('#vd0').fill('The purpose behind SendRack.');await page.locator('#vn0').fill('Bright Jimoh');await page.locator('#vr0').fill('Founder');await page.locator('#vq0').fill('<img src=x onerror=alert(1)>');await page.locator('[name="published-0"]').check();await page.locator('#website-videos-form button').click();await page.getByText('Website videos saved.',{exact:true}).waitFor();
 await page.goto(f.base+'/#stories');await page.locator('.founder-story').waitFor();assert.equal(await page.locator('#website-videos iframe').count(),0);await page.locator('.story-description').filter({hasText:'The purpose behind SendRack.'}).waitFor();assert.match(await page.locator('.story-speaker').innerText(),/Bright Jimoh/);assert.match(await page.locator('.story-quote').innerText(),/<img/);assert.equal(await page.locator('.story-copy img').count(),0);
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 await page.screenshot({path:'/tmp/sendrack-website-videos-mobile.png',fullPage:true});
 await page.route('https://www.youtube-nocookie.com/**',r=>r.fulfill({contentType:'text/html',body:'<p>Controlled video player fixture</p>'}));
 await page.getByRole('button',{name:'Play A word from our founder'}).click();await page.locator('#website-videos iframe').waitFor();assert.match(await page.locator('#website-videos iframe').getAttribute('src'),/youtube-nocookie/);
 await page.setViewportSize({width:1440,height:1000});const layout=await page.locator('.founder-story').evaluate(el=>{const player=el.querySelector('.story-screen').getBoundingClientRect(),copy=el.querySelector('.story-copy').getBoundingClientRect();return {side:copy.left>=player.right,overflow:document.documentElement.scrollWidth>innerWidth};});assert.equal(layout.side,true);assert.equal(layout.overflow,false);await page.screenshot({path:'/tmp/sendrack-website-videos-desktop.png',fullPage:true});
 console.log('Owner publish, mobile overflow, click-to-load and desktop checks passed.');
}finally{await browser.close();await f.close();}

import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
import {pbkdf2Sync} from 'node:crypto';
import {mkdir,readFile} from 'node:fs/promises';
import {adminFixture,vendorProfile,riderProfile} from './admin-fixture.mjs';
const f=await adminFixture(),browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
await mkdir('artifacts/home-responsive',{recursive:true});
try{
 for(const role of ['vendor','rider']){
 const profile=role==='vendor'?{...vendorProfile,ownerName:'Ada Chiamaka Obi Longname'}:{...riderProfile,fullName:'Chika Chinedu Rider Longname'},auth=await f.account(role,profile),salt='responsive-home',pin={salt,hash:pbkdf2Sync('724918',salt,210000,32,'sha256').toString('hex'),attempts:0,lockedUntil:0};
 const context=await browser.newContext({viewport:{width:390,height:844}});if(process.env.SENDRACK_COMPARE_CSS)await context.route('**/sendrack-ui.css*',async r=>r.fulfill({contentType:'text/css',body:await readFile(process.env.SENDRACK_COMPARE_CSS)}));
 await context.addInitScript(({role,profile,token,base,pin})=>{localStorage.setItem('trackship-v1',JSON.stringify({lastRole:role,accounts:{[role]:profile},deviceAccounts:{[role+':'+profile.phone]:{role,profile,pin,connection:{base,token,verified:true},shipments:[],jobs:[]}}}));},{role,profile:auth.profile,token:auth.token,base:f.base,pin});
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(f.base+'/app');await page.locator('#loginPin').fill('724918');await page.locator('#local-login button').click();await page.locator('.reference-home').waitFor();if(role==='vendor'){await page.locator('#send-again').click();await page.locator('#toast').filter({hasText:'Your first delivery'}).waitFor();assert.equal(await page.locator('.reference-home').count(),1);}if(role==='rider'){await page.getByRole('dialog',{name:'Today’s routes'}).waitFor();await page.locator('#skip-routes-today').click();await page.getByRole('dialog').waitFor({state:'detached'});}
 for(const [width,height]of [[280,640],[320,568],[360,640],[390,844],[412,915],[480,800],[768,1024],[844,390]]){
 await page.setViewportSize({width,height});await page.getByRole('button',{name:'Home',exact:true}).click();
 for(const scale of [1,1.6]){
  if(scale!==1)await page.evaluate(scale=>{const items=[...document.querySelectorAll('.shell .topbar *,.reference-home *')].map(el=>{const s=getComputedStyle(el);return {el,font:parseFloat(s.fontSize)*scale,line:parseFloat(s.lineHeight)*scale};});for(const {el,font,line}of items){el.dataset.homeScaleTest='true';el.style.fontSize=font+'px';if(Number.isFinite(line))el.style.lineHeight=line+'px';}},scale);
  const layout=await page.evaluate(()=>{const rect=el=>el.getBoundingClientRect(),wallet=document.querySelector('.home-wallet-card'),w=rect(wallet),g=rect(document.querySelector('.home-greeting'));return {width:innerWidth,scroll:scrollY,overflow:document.documentElement.scrollWidth>innerWidth,greeting:g.top,wallet:w.top,children:[...wallet.querySelectorAll('button')].map(el=>{const r=rect(el);const range=document.createRange();range.selectNodeContents(el);const textInside=[...range.getClientRects()].every(t=>t.left>=r.left-1&&t.right<=r.right+1&&t.top>=r.top-1&&t.bottom<=r.bottom+1);return {label:el.textContent,textInside,left:r.left,right:r.right,top:r.top,bottom:r.bottom,contained:r.left>=w.left&&r.right<=w.right&&r.top>=w.top&&r.bottom<=w.bottom};})};});
  assert.equal(layout.overflow,false,role+' '+width+' text '+scale+' body overflow');assert.equal(layout.scroll,0,'Home starts at the top');assert.ok(layout.greeting>=0&&layout.wallet>=0,'top content visible');for(const child of layout.children)assert.ok(child.contained&&child.textInside,JSON.stringify({role,width,scale,child}));
  if([320,390,844].includes(width))await page.screenshot({path:`artifacts/home-responsive/${role}-${width}-${scale}.png`,fullPage:true});
  if(scale!==1)await page.evaluate(()=>document.querySelectorAll('[data-home-scale-test]').forEach(el=>{el.style.removeProperty('font-size');el.style.removeProperty('line-height');delete el.dataset.homeScaleTest;}));
 }
 }
 // Browser safe area is honoured; the native frame already consumes its insets.
 await page.setViewportSize({width:390,height:844});await page.evaluate(()=>{document.documentElement.style.setProperty('--safe-top','32px');scrollTo(0,0);});assert.ok(await page.locator('.home-greeting').evaluate(el=>el.getBoundingClientRect().top)>=32);await page.evaluate(()=>document.documentElement.style.removeProperty('--safe-top'));
 await page.evaluate(()=>scrollTo(0,300));await page.getByRole('button',{name:'Profile',exact:true}).click();await page.getByRole('button',{name:'Home',exact:true}).click();assert.equal(await page.evaluate(()=>scrollY),0);
 await page.evaluate(()=>scrollTo(0,300));await page.reload();await page.locator('#loginPin').fill('724918');await page.locator('#local-login button').click();await page.locator('.reference-home').waitFor();assert.equal(await page.evaluate(()=>scrollY),0);assert.deepEqual(errors,[]);await context.close();
 }
 console.log('PASS: vendor/rider Home at eight viewport sizes, 160% text simulation, contained wallet controls, safe-area spacing, navigation and reload scroll reset. Browser simulation; no physical Android execution.');
}finally{await browser.close();await f.close();}

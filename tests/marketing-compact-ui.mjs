import {chromium} from 'playwright-core';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdirSync,writeFileSync} from 'node:fs';
import {adminFixture} from './admin-fixture.mjs';
const dir='docs/marketing-compact';mkdirSync(dir,{recursive:true});
const before=execFileSync('git',['show','ed9a2dd65d5ba0e251b56c75e47196791ecdf144:web/marketing.css'],{encoding:'utf8'});
const beforeHtml=execFileSync('git',['show','ed9a2dd65d5ba0e251b56c75e47196791ecdf144:web/marketing.html'],{encoding:'utf8'});
const f=await adminFixture(),b=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});const report=[];
try{for(const [width,height]of [[1366,768],[1920,1080],[768,1024],[390,844],[320,700]]){
 for(const version of ['before','after']){const p=await b.newPage({viewport:{width,height},reducedMotion:'reduce'});if(version==='before')await p.route(f.base+'/',r=>r.fulfill({contentType:'text/html',body:beforeHtml}));await p.goto(f.base+'/');if(version==='before')await p.addStyleTag({content:before});await p.locator('.product-grid').scrollIntoViewIfNeeded();await p.waitForFunction(()=>[...document.querySelectorAll('.demo-screen')].every(n=>n.complete&&n.naturalWidth));
 await p.evaluate(()=>document.fonts.ready);const dimensions=await p.locator('#product').evaluate(n=>({sectionHeight:Math.round(n.getBoundingClientRect().height),phones:[...n.querySelectorAll('.phone-device')].map(p=>Math.round(p.getBoundingClientRect().width))}));report.push({width,height,version,...dimensions});
 if(version==='after'){assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth),width);for(const w of dimensions.phones)assert.ok(w<=280&&w>=240,JSON.stringify(dimensions));assert.ok(dimensions.sectionHeight<900||width<1051);}
 if(width>=1366){await p.locator('#product').screenshot({path:`${dir}/${version}-product-${width}.png`});await p.evaluate(()=>{const n=document.querySelector('.product-grid');scrollTo(0,n.getBoundingClientRect().top+scrollY-20)});await p.screenshot({path:`${dir}/${version}-viewport-${width}.png`});}else if(version==='after')await p.locator('#product').screenshot({path:`${dir}/after-mobile-${width}.png`});await p.close();
 }}writeFileSync(dir+'/measurements.json',JSON.stringify(report,null,2)+'\n');console.log(report);}finally{await b.close();await f.close()}

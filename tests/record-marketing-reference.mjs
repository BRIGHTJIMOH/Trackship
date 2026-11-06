import {chromium} from 'playwright-core';import {spawn} from 'node:child_process';import {once} from 'node:events';import assert from 'node:assert/strict';import {mkdirSync} from 'node:fs';import {adminFixture} from './admin-fixture.mjs';
const dir='docs/marketing-ruled',f=await adminFixture(),b=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});mkdirSync(dir,{recursive:true});let encoder;
try{
 for(const [width,height]of [[1366,768],[1920,1080],[390,844],[360,800]]){const p=await b.newPage({viewport:{width,height},reducedMotion:'reduce'});await p.goto(f.base+'/');await p.evaluate(()=>document.fonts.ready);await p.waitForFunction(()=>document.querySelector('.parcel-render').complete&&document.querySelector('.parcel-render').naturalWidth);await p.screenshot({path:`${dir}/hero-${width}.png`});await p.screenshot({path:`${dir}/full-${width}.png`,fullPage:true});await p.locator('#how').screenshot({path:`${dir}/journey-${width}.png`});await p.locator('#product').screenshot({path:`${dir}/phones-${width}.png`});assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth),width);await p.close();}
 const p=await b.newPage({viewport:{width:1366,height:768},reducedMotion:'no-preference'});await p.goto(f.base+'/');await p.evaluate(()=>document.fonts.ready);await p.waitForFunction(()=>document.querySelector('.parcel-render').complete&&document.querySelector('.parcel-render').naturalWidth);await p.screenshot({path:dir+'/motion-poster.png'});
 encoder=spawn('ffmpeg',['-y','-hide_banner','-loglevel','error','-f','image2pipe','-framerate','12','-i','-','-an','-c:v','libx264','-preset','veryfast','-crf','21','-pix_fmt','yuv420p','-movflags','+faststart',dir+'/motion.mp4']);let errors='';encoder.stderr.on('data',d=>errors+=d);const done=once(encoder,'close');encoder.stdin.on('error',()=>{});const start=performance.now();
 for(let i=0;i<432;i++){
  if(i===36)await p.locator('.scene .illustration-toggle').evaluate(n=>n.click());
  if(i===48)await p.evaluate(()=>{const n=document.querySelector('#how');scrollTo({top:n.getBoundingClientRect().top+scrollY-12,behavior:'instant'})});
  if(i===144)await p.evaluate(()=>{const n=document.querySelector('.product-grid');scrollTo({top:n.getBoundingClientRect().top+scrollY-12,behavior:'instant'})});
  if(i===384)await p.locator('[data-demo=vendor] .demo-toggle').evaluate(n=>n.click());
  if(i===420)await p.locator('[data-demo=vendor] [data-step="3"]').evaluate(n=>n.click());
  const frame=await p.screenshot({type:'jpeg',quality:86});if(!encoder.stdin.write(frame))await once(encoder.stdin,'drain');const wait=start+(i+1)*1000/12-performance.now();if(wait>0)await new Promise(r=>setTimeout(r,wait));
 }
 encoder.stdin.end();const [status]=await done;assert.equal(status,0,errors);console.log('Desktop/mobile previews and 36-second real-browser motion recording completed: parcel, drawn journey, compact vendor/rider phones and pause/select.');
}finally{if(encoder&&!encoder.killed)encoder.kill();await b.close();await f.close();}

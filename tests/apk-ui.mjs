import {chromium} from 'playwright-core';
import {execFileSync} from 'node:child_process';
import {readFileSync,mkdtempSync,rmSync,mkdirSync} from 'node:fs';
import {createServer} from 'node:http';
import {tmpdir} from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {pbkdf2Sync} from 'node:crypto';
import {newShipment} from '../web/core.mjs';
const apk=path.resolve(process.env.SENDRACK_APK_PATH||'artifacts/SendRack-test.apk'),dir=mkdtempSync(path.join(tmpdir(),'sendrack-apk-ui-'));
execFileSync('python3',['-c',`import zipfile,sys,pathlib
with zipfile.ZipFile(sys.argv[1]) as z:
 for n in z.namelist():
  if n.startswith('assets/web/') and not n.endswith('/'):
   p=pathlib.Path(sys.argv[2])/pathlib.PurePosixPath(n).relative_to('assets/web');p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(z.read(n))
`,apk,dir]);
const entry=readFileSync(path.join(dir,'sendrack-entry.html'),'utf8');assert.match(entry,/sendrack-main\.js\?v=0\.7\.0/);assert.match(entry,/sendrack-ui\.css\?v=0\.7\.0/);
assert.equal(readFileSync(path.join(dir,'sendrack-main.js'),'utf8'),readFileSync('web/app.js','utf8'));
const server=createServer((req,res)=>{const pathname=new URL(req.url,'http://localhost').pathname;const file=path.resolve(dir,'.'+pathname);if(!file.startsWith(dir+path.sep)){res.writeHead(403).end();return;}try{const content=readFileSync(file);res.setHeader('Content-Type',file.endsWith('.html')?'text/html':file.endsWith('.css')?'text/css':file.endsWith('.ttf')?'font/ttf':file.endsWith('.svg')?'image/svg+xml':'text/javascript');res.setHeader('Cache-Control','no-store');res.end(content);}catch{res.writeHead(404).end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
try{
 const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:2});const pin='724918',salt='retained-account-test-salt';
 const profile={businessName:'Retained Business',ownerName:'Bright Jimoh',phone:'08012345678',city:'Abuja',state:'FCT Abuja',pickupAddress:'10 Wuse Test Market'};
 const shipment=newShipment({sender:profile.businessName,recipient:'Ada',phone:'08011112222',description:'Retained shipment',origin:'Abuja',destination:'Garki',address:'10 Test Road'},profile.businessName);
 await context.addInitScript(({profile,shipment,salt,hash})=>{localStorage.setItem('trackship-v1',JSON.stringify({activeRole:'vendor',accounts:{vendor:profile,rider:null},profile:{name:profile.businessName,phone:profile.phone},shipments:[shipment],deviceLock:{salt,hash,attempts:0,lockedUntil:0}}));},{profile,shipment,salt,hash:pbkdf2Sync(pin,salt,210000,32,'sha256').toString('hex')});
 const page=await context.newPage(),errors=[],requests=[];page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>requests.push(new URL(r.url()).pathname));const started=Date.now();await page.goto(base+'/sendrack-entry.html');await page.locator('.splash').waitFor();await page.waitForTimeout(2500);assert.equal(await page.locator('.splash').count(),1);await page.locator('#local-login').waitFor();assert.ok(Date.now()-started>=3900,'startup logo remains visible for four seconds');
 assert.equal(await page.locator('.brand').innerText(),'SendRack');assert.equal(await page.locator('.build-badge').innerText(),'v0.7.0');
 const expected=[...readFileSync('web/assets/sendrack-mark.svg','utf8').matchAll(/<path d="([^"]+)"/g)].map(m=>m[1]);assert.deepEqual(await page.locator('.brand-mark path').evaluateAll(nodes=>nodes.map(n=>n.getAttribute('d'))),expected);
 assert.equal(await page.locator('.brand-mark').evaluate(n=>getComputedStyle(n).stroke),'none');assert.ok(requests.includes('/sendrack-main.js'));assert.ok(requests.includes('/sendrack-ui.css'));assert.equal(requests.includes('/app.js'),false);
 mkdirSync('artifacts/apk-ui',{recursive:true});await page.evaluate(()=>document.fonts.ready);await page.screenshot({path:'artifacts/apk-ui/SendRack-v0.7.0-login.png',fullPage:true,animations:'disabled'});
 await page.getByLabel('Login PIN',{exact:true}).fill(pin);await page.locator('#local-login button').click();await page.getByRole('heading',{name:profile.businessName,exact:true}).waitFor();await page.getByText('Retained shipment',{exact:true}).waitFor();assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('trackship-v1')).shipments[0].id),shipment.id);assert.deepEqual(errors,[]);
 console.log('Packaged-APK assets UI passed (signature/device lifecycle not tested): fresh entry files, split-S geometry, visible v0.7.0 badge, old account PIN login and retained shipment.');
}finally{await browser.close();await new Promise(r=>server.close(r));rmSync(dir,{recursive:true,force:true});}

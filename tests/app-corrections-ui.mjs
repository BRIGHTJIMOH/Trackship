import assert from 'node:assert/strict';
import {randomUUID,randomBytes,createHash,pbkdf2Sync} from 'node:crypto';
import {mkdir,mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {chromium} from 'playwright-core';
import {controlFixture,owner} from './wallet/control-fixture.mjs';
import {testDatabase} from './database-fixture.mjs';
import {createApp} from '../server/server.mjs';
const cleanup=[],f=await controlFixture({after:fn=>cleanup.push(fn)}),db=await testDatabase();
if(!db.env.DATABASE_URL)throw Error('Set both disposable PostgreSQL test URLs.');
const server=await createApp({env:{...db.env,NODE_ENV:'test',ADMIN_USERNAME:'sample-owner',ADMIN_PASSWORD:'Synthetic UI Password 2026!'},walletControl:{admin:f.admin,auth:f.auth,withdrawals:f.withdrawals}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']}),errors=[];
const packaged=process.env.SENDRACK_TEST_APK?path.resolve(process.env.SENDRACK_TEST_APK):null;
const packageDir=packaged?await mkdtemp(path.join(tmpdir(),'sendrack-current-apk-')):null;
if(packaged)execFileSync('python3',['-c',`import zipfile,pathlib,sys
with zipfile.ZipFile(sys.argv[1]) as z:
 for name in z.namelist():
  if name.startswith('assets/web/') and not name.endswith('/'):
   relative=pathlib.PurePosixPath(name).relative_to('assets/web')
   if '..' in relative.parts: raise ValueError('Invalid asset path')
   target=pathlib.Path(sys.argv[2])/relative;target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(z.read(name))`,packaged,packageDir]);
async function packagedRoutes(context){if(!packageDir)return;await context.route(base+'/**',async route=>{
 const pathname=new URL(route.request().url()).pathname;if(pathname.startsWith('/api/'))return route.fallback();
 const name=pathname==='/app'?'sendrack-entry.html':pathname.slice(1),target=path.resolve(packageDir,name);
 if(!target.startsWith(packageDir+path.sep))return route.abort();
 try{const body=await readFile(target);const ext=path.extname(target),types={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.png':'image/png','.webp':'image/webp','.svg':'image/svg+xml','.ttf':'font/ttf'};return route.fulfill({status:200,contentType:types[ext]||'application/octet-stream',body});}catch{return route.fallback();}
 });}
const out=packaged?'artifacts/apk-corrections':'docs/app-corrections/previews';await mkdir(out,{recursive:true});
try{
 const w=await f.wallet('vendor',150000),token=randomBytes(32).toString('hex'),salt=randomUUID(),hash=pbkdf2Sync('135790',salt,210000,32,'sha256').toString('hex'),profile={businessName:'Ada Market · Sample',ownerName:'Ada Obi',phone:'08012345678',city:'Abuja',state:'FCT Abuja',pickupAddress:'Sample Shop, Wuse',email:'sample@example.invalid'};
 await f.policy();const routeId=randomUUID();
 await server.database.withRequest('POST',async()=>{
  await server.database.prepare('INSERT INTO vendor_accounts(id,phone,owner_key,profile) VALUES (?,?,?,?)').run(w.ownerId,profile.phone,'sample-workspace',JSON.stringify(profile));
  await server.database.prepare('INSERT INTO vendor_sessions VALUES (?,?,?)').run(createHash('sha256').update(token).digest('hex'),w.ownerId,Date.now()+600000);
  await server.database.prepare('INSERT INTO admin_routes(id,name,origin_city,origin_state,destination_city,destination_state,delivery_type,pickup_kobo,carrier_kobo,lastmile_kobo,bidirectional,active,revision,created,updated) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(routeId,'Sample Abuja route','Abuja','FCT Abuja','Garki','FCT Abuja','intrastate',10000,0,0,0,1,1,Date.now(),Date.now());
 });
 const context=await browser.newContext({viewport:{width:390,height:844}});await packagedRoutes(context);
 await context.route('**/config.mjs',r=>r.fulfill({contentType:'text/javascript',body:`export const SERVICE_URL=${JSON.stringify(base)};`}));
 const saved={accounts:{vendor:profile,rider:null},lastRole:'vendor',deviceAccounts:{['vendor:'+profile.phone]:{role:'vendor',profile,pin:{salt,hash,attempts:0,lockedUntil:0},connection:{base,token,verified:true},shipments:[]}}};
 await context.addInitScript(data=>localStorage.setItem('trackship-v1',JSON.stringify(data)),saved);
 const p=await context.newPage();p.on('pageerror',e=>errors.push(e.message));await p.goto(base+'/app');await p.locator('#local-login').waitFor();
 assert.equal(await p.locator('[name=loginPhone]').getAttribute('type'),'hidden');await p.screenshot({path:out+'/remembered-login.png',fullPage:true});
 await p.locator('#loginPin').fill('135790');await p.locator('#local-login button').click();await p.locator('.customer-balance h2').filter({hasText:'1,500'}).waitFor();
 assert.equal(await p.locator('.balance-card').count(),0);assert.equal(await p.locator('main #search,main .empty,main .pickup-shortcut').count(),0);assert.equal(await p.locator('.vehicle-card').count(),4);for(const img of await p.locator('.vehicle-card img').all())assert.equal(await img.evaluate(e=>e.complete&&e.naturalWidth>0),true);await p.screenshot({path:out+'/vendor-home.png',fullPage:true});for(const width of [1366,1920]){await p.setViewportSize({width,height:width===1366?768:1080});assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await p.screenshot({path:out+'/vendor-home-'+width+'.png',fullPage:true});}await p.setViewportSize({width:390,height:844});
 await p.locator('#home-search').click();await p.locator('#search').waitFor();await p.locator('[aria-label=Home]').click();
 await p.locator('[aria-label="Open wallet"]').click();await p.locator('.wallet-activity-title').waitFor();
 assert.equal(await p.locator('input[name=pin]').count(),0);assert.equal(await p.locator('input[name=bankCode]').count(),0);assert.equal(await p.locator('body').innerText().then(s=>/ledger|bank balance|held|transaction pin|request withdrawal/i.test(s)),false);
 await p.screenshot({path:out+'/wallet-mobile.png',fullPage:true});
 for(const width of [390,1366,1920]){await p.setViewportSize({width,height:width===390?844:900});assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);}
 await p.setViewportSize({width:390,height:844});await p.locator('[aria-label=Profile]').click();await p.locator('[data-nav=wallet-security]').click();await p.locator('#wallet-pin-code').click();await p.locator('#wallet-pin-form').waitFor();await p.locator('#wallet-otp').fill(f.texts.at(-1).code);await p.locator('#wallet-pin').fill('246802');await p.locator('#wallet-pin-form button').click();await p.locator('#profile-form').waitFor();
 await p.locator('[aria-label=Home]').click();await p.locator('[data-nav=wallet-withdraw]').click();await p.screenshot({path:out+'/withdraw-on-tap.png',fullPage:true});
 await p.locator('#wallet-bankCode').fill('999');await p.locator('#wallet-accountNumber').fill('0000000000');await p.locator('#wallet-amount').fill('10.00');await p.locator('#wallet-quote-form button').click();await p.locator('#wallet-withdraw-code').waitFor();f.advance(61000);await p.locator('#wallet-withdraw-code').click();await p.locator('#wallet-withdraw-form').waitFor();await p.locator('#wallet-otp').fill(f.texts.at(-1).code);await p.locator('#wallet-pin').fill('246802');await p.locator('#wallet-withdraw-form button').click();await p.locator('.wallet-activity').filter({hasText:'Processing'}).waitFor();
 await p.screenshot({path:out+'/wallet-processing.png',fullPage:true});
 await p.locator('[aria-label=Home]').click();await p.locator('[data-vehicle-class=keke]').click();assert.equal(await p.locator('#vehicleClass').inputValue(),'keke');await p.locator('#description').fill('Sample clothing parcel');assert.equal(await p.locator('#declaredValue,#notes').count(),0);await p.screenshot({path:out+'/package-details.png',fullPage:true});await p.locator('#shipment-form button[type=submit]').click();await p.locator('#deliveryRoute option').filter({hasText:'Sample Abuja route'}).waitFor({state:'attached'});await p.locator('#deliveryRoute').selectOption(routeId+':forward');await p.locator('#address').fill('Sample delivery address, Garki');await p.locator('#recipient').fill('Sample Customer');await p.locator('#phone').fill('08011112222');await p.locator('#shipment-form button[type=submit]').click();try{await p.locator('h2').filter({hasText:'Order summary'}).waitFor({timeout:5000});}catch(e){console.log('Shipment form error:',await p.locator('#form-error').textContent());await p.screenshot({path:'/workspace/scratch/shipment-form-failure.png',fullPage:true});throw e;}assert.equal(await p.locator('#deliveryFee,#riderPhone,[data-service]').count(),0);await p.screenshot({path:out+'/shipment-review.png',fullPage:true});await p.locator('#shipment-form input[type=checkbox]').check();await p.locator('#shipment-form button[type=submit]').click();await p.locator('#modal-track').click();await p.locator('.page-heading').waitFor();assert.equal(await p.locator('#delivery-pay,#payerEmail,[data-share-leg]').count(),0);await p.screenshot({path:out+'/shipment-detail.png',fullPage:true});
 const fresh=await browser.newContext({viewport:{width:390,height:844}});await packagedRoutes(fresh);await fresh.route('**/config.mjs',r=>r.fulfill({contentType:'text/javascript',body:`export const SERVICE_URL=${JSON.stringify(base)};`}));const signup=await fresh.newPage();signup.on('pageerror',e=>errors.push(e.message));await signup.goto(base+'/app');await signup.locator('#access-signup').waitFor();await signup.screenshot({path:out+'/new-account-login.png',fullPage:true});await signup.locator('#access-signup').click();await signup.locator('[data-signup-role=rider]').click();await signup.locator('#fullName').fill('Sample Keke Rider');await signup.locator('#phone').fill('08098765432');await signup.locator('#setup-form button').click();await signup.locator('#city').fill('Zaria');await signup.locator('#state').fill('Kaduna');await signup.locator('#vehicle').selectOption('Tricycle / Keke NAPEP');assert.equal(await signup.locator('#community').count(),0);await signup.locator('[name=acknowledged]').check();await signup.screenshot({path:out+'/rider-city-and-keke.png',fullPage:true});await signup.locator('#setup-form button').click();await signup.locator('#idNumber').fill('12345678901');await signup.locator('#homeAddress').fill('Sample residential address, Zaria');await signup.locator('#emergencyPhone').fill('08011112222');
 const photo={name:'sample-id.png',mimeType:'image/png',buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==','base64')};await signup.locator('#idPhoto').setInputFiles(photo);await signup.locator('#profilePhoto').setInputFiles(photo);assert.equal(await signup.locator('#idNumber').inputValue(),'12345678901');assert.equal(await signup.locator('#nin,#drivingLicence,#vehicleRegistration').count(),0);assert.equal(await signup.locator('#idPhoto').evaluate(e=>e.files.length),1);await signup.screenshot({path:out+'/single-id-upload.png',fullPage:true});
 assert.deepEqual(errors,[]);console.log('Corrected app UI passed: same app wallet, private accounting absent, PIN in Profile, withdrawal on tap, remembered login, route-only review, Keke/city-wide signup and retained ID/photo inputs.');
}finally{await browser.close();await new Promise(r=>server.close(r));await server.databaseClosed;await db.cleanup();for(const fn of cleanup.reverse())await fn();if(packageDir)await rm(packageDir,{recursive:true,force:true});}

import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
import {adminFixture,vendorProfile,riderProfile,photo} from './admin-fixture.mjs';
const f=await adminFixture(),browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']}),errors=[];
try{
 for(const role of ['vendor','rider']){
  const context=await browser.newContext({viewport:{width:390,height:844}}),profile=role==='vendor'?vendorProfile:riderProfile;
  await context.route('**/config.mjs',r=>r.fulfill({contentType:'text/javascript',body:'export const SERVICE_URL="https://pilot.test";'}));
  await context.route('https://pilot.test/**',async r=>{const response=await r.fetch({url:f.base+new URL(r.request().url()).pathname});await r.fulfill({response,headers:{...response.headers(),'access-control-allow-origin':'*'}});});
  await context.addInitScript(({role,profile,photo})=>{
   window.TrackShip={saveAccountIdentity(r,p,json){window.testIdentity=JSON.parse(json);return true;},loadAccountIdentity(){return JSON.stringify({fullName:profile.ownerName||profile.fullName,idType:'National ID card',idNumber:'12345678901',idPhoto:photo,homeAddress:'10 Private Residential Road, Zaria',consent:true,...(role==='rider'?{vehicle:'Bicycle',emergencyPhone:'08011112222'}:{})});},clearAccountIdentity(){window.testIdentityCleared=true;},setNightMode(){},stopTracking(){},clearDeliveryAlerts(){},configureAccountAlerts(){}};
  },{role,profile,photo});
  const p=await context.newPage();p.on('pageerror',e=>errors.push(e.message));await p.goto(f.base+'/app');await p.locator('#access-signup').click();await p.locator('[data-signup-role='+role+']').click();
  if(role==='vendor'){await p.locator('#businessName').fill(profile.businessName);await p.locator('#ownerName').fill(profile.ownerName);}else await p.locator('#fullName').fill(profile.fullName);
  await p.locator('#phone').fill(profile.phone);await p.locator('#setup-form button[type=submit]').click();await p.locator('#city').fill(profile.city);await p.locator('#state').fill(profile.state);
  if(role==='vendor')await p.locator('#pickupAddress').fill(profile.pickupAddress);else await p.locator('#vehicle').selectOption('Bicycle');
  await p.locator('[name=acknowledged]').check();await p.locator('#setup-form button[type=submit]').click();
  await p.locator('#idNumber').fill('12345678901');await p.locator('#idPhoto').setInputFiles({name:'test-id.png',mimeType:'image/png',buffer:Buffer.from(photo.split(',')[1],'base64')});await p.locator('#homeAddress').fill('10 Private Residential Road, Zaria');
  if(role==='rider')await p.locator('#emergencyPhone').fill('08011112222');await p.locator('[name=identityConsent]').check();await p.locator('#signup-identity button[type=submit]').click();
  await p.getByRole('button',{name:'Send verification code',exact:true}).waitFor();assert.equal(await p.locator('#setup-form').count(),0);
  const stored=await p.evaluate(()=>localStorage.getItem('sendrack-pending-signup'));assert.ok(stored);assert.doesNotMatch(stored,/idNumber|idPhoto|homeAddress|base64/);
  // Android can recreate the WebView while an external picker/email app is open.
  await p.reload();await p.getByRole('button',{name:'Send verification code',exact:true}).waitFor();assert.equal(await p.locator('#setup-form').count(),0);assert.match(await p.locator('.subtitle').innerText(),/finish creating/);
  await p.locator('#accountEmail').fill(role+'@example.com');await p.locator('#cloud-login button[type=submit]').click();await p.locator('#accountCode').waitFor();await p.locator('#accountCode').fill(f.emails.at(-1).text.match(/\b\d{6}\b/)[0]);
  let fail=true;await p.route('**/api/accounts/identity',r=>{if(fail){fail=false;return r.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'Temporary upload outage'})});}return r.fallback();});
  await p.locator('#cloud-login button[type=submit]').click();await p.getByText('Temporary upload outage',{exact:true}).waitFor();assert.ok(await p.evaluate(()=>localStorage.getItem('sendrack-pending-signup')));
  await p.locator('#cloud-login button[type=submit]').click();await p.locator('#appPin').waitFor();assert.equal(await p.evaluate(()=>localStorage.getItem('sendrack-pending-signup')),null);
  await p.evaluate(()=>window.TrackShipLock());assert.equal(await p.locator('#appPin').count(),1);await p.locator('#appPin').fill('724918');await p.locator('#confirmPin').fill('724918');await p.locator('#pin-form button[type=submit]').click();await p.locator('.reference-home').waitFor();
  assert.equal(await p.evaluate(()=>JSON.parse(localStorage.getItem('trackship-v1')).accounts[JSON.parse(localStorage.getItem('trackship-v1')).activeRole].identityStatus),'submitted');
  await p.evaluate(()=>window.TrackShipLock());await p.locator('#loginPin').waitFor();assert.equal(await p.locator('.reference-home').count(),0,'completed accounts still lock in the background');await p.locator('#loginPin').fill('724918');await p.locator('#local-login button').click();await p.locator('.reference-home').waitFor();if(role==='rider'){await p.locator('#skip-routes-today').click();await p.locator('.daily-route-dialog').waitFor({state:'detached'});}await p.locator('.bottomnav [data-nav=profile]').click();await p.locator('#profile-logout').click();await p.getByRole('button',{name:'Send login code',exact:true}).waitFor();assert.equal(await p.getByRole('heading',{name:'Verify your email.',exact:true}).count(),0,'logout must not restart signup');await context.close();
 }
 assert.deepEqual(errors,[]);console.log('PASS: vendor/rider signup resumes after ID and reload, encrypted vault keeps ID out of web storage, upload retry preserves verification, PIN completes signup, authenticated accounts still lock.');
}finally{await browser.close();await f.close();}

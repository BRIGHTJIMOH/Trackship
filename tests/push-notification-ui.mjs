import {chromium} from 'playwright-core';
import {pbkdf2Sync,randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {adminFixture,riderProfile} from './admin-fixture.mjs';
const f=await adminFixture(),browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
try{
 const auth=await f.account('rider',riderProfile),salt='notification-test-salt',pin={salt,hash:pbkdf2Sync('836492',salt,210000,32,'sha256').toString('hex'),attempts:0,lockedUntil:0};
 await f.server.database.prepare('INSERT INTO delivery_notifications(id,rider_id,shipment_id,phase,title,body,created) VALUES (?,?,?,?,?,?,?)').run(randomUUID(),auth.profile.id,randomUUID(),'created','New delivery in Zaria','Open nearby shipments.',Date.now());
 const profile={...auth.profile,identityStatus:'submitted'},record={role:'rider',profile,pin,connection:{base:f.base,token:auth.token,verified:true},jobs:[]};
 const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(record=>{localStorage.setItem('trackship-v1',JSON.stringify({accounts:{vendor:null,rider:record.profile},deviceAccounts:{['rider:'+record.profile.phone]:record},roleLocks:{rider:record.pin},activeRole:null,lastRole:'rider',loggedOut:true,shipments:[],riderJobs:[],profile:{name:'',phone:''}}));window.TrackShip={configureDeliveryAlerts(base,token){window.notificationConfiguration={base,token};},clearDeliveryAlerts(){},stopTracking(){},setNightMode(){}};},record);
 await page.goto(f.base+'/app');await page.getByLabel('Login PIN',{exact:true}).waitFor();
 await page.evaluate(()=>window.TrackShipOpenAlerts());
 assert.equal(await page.getByRole('heading',{name:'Shipment notifications',exact:true}).count(),0);
 await page.getByLabel('Login PIN',{exact:true}).fill('836492');await page.getByRole('button',{name:'Log in',exact:true}).click();
 await page.getByRole('heading',{name:'Shipment notifications',exact:true}).waitFor();await page.getByText('New delivery in Zaria',{exact:true}).waitFor();
 assert.deepEqual(await page.evaluate(()=>window.notificationConfiguration),{base:f.base,token:auth.token});
 await page.evaluate(()=>window.TrackShipLock());await page.getByLabel('Login PIN',{exact:true}).waitFor();await page.evaluate(()=>window.TrackShipOpenAlerts());
 await page.getByLabel('Login PIN',{exact:true}).fill('836492');await page.getByRole('button',{name:'Log in',exact:true}).click();await page.getByRole('heading',{name:'Shipment notifications',exact:true}).waitFor();assert.deepEqual(errors,[]);
 await page.evaluate(()=>{window.pushDiagnosticState='token-request-failed';window.TrackShip.getDeliveryPushStatus=()=>JSON.stringify({state:window.pushDiagnosticState});window.TrackShip.retryDeliveryPush=()=>{window.retryCalls=(window.retryCalls||0)+1;window.pushDiagnosticState='connecting';};});await page.waitForFunction(()=>document.querySelector('#delivery-push-status')?.dataset.state==='token-request-failed');await page.getByRole('button',{name:'Try again',exact:true}).click();await page.waitForFunction(()=>document.querySelector('#delivery-push-status')?.dataset.state==='connecting');assert.equal(await page.evaluate(()=>retryCalls),1);await page.evaluate(()=>window.pushDiagnosticState='connected');await page.locator('#delivery-push-status[data-state=connected]').waitFor({state:'attached'});assert.equal(await page.locator('#retry-delivery-push').isHidden(),true);assert.equal(await page.locator('#enable-alerts').isHidden(),true);assert.match(await page.locator('#delivery-push-status').innerText(),/phone is connected/);await page.evaluate(()=>window.pushDiagnosticState='permission-required');await page.locator('#delivery-push-status[data-state=permission-required]').waitFor();assert.match(await page.locator('#delivery-push-status').innerText(),/Allow notifications/);await page.screenshot({path:'artifacts/push-connection-status.png',fullPage:true});
 console.log('Notification taps wait for rider PIN login, then open the authenticated inbox; repeated app locking preserves the destination.');
}finally{await browser.close();await f.close();}

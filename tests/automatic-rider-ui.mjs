import {configuredRoute} from './rider-route-fixture.mjs';
import {chromium} from 'playwright-core';
import {pbkdf2Sync} from 'node:crypto';
import assert from 'node:assert/strict';
import {adminFixture,vendorProfile,riderProfile} from './admin-fixture.mjs';
import {newTransport} from '../web/lifecycle.mjs';
const f=await adminFixture(),browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
try{
 const vendor=await f.account('vendor',vendorProfile),rider=await f.account('rider',riderProfile);await f.identity('rider',rider);
 const routeId=await configuredRoute(f,{origin:'Zaria',originState:'Kaduna',destination:'Kaduna',destinationState:'Kaduna',deliveryType:'intrastate',deliveryFee:'1000'});
 const local=newTransport({routeId,sender:vendorProfile.businessName,recipient:'Sample Customer',phone:'08011112222',description:'Automatic delivery',origin:'Zaria',originState:'Kaduna',destination:'Kaduna',destinationState:'Kaduna',address:'Test address',deliveryType:'intrastate',deliveryFee:'1000'},vendorProfile.businessName);
 const s=await(await f.api('/api/v3/shipments',local,{token:vendor.token})).json();await f.api(`/api/v3/shipments/${s.id}/pay`,{email:'sample@example.test'},{token:vendor.token});await f.api(`/api/v3/shipments/${s.id}/verify-payment`,{},{token:vendor.token});
 const job=null;
 const salt='automatic-rider-ui',pin={salt,hash:pbkdf2Sync('836492',salt,210000,32,'sha256').toString('hex'),attempts:0,lockedUntil:0};
 const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(({profile,pin,job,base,token,dispatch})=>{const record={role:'rider',profile,pin,connection:{base,token,verified:true},jobs:[]};localStorage.setItem('trackship-v1',JSON.stringify({accounts:{vendor:null,rider:profile},lastRole:'rider',deviceAccounts:{['rider:'+profile.phone]:record}}));window.trackingCalls=[];window.tracking=false;window.TrackShip={startTracking(...args){window.trackingCalls.push(args);window.tracking=true;},stopTracking(){window.tracking=false;},isTracking(){return window.tracking;},setNightMode(){},configureDeliveryAlerts(){},clearDeliveryAlerts(){}};},{profile:rider.profile,pin,job,base:f.base,token:rider.token,dispatch:s.jobTokens.pickup});
 await page.goto(f.base+'/app');await page.locator('#loginPin').fill('836492');await page.getByRole('button',{name:'Log in',exact:true}).click();await page.getByRole('heading',{name:'Incoming deliveries',exact:true}).waitFor();
 assert.equal(await page.evaluate(()=>window.tracking),false);
 await page.getByRole('button',{name:'Routes and availability',exact:true}).click();await page.locator('#rider-route-preferences').waitFor();await page.locator('input[name=route][value="'+routeId+':forward"]').check();await page.locator('input[name=available]').check();await page.getByRole('button',{name:'Save route availability',exact:true}).click();await page.waitForFunction(()=>!document.querySelector('#rider-route-preferences button')?.disabled);await page.waitForTimeout(150);const selected=await(await f.api('/api/v4/rider/routes',undefined,{token:rider.token})).json();assert.equal(selected.selected[0].routeId,routeId);assert.equal(selected.available,true);await page.getByRole('button',{name:'Home',exact:true}).click();
 await page.getByRole('button',{name:'Accept delivery',exact:true}).click();await page.locator('#pickup-received').waitFor();await page.waitForFunction(()=>window.trackingCalls.length===1);
 assert.equal(await page.locator('#gps-start,#gps-stop,#sync').count(),0);
 await page.locator('#pickup-received').check();await page.getByRole('button',{name:'Collect parcel',exact:true}).click();await page.getByRole('button',{name:'Send delivery OTP to customer',exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:'Start delivery',exact:true}).count(),0);
 const current=await(await f.api('/api/shipments/'+s.id,undefined,{token:vendor.token})).json();assert.equal(current.status,'Out for delivery');
 await page.getByRole('button',{name:'Send delivery OTP to customer',exact:true}).click();await page.locator('[name=deliveryOtp]').waitFor();const otp=f.texts.at(-1).message.match(/\b\d{6}\b/)[0];await page.locator('[name=deliveryOtp]').fill(otp);await page.getByRole('button',{name:'Confirm customer OTP',exact:true}).click();await page.waitForFunction(()=>!window.tracking);assert.equal((await(await f.api('/api/track/'+s.publicToken)).json()).location,null);
 assert.deepEqual(errors,[]);console.log('PASS: rider route availability gates offers; accepting starts GPS automatically, no manual GPS/sync controls, collection starts delivery, route availability can be saved, customer OTP completes delivery and native tracking stops. Native bridge simulated; not a physical-phone GPS test.');
}finally{await browser.close();await f.close();}

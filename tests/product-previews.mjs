// Capture actual app components in an isolated database; never contact production or invent GPS.
import {chromium} from 'playwright-core';
import {pbkdf2Sync,createHash} from 'node:crypto';
import {adminFixture} from './admin-fixture.mjs';
import {newTransport} from '../web/lifecycle.mjs';
const f=await adminFixture(),browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
const vendorProfile={businessName:'Sample Studio',ownerName:'Sample Vendor',phone:'08012345678',city:'Abuja',state:'FCT Abuja',community:'Wuse',pickupAddress:'Sample pickup address, Wuse'};
const riderProfile={fullName:'Sample Rider',phone:'08098765432',city:'Abuja',state:'FCT Abuja',community:'Wuse',vehicle:'Bicycle'};
try{
 const vendor=await f.account('vendor',vendorProfile),rider=await f.account('rider',riderProfile),owner=(await f.server.database.prepare('SELECT owner_key FROM vendor_accounts WHERE id=?').get(vendor.profile.id)).owner_key;
 const base=newTransport({sender:'Sample Studio',recipient:'Sample Customer',phone:'08011112222',description:'Sample clothing order',origin:'Abuja',originState:'FCT Abuja',destination:'Garki',destinationState:'FCT Abuja',address:'Sample delivery address, Garki',pickupAddress:vendorProfile.pickupAddress,deliveryType:'intrastate',deliveryFee:'2500',rider:'Sample Rider',riderPhone:riderProfile.phone},'Sample Studio');base.code='SAMPLE-001';base.fees={pickup:250000};base.payment={status:'paid',mode:'test',amount:250000};base.location=null;base.locationConsent=null;
 await f.server.database.prepare('INSERT INTO shipments(id,owner,public_hash,payload) VALUES (?,?,?,?)').run(base.id,owner,createHash('sha256').update(base.publicToken).digest('hex'),JSON.stringify(base));
 for(const role of ['vendor','rider']){
  const profile=role==='vendor'?vendorProfile:riderProfile,shipment=structuredClone(base),at=Date.now();
  shipment.events=[{id:crypto.randomUUID(),status:'Created',leg:'vendor',actorName:'Sample Studio',note:'Sample shipment created',at:new Date(at-3600000).toISOString()}];
  if(role==='rider'){shipment.status='Rider accepted';shipment.actors={pickup:{id:rider.profile.id,name:'Sample Rider'}};shipment.jobLeg='pickup';shipment.events.push({id:crypto.randomUUID(),status:'Rider accepted',leg:'pickup',actorName:'Sample Rider',note:'Sample assigned delivery · not yet collected',at:new Date(at-1800000).toISOString()});}
  await f.server.database.prepare('UPDATE shipments SET payload=? WHERE id=?').run(JSON.stringify(shipment),shipment.id);
  const salt='fictional-preview-pin',pin='724918',hash=pbkdf2Sync(pin,salt,210000,32,'sha256').toString('hex');
  const page=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:1,reducedMotion:'reduce'});
  await page.route('https://tile.openstreetmap.org/**',route=>route.abort());
  await page.addInitScript(({role,profile,shipment,salt,hash,vendorToken,riderToken,base})=>localStorage.setItem('trackship-v1',JSON.stringify({activeRole:role,accounts:{vendor:role==='vendor'?profile:null,rider:role==='rider'?profile:null},profile:{name:role==='vendor'?profile.businessName:'',phone:role==='vendor'?profile.phone:''},shipments:role==='vendor'?[shipment]:[],riderJobs:role==='rider'?[shipment]:[],connection:role==='vendor'?{base,token:vendorToken,verified:true}:null,riderConnection:role==='rider'?{base,token:riderToken,profile:{id:shipment.actors.pickup.id,displayName:'Sample Rider',identityStatus:'submitted'}}:null,deviceLock:{salt,hash,attempts:0,lockedUntil:0}})),{role,profile,shipment,salt,hash,vendorToken:vendor.token,riderToken:rider.token,base:f.base});
  await page.goto(f.base+'/app');await page.locator('#local-login').waitFor();await page.getByLabel('6-digit app PIN').fill(pin);await page.locator('#local-login button').click();await page.getByRole('heading',{name:role==='vendor'?'Sample Studio':'Sample Rider',exact:true}).waitFor();
  const capture=async stage=>{await page.evaluate(()=>document.fonts.ready);await page.screenshot({path:`web/assets/demo-${role}-${stage}.jpg`,type:'jpeg',quality:91,animations:'disabled'});};
  await page.screenshot({path:`web/assets/product-${role}.jpg`,type:'jpeg',quality:91,animations:'disabled'});
  if(role==='vendor'){await capture('dashboard');await page.getByRole('button',{name:'Send package',exact:true}).click();await page.getByLabel('Package description',{exact:false}).fill('Sample clothing order');await page.getByLabel('Declared value (optional)').fill('15000');await page.getByLabel('Special instructions').fill('Sample journey · keep parcel dry');await capture('create');await page.getByRole('button',{name:'Home',exact:true}).click();}else await capture('jobs');
  await page.locator('[data-open]').first().click();await page.getByRole('heading',{name:'Shipment details',exact:true}).waitFor();await capture('details');
  const tracked={...shipment,status:'Out for delivery',custodian:'pickup',actors:{pickup:{id:rider.profile.id,name:'Sample Rider'}},location:null,locationConsent:null,events:[{id:crypto.randomUUID(),status:'Created',leg:'vendor',actorName:'Sample Studio',note:'Sample shipment created',at:new Date(at-3600000).toISOString()},{id:crypto.randomUUID(),status:'Rider accepted',leg:'pickup',actorName:'Sample Rider',note:'Sample rider assignment',at:new Date(at-1800000).toISOString()},{id:crypto.randomUUID(),status:'Picked up',leg:'pickup',actorName:'Sample Rider',note:'Sample collection checkpoint',at:new Date(at-900000).toISOString()},{id:crypto.randomUUID(),status:'Out for delivery',leg:'pickup',actorName:'Sample Rider',note:'Sample final delivery checkpoint',at:new Date(at-600000).toISOString()}]};
  await f.server.database.prepare('UPDATE shipments SET payload=? WHERE id=?').run(JSON.stringify(tracked),tracked.id);
  await page.goto(f.base+'/t/'+shipment.publicToken);await page.getByRole('heading',{name:'Your delivery, in view.',exact:true}).waitFor();await capture('tracking');await page.close();
 }
 console.log('Captured actual current vendor dashboard/create/details/tracking and separate rider screens. Same fictional SAMPLE-001, sample accounts, test payment, no GPS or production calls.');
}finally{await browser.close();await f.close();}

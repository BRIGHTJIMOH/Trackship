import {test} from 'node:test';
import assert from 'node:assert/strict';
import {newShipment,addEvent,validateShipment,publicShipment,canTransition} from '../web/core.mjs';
const fields={sender:'Bright Stores',recipient:'Ada Obi',phone:'08012345678',origin:'Abuja',destination:'Lagos',address:'10 Marina Road',description:'Ankara dresses',rider:'Chika',riderPhone:'08088888888',notes:'Call on arrival'};
test('creates unique shipments and private tracking tokens',()=>{const a=newShipment(fields,'Bright Stores'),b=newShipment(fields,'Bright Stores');assert.notEqual(a.id,b.id);assert.notEqual(a.publicToken,b.publicToken);assert.equal(a.publicToken.length,64);assert.equal(a.status,'Created');assert.equal(a.events.length,1);assert.equal(a.dirty,true);});
test('requires valid shipment details and phone numbers',()=>{assert.ok(validateShipment({...fields,recipient:''}).length);assert.ok(validateShipment({...fields,phone:'123'}).length);assert.ok(validateShipment({...fields,address:'a'.repeat(241)}).length);assert.equal(validateShipment(fields).length,0);});
test('delivery must progress in order and terminal states cannot change',()=>{let s=newShipment(fields,'Bright');assert.throws(()=>addEvent(s,'Delivered'));for(const next of ['Picked up','In transit','Out for delivery','Delivered'])s=addEvent(s,next,'Confirmed by rider');assert.equal(s.events.length,5);assert.throws(()=>addEvent(s,'Cancelled'));assert.equal(canTransition('Cancelled','Picked up'),false);});
test('cancellation closes a shipment',()=>{const s=addEvent(newShipment(fields,'Bright'),'Cancelled');assert.equal(s.status,'Cancelled');assert.throws(()=>addEvent(s,'Picked up'));});
test('public tracking never exposes private customer data or checkpoint notes',()=>{const s=addEvent(newShipment(fields,'Bright'),'Picked up','Private gate code 1234');const p=publicShipment(s);for(const k of ['recipient','phone','address','riderPhone','sender','notes','publicToken','id'])assert.equal(k in p,false);assert.equal(JSON.stringify(p).includes('1234'),false);assert.equal(p.events[1].status,'Picked up');});
test('backup validation rejects malformed IDs, private access URLs and broken history',async()=>{
 const {validateBackup}=await import('../web/core.mjs');
 const d={profile:{name:'Bright',phone:''},connection:null,shipments:[newShipment(fields,'Bright')]};assert.equal(validateBackup(d),true);
 const b=structuredClone(d);b.shipments[0].id='"><img src=x>';assert.equal(validateBackup(b),false);
 const c=structuredClone(d);c.connection={base:'https://user:password@example.com',token:'a'.repeat(64)};assert.equal(validateBackup(c),false);
 const e=structuredClone(d);e.shipments[0].events[0].status='Delivered';assert.equal(validateBackup(e),false);
});
test('vendor and rider onboarding require different details and valid Nigerian phones',async()=>{
 const {validateOnboarding}=await import('../web/core.mjs');
 const vendor={businessName:'Bright Stores',ownerName:'Bright Jimoh',phone:'08012345678',city:'Abuja',pickupAddress:'Wuse Market'};
 const rider={fullName:'Chika Obi',phone:'+2348098765432',city:'Abuja',vehicle:'Motorcycle',plate:'ABC-123-DE'};
 assert.deepEqual(validateOnboarding('vendor',vendor),[]);assert.deepEqual(validateOnboarding('rider',rider),[]);
 assert.ok(validateOnboarding('vendor',rider).length);assert.ok(validateOnboarding('rider',vendor).length);
 assert.ok(validateOnboarding('rider',{...rider,plate:''}).length);assert.deepEqual(validateOnboarding('rider',{...rider,vehicle:'Bicycle',plate:''}),[]);
 assert.ok(validateOnboarding('vendor',{...vendor,phone:'123'}).length);
});
test('legacy data migration preserves shipments and asks for onboarding',async()=>{
 const {upgradeData}=await import('../web/core.mjs');const s=newShipment(fields,'Bright');const old={profile:{name:'Bright',phone:''},shipments:[s],connection:null};
 const d=upgradeData(old);assert.equal(d.shipments[0].id,s.id);assert.equal(d.activeRole,null);assert.equal(d.accounts.vendor,null);assert.equal(d.profile.name,'Bright');
});
test('rider workspace filters local deliveries by normalized assigned phone',async()=>{
 const {visibleShipments,upgradeData}=await import('../web/core.mjs');
 const assigned=newShipment({...fields,riderPhone:'08098765432'},'Bright');const other=newShipment({...fields,riderPhone:'08012345678'},'Bright');
 const d=upgradeData({shipments:[assigned,other],accounts:{rider:{phone:'+2348098765432'}}});assert.deepEqual(visibleShipments(d,'rider').map(s=>s.id),[assigned.id]);assert.equal(visibleShipments(d,'vendor').length,2);
});
test('history reconciliation distinguishes rider updates, queued vendor updates and conflicts',async()=>{
 const {historyRelation}=await import('../web/core.mjs');const s=newShipment(fields,'Bright');const next=addEvent(s,'Picked up');
 assert.equal(historyRelation(s,next),'remote');assert.equal(historyRelation(next,s),'local');assert.equal(historyRelation(s,s),'equal');assert.equal(historyRelation(next,addEvent(s,'Picked up','Different checkpoint')),'conflict');
});

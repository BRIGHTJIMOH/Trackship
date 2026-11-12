import {createHash,randomUUID} from 'node:crypto';
const digest=value=>createHash('sha256').update(value).digest('hex');
const fail=(message,status=400)=>{throw Object.assign(Error(message),{status});};
export function testShipments(db,{authorize,body}){
 async function inspect(id){
  const row=await db.prepare('SELECT payload FROM shipments WHERE id=?').get(id);if(!row)fail('Shipment not found.',404);const s=JSON.parse(row.payload);
  const live=await db.prepare("SELECT reference FROM payments WHERE shipment_id=? AND mode='live' LIMIT 1").get(id),earning=await db.prepare("SELECT id FROM earnings WHERE shipment_id=? AND mode='live' LIMIT 1").get(id);
  const reason=s.testRemoval?'Already removed.':s.payment?.holdId?'Wallet-linked shipments must be retained and resolved through Money controls.':s.payment?.mode==='live'||live||earning?'Live payment or earnings records protect this shipment.':s.payment?.status==='paid'&&!['test','wallet_mock'].includes(s.payment?.mode)?'Payment mode is not confirmed as test.':null;
  return {s,reason};
 }
 const idsFrom=input=>{if(!Array.isArray(input.ids)||!input.ids.length||input.ids.length>50||input.ids.some(id=>typeof id!=='string'||!/^[a-f0-9-]{36}$/.test(id)))fail('Select 1–50 valid shipments.');return [...new Set(input.ids)];};
 return async function route(req,url,send){
  const path=url.pathname;
  if(path==='/api/admin/test-shipments/enable-dispatch'&&req.method==='POST'){
   const admin=await authorize(req,{operator:false}),input=await body(req),ids=idsFrom(input),reason=String(input.reason||'').trim();
   if(input.confirmTestData!==true||reason.length<3||reason.length>300)fail('Confirm test data and enter a reason.');
   await db.exec('BEGIN IMMEDIATE');try{
    const records=[];for(const id of ids){const {s,reason:blocked}=await inspect(id);if(blocked)fail(blocked,409);if(s.status!=='Created')fail('Only unaccepted test shipments can be enabled.',409);if(['paid','held'].includes(s.payment?.status)&&!s.payment?.simulated)fail('This shipment already has funding.',409);records.push(s);}
    for(const s of records){if(s.payment?.simulated)continue;const at=new Date().toISOString();
     const next={...s,payment:{status:'paid',mode:'test',simulated:true,amount:0,reference:'test-dispatch:'+s.id,paidAt:at},events:[...(s.events||[]),{id:randomUUID(),status:s.status,at,note:'Test delivery enabled by owner; no payment collected',actorName:admin.actor}]};
     await db.prepare('UPDATE shipments SET payload=? WHERE id=?').run(JSON.stringify(next),s.id);
     await db.prepare('INSERT INTO admin_audit(id,actor,action,entity,entity_id,summary,created) VALUES (?,?,?,?,?,?,?)').run(randomUUID(),admin.actor,'shipment.test_dispatch_enabled','shipment',s.id,reason,Date.now());
    }
    await db.exec('COMMIT');send(200,{count:records.length,testOnly:true});return true;
   }catch(error){await db.exec('ROLLBACK');throw error;}
  }
  if(['/api/admin/test-shipments/preview','/api/admin/test-shipments/remove','/api/admin/test-shipments/restore'].includes(path)&&req.method==='POST'){
   const admin=await authorize(req,{operator:false}),input=await body(req),ids=idsFrom(input);
   if(path.endsWith('/preview')){const records=[];for(const id of ids){const {s,reason}=await inspect(id);records.push({id:s.id,code:s.code,status:s.status,paymentMode:s.payment?.mode||null,eligible:!reason,reason});}send(200,{records});return true;}
   const restore=path.endsWith('/restore');if(!restore&&(input.confirmTestData!==true||input.confirmation!=='DELETE TEST SHIPMENTS'))fail('Confirm that the selected records are test shipments.');
   const reason=String(input.reason||'').trim();if(reason.length<3||reason.length>300)fail('Enter a reason from 3 to 300 characters.');
   await db.exec('BEGIN IMMEDIATE');try{
    const records=[];for(const id of ids){const result=await inspect(id);if(restore){if(!result.s.testRemoval)fail('This shipment is not in deleted tests.',409);}else if(result.reason)fail(result.s.code+': '+result.reason,409);records.push(result.s);}
    for(const s of records){const at=new Date().toISOString();let next;
     if(restore){const {testRemoval,...rest}=s;next={...rest,status:'Cancelled',location:null,locationConsent:null};}
     else next={...s,status:'Cancelled',location:null,locationConsent:null,testRemoval:{at,actor:admin.actor,reason},events:[...(s.events||[]),{id:randomUUID(),status:'Cancelled',at,note:'Test shipment removed by owner',actorName:admin.actor}]};
     await db.prepare('UPDATE shipments SET payload=? WHERE id=?').run(JSON.stringify(next),s.id);
     await db.prepare('UPDATE delivery_notifications SET seen=1 WHERE shipment_id=?').run(s.id);
     await db.prepare('INSERT INTO admin_audit(id,actor,action,entity,entity_id,summary,created) VALUES (?,?,?,?,?,?,?)').run(randomUUID(),admin.actor,restore?'shipment.test_restored':'shipment.test_removed','shipment',s.id,reason,Date.now());
    }
    await db.exec('COMMIT');send(200,{count:records.length,restored:restore});return true;
   }catch(error){await db.exec('ROLLBACK');throw error;}
  }
  // Disable only removed-test links/actions, while retaining records for audit.
  const id=path.match(/^\/api\/(?:v3\/)?shipments\/([a-f0-9-]{36})(?:\/|$)/)?.[1],tracking=path.match(/^\/api\/track\/([a-f0-9]{64})$/)?.[1],job=path.match(/^\/api\/(?:v3\/jobs|rider)\/([a-f0-9]{64})(?:\/|$)/)?.[1];
  let row;if(id)row=await db.prepare('SELECT payload FROM shipments WHERE id=?').get(id);
  else if(tracking)row=await db.prepare('SELECT payload FROM shipments WHERE public_hash=?').get(digest(tracking));
  else if(job){const token=await db.prepare('SELECT shipment_id FROM job_tokens WHERE token_hash=?').get(digest(job));row=token?await db.prepare('SELECT payload FROM shipments WHERE id=?').get(token.shipment_id):await db.prepare('SELECT payload FROM shipments WHERE rider_hash=?').get(digest(job));}
  if(row&&JSON.parse(row.payload).testRemoval){send(410,{error:'This test shipment was removed by the owner.',code:'TEST_SHIPMENT_REMOVED'});return true;}
  return false;
 };
}

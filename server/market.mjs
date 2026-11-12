import {testDispatchMode,canTestDispatch,simulatedDelivery} from './test-dispatch.mjs';
import {dispatchMatchReasons} from './dispatch-match.mjs';
import {vehicleMatches,VEHICLE_TYPES,kgToGrams} from '../web/vehicles.mjs';
import { randomUUID } from 'node:crypto';
const normalize = s => String(s || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
const fail = (message, status = 400) => {
  const e = new Error(message);
  e.status = status;
  throw e;
};
export async function marketplace(db, {
  body,
  walletHolds,
  rider,
  getShipment,
  putShipment,
  append,
  jobView,
  providers,
  env
}) {
  if (!(await db.prepare('PRAGMA table_info(rider_profiles)').all()).some(c => c.name === 'identity_format')) await db.exec('ALTER TABLE rider_profiles ADD COLUMN identity_format INTEGER DEFAULT 1');
  await db.exec('CREATE TABLE IF NOT EXISTS delivery_notifications(id TEXT PRIMARY KEY,rider_id TEXT,shipment_id TEXT,phase TEXT,title TEXT,body TEXT,seen INTEGER DEFAULT 0,created INTEGER,UNIQUE(rider_id,shipment_id,phase))');
  const open = async () => (await db.prepare('SELECT payload FROM shipments').all()).map(r => JSON.parse(r.payload)).filter(s => s.workflowVersion === 3 && s.status === 'Created' && Date.now() - Date.parse(s.createdAt) < 7 * 86400000);
  const allShipments=async()=>(await db.prepare('SELECT payload FROM shipments').all()).map(row=>JSON.parse(row.payload)).filter(s=>!s.testRemoval);
  const activeFor=(r,all)=>all.filter(j=>!['Delivered','Cancelled'].includes(j.status)&&Object.entries(j.actors||{}).some(([leg,actor])=>actor.id===r.id&&(j.custodian===leg||j.status==='Rider accepted'))).length;
  async function eligible(r,s){return dispatchMatchReasons(r,s,{activeCount:activeFor(r,await allShipments()),capacity:Number(env.TRACKSHIP_RIDER_CAPACITY||5)}).length===0;}
  const preview = s => ({
    id: s.id,
    code: s.code,
    business: s.business,
    description: s.description,
    origin: s.origin,
    originState: s.originState,
    community: s.pickupCommunity || '',
    destination: s.destination,
    destinationState: s.destinationState,
    deliveryType: s.deliveryType,
    pickupFeeKobo: s.fees.pickup,
    vehicleClass:s.vehicleClass||null,
    weightKg:s.weightKg||null,
    paymentStatus: s.payment.status,
    testDispatch: s.payment.simulated===true,
    match: 'service-area',
    createdAt: s.createdAt
  });
  async function notify(s, phase = 'created') {
    const testAvailable=!walletHolds&&!(providers.paymentReady&&providers.mode==='live')&&await testDispatchMode(db)&&await canTestDispatch(db,s);
    const rows = await db.prepare("SELECT * FROM rider_profiles WHERE identity_status IN ('submitted','approved') AND identity_format>=4").all();
    let count = 0;
    const sends = [];
    for (const r of rows) {
      if (!(await eligible(r, s))) continue;
      const id = randomUUID();
      const title = phase === 'ready' ? 'Delivery ready for pickup' : 'New shipment in your pickup area';
      const text = `${s.business} · ${s.pickupCommunity || s.origin}, ${s.originState}. ${testAvailable?'Test delivery — no payment required.':phase === 'ready' ? 'Payment confirmed.' : 'Awaiting vendor payment.'} Open SendRack nearby deliveries.`;
      const inserted = await db.prepare('INSERT OR IGNORE INTO delivery_notifications(id,rider_id,shipment_id,phase,title,body,created) VALUES (?,?,?,?,?,?,?)').run(id, r.id, s.id, phase, title, text, Date.now());
      if (!inserted.changes) continue;
      count++;
      if (env.TRACKSHIP_SEND_JOB_SMS === 'true' && providers.smsReady && sends.length < 20) sends.push(providers.sms(r.phone, title + '. ' + text));
    }
    await Promise.allSettled(sends);
    return count;
  }
  async function notificationsFor(r){const rows=await db.prepare('SELECT n.id,n.shipment_id AS "shipmentId",n.title,n.body,n.seen,n.created,s.payload AS shipment_payload FROM delivery_notifications n LEFT JOIN shipments s ON s.id=n.shipment_id WHERE n.rider_id=? ORDER BY n.created DESC LIMIT 100').all(r.id);return rows.filter(n=>!n.shipment_payload||!JSON.parse(n.shipment_payload).testRemoval).map(({shipment_payload,...n})=>n);}
  async function matchingOffers(r,{recover=false}={}){
   const testMode=!walletHolds&&!(providers.paymentReady&&providers.mode==='live')&&await testDispatchMode(db);
   const all=await allShipments(),activeCount=activeFor(r,all),matched=[],known=recover?new Set((await db.prepare("SELECT shipment_id FROM delivery_notifications WHERE rider_id=? AND phase='created'").all(r.id)).map(n=>n.shipment_id)):null;
   for(const s of all){if(dispatchMatchReasons(r,s,{activeCount,capacity:Number(env.TRACKSHIP_RIDER_CAPACITY||5)}).length)continue;
    const testAvailable=testMode&&await canTestDispatch(db,s);matched.push({...preview(s),testDispatchAvailable:testAvailable});
    if(recover&&!known.has(s.id)){const ready=['paid','held'].includes(s.payment?.status)||testAvailable;await db.prepare('INSERT OR IGNORE INTO delivery_notifications(id,rider_id,shipment_id,phase,title,body,created) VALUES (?,?,?,?,?,?,?)').run(randomUUID(),r.id,s.id,'created','New shipment in your pickup area',`${s.business} · ${s.origin}, ${s.originState}. ${ready?'Ready to accept.':'Awaiting vendor payment.'} Open SendRack delivery offers.`,Date.now());}
   }return matched;
  }
  async function diagnostics(shipmentId,riderId){
   const all=await allShipments(),riders=await db.prepare('SELECT id,display_name,public_profile,phone,identity_status,identity_format,suspended FROM rider_profiles').all();
   if(!shipmentId&&!riderId)return {shipments:all.sort((a,b)=>Date.parse(b.createdAt)-Date.parse(a.createdAt)).slice(0,100).map(s=>({id:s.id,code:s.code,status:s.status})),riders:riders.map(r=>({id:r.id,name:r.display_name}))};
   const s=all.find(s=>s.id===shipmentId),r=riders.find(r=>r.id===riderId);if(!s||!r)fail('Select an existing shipment and rider.',404);
   const reasons=dispatchMatchReasons(r,s,{activeCount:activeFor(r,all),capacity:Number(env.TRACKSHIP_RIDER_CAPACITY||5)});let profile={};try{profile=JSON.parse(r.public_profile||'{}');}catch{}
   const notice=await db.prepare('SELECT COUNT(*) AS total FROM delivery_notifications WHERE shipment_id=? AND rider_id=?').get(s.id,r.id),devices=await db.prepare('SELECT COUNT(*) AS total FROM push_installations i JOIN rider_sessions session ON session.token_hash=i.session_hash WHERE i.rider_id=? AND i.enabled=1 AND session.expires>?').get(r.id,Date.now());
   return {matches:reasons.length===0,reasons,shipment:{code:s.code,status:s.status,pickupCity:s.origin,pickupState:s.originState,vehicle:s.vehicleClass||'any',weightKg:s.weightKg||null,paymentStatus:s.payment?.status},rider:{name:r.display_name,city:profile.city,state:profile.state,vehicle:profile.vehicle,identityStatus:r.identity_status,identityFormat:r.identity_format},notifications:Number(notice.total),activeDevices:Number(devices.total)};
  }
  return {
    notify,diagnostics,
    matchesVehicle:(r,s)=>{try{return vehicleMatches(JSON.parse(r.public_profile||'{}'),s);}catch{return false;}},
    eligible,
    async route(req, path, send) {
      if(path==='/api/v4/rider/dispatch/sync'&&req.method==='POST'){
       const r=await rider(req);await body(req);const offers=await matchingOffers(r,{recover:true});
       send(200,{offers,notifications:await notificationsFor(r),identityRequired:r.identity_format<4||!['submitted','approved'].includes(r.identity_status)});return true;
      }
      if (path === '/api/v4/rider/offers' && req.method === 'GET') {
        const r = await rider(req);
        send(200, {
          offers: await matchingOffers(r),
          matching: 'registered service area',
          identityRequired: r.identity_format < 4
        });
        return true;
      }
      if (path === '/api/v4/rider/area' && req.method === 'POST') {
        const r = await rider(req);
        const p = await body(req);
        if (typeof p.city !== 'string' || !p.city.trim() || p.city.length > 80 || typeof p.state !== 'string' || !p.state.trim() || p.state.length > 80 || typeof p.community !== 'string' || p.community.length > 80) fail('Enter a delivery city, state and community.');
        if(p.vehicle&&!VEHICLE_TYPES.includes(p.vehicle))fail('Choose a supported vehicle.');
        try{kgToGrams(p.maxLoadKg);}catch(e){fail(e.message);}
        const current = JSON.parse(r.public_profile || '{}');
        await db.prepare('UPDATE rider_profiles SET public_profile=? WHERE id=?').run(JSON.stringify({
          ...current,
          city: p.city.trim(),
          state: p.state.trim(),
          community: p.community.trim(),
          vehicle: p.vehicle || current.vehicle,
          ...(p.maxLoadKg!==undefined?{maxLoadKg:p.maxLoadKg}:{})
        }), r.id);
        send(200, {
          saved: true
        });
        return true;
      }
      if (path === '/api/v4/rider/notifications' && req.method === 'GET') {
        const r = await rider(req);
        send(200, {
          notifications: await notificationsFor(r)
        });
        return true;
      }
      if (path === '/api/v4/rider/notifications/read' && req.method === 'POST') {
        const r = await rider(req);
        const p = await body(req);
        if (!Array.isArray(p.ids) || p.ids.length > 100) fail('Invalid notification references.');
        for (const id of p.ids) await db.prepare('UPDATE delivery_notifications SET seen=1 WHERE id=? AND rider_id=?').run(String(id), r.id);
        send(200, {
          read: true
        });
        return true;
      }
      const match = path.match(/^\/api\/v4\/rider\/offers\/([a-f0-9-]+)\/accept$/);
      if (match && req.method === 'POST') {
        const r = await rider(req);
        await body(req);
        let s;
        await db.exec('BEGIN IMMEDIATE');
        try {
          s = await getShipment(match[1]);
          if (!s || s.status !== 'Created') fail('Another rider already accepted this delivery.', 409);
          if (!(await eligible(r, s))) fail('This delivery does not match your identity or pickup area.', 403);
          if(!['paid','held'].includes(s.payment.status)&&!walletHolds&&!(providers.paymentReady&&providers.mode==='live')&&await testDispatchMode(db)&&await canTestDispatch(db,s)){
           s=simulatedDelivery(s,'SendRack test mode');await db.prepare('INSERT INTO admin_audit(id,actor,action,entity,entity_id,summary,created) VALUES (?,?,?,?,?,?,?)').run(randomUUID(),'rider:'+r.id,'shipment.test_dispatch_enabled','shipment',s.id,'Owner-enabled test mode; no payment collected',Date.now());
          }
          if (!['paid','held'].includes(s.payment.status)) fail('The vendor must pay before this delivery can be accepted.', 409);
          const previous=s;
          s = append({
            ...s,
            actors: {
              ...s.actors,
              pickup: {
                id: r.id,
                name: r.display_name
              }
            }
          }, 'Rider accepted', 'pickup', r, 'Accepted from the nearby delivery board');
          if(walletHolds)await walletHolds.onTransitionInTransaction(db.currentPostgresClient(),previous,s);
          await putShipment(s);
          await db.exec('COMMIT');
        } catch (e) {
          await db.exec('ROLLBACK');
          throw e;
        }
        send(200, {
          ...jobView(s, 'pickup'),
          dispatchToken: s.jobTokens.pickup
        });
        return true;
      }
      return false;
    }
  };
}

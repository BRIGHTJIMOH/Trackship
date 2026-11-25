import {notificationView,reactionAccessible,isReactionPhase} from './push/reaction-notifications.mjs';
import {matchRiderColumns,normalizeMatch,activeAssignmentCount} from './shipment-index.mjs';
const lagosDay=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Lagos',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
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
  await db.exec(`CREATE TABLE IF NOT EXISTS rider_route_preferences(rider_id TEXT NOT NULL,route_id TEXT NOT NULL,direction TEXT NOT NULL CHECK(direction IN ('forward','reverse')),route_revision INTEGER NOT NULL,available INTEGER NOT NULL DEFAULT 1 CHECK(available IN (0,1)),PRIMARY KEY(rider_id,route_id,direction))`);
  await db.exec('CREATE TABLE IF NOT EXISTS rider_route_days(rider_id TEXT PRIMARY KEY,day TEXT NOT NULL,updated INTEGER NOT NULL)');
  await db.exec('CREATE INDEX IF NOT EXISTS rider_routes_match ON rider_route_preferences(route_id,available,rider_id);CREATE INDEX IF NOT EXISTS notifications_account_created ON delivery_notifications(rider_id,created,id);');
  async function routeReasons(r,s){
    if(!s.routeId)return ['shipment-route-missing'];
    const day=await db.prepare('SELECT day FROM rider_route_days WHERE rider_id=?').get(r.id);if(day?.day!==lagosDay())return ['route-day-not-confirmed'];
    const route=await db.prepare('SELECT * FROM admin_routes WHERE id=? AND active=1').get(s.routeId);
    if(!route)return ['route-inactive-or-removed'];
    const forward=normalize(s.origin)===normalize(route.origin_city)&&s.originState===route.origin_state&&normalize(s.destination)===normalize(route.destination_city)&&s.destinationState===route.destination_state;
    const reverse=Boolean(route.bidirectional)&&normalize(s.origin)===normalize(route.destination_city)&&s.originState===route.destination_state&&normalize(s.destination)===normalize(route.origin_city)&&s.destinationState===route.origin_state;
    const directions=[...(forward?['forward']:[]),...(reverse?['reverse']:[])];
    if(!directions.length||s.deliveryType!==route.delivery_type)return ['shipment-route-mismatch'];
    const selected=await db.prepare('SELECT direction,route_revision,available FROM rider_route_preferences WHERE rider_id=? AND route_id=?').all(r.id,route.id);
    if(!selected.length)return ['route-not-selected'];
    const available=selected.filter(p=>p.available);if(!available.length)return ['route-unavailable-today'];
    // Identical local endpoints match both directions of this same configured route.
    // Different endpoints and one-way routes still require the exact permitted direction.
    const matching=available.filter(p=>directions.includes(p.direction));if(!matching.length)return ['route-direction-mismatch'];
    if(!matching.some(p=>p.route_revision===route.revision))return ['route-selection-outdated'];
    return [];
  }
  async function eligible(r,s){if((await routeReasons(r,s)).length)return false;return dispatchMatchReasons(r,s,{activeCount:await activeAssignmentCount(db,r.id),capacity:Number(env.TRACKSHIP_RIDER_CAPACITY||5)}).length===0;}
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
    match: 'route-direction',
    createdAt: s.createdAt
  });
  async function notify(s, phase = 'created') {
    const testAvailable=!walletHolds&&!(providers.paymentReady&&providers.mode==='live')&&await testDispatchMode(db)&&await canTestDispatch(db,s);
    const rows = await db.prepare(`SELECT DISTINCT ${matchRiderColumns(db)} FROM rider_profiles r JOIN rider_match_index m ON m.id=r.id JOIN rider_route_preferences p ON p.rider_id=r.id JOIN rider_route_days d ON d.rider_id=r.id WHERE p.route_id=? AND p.available=1 AND d.day=? AND m.state=? AND m.city=? AND r.identity_status IN ('submitted','approved') AND r.identity_format>=4 AND COALESCE(r.suspended,0)=0`).all(s.routeId||'',lagosDay(),normalizeMatch(s.originState),normalizeMatch(s.origin));
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
  async function notificationsFor(r){const rows=await db.prepare(`SELECT n.id,n.shipment_id AS "shipmentId",n.title,n.body,n.phase,n.seen,n.created,s.payload AS shipment_payload FROM delivery_notifications n LEFT JOIN shipments s ON s.id=n.shipment_id WHERE n.rider_id=? AND n.account_role='rider' ORDER BY n.created DESC LIMIT 100`).all(r.id);return rows.filter(n=>{const s=n.shipment_payload?JSON.parse(n.shipment_payload):null;return (!s||!s.testRemoval)&&(!isReactionPhase(n.phase)||reactionAccessible(s,n.phase,'rider',r.id));}).map(({shipment_payload,...n})=>notificationView({...n,code:shipment_payload?JSON.parse(shipment_payload).code:null}));}
  async function matchingOffers(r,{recover=false}={}){
   const testMode=!walletHolds&&!(providers.paymentReady&&providers.mode==='live')&&await testDispatchMode(db);
   const all=(await db.prepare(`SELECT DISTINCT s.payload,i.created_at,i.id FROM shipment_index i JOIN shipments s ON s.id=i.id JOIN rider_route_preferences p ON p.route_id=i.route_id WHERE p.rider_id=? AND p.available=1 AND i.removed=0 AND i.workflow=3 AND i.status='Created' AND i.created_at>? ORDER BY i.created_at DESC,i.id DESC LIMIT 200`).all(r.id,new Date(Date.now()-7*86400000).toISOString())).map(row=>JSON.parse(row.payload)),activeCount=await activeAssignmentCount(db,r.id),matched=[],known=recover?new Set((await db.prepare("SELECT shipment_id FROM delivery_notifications WHERE rider_id=? AND account_role='rider' AND phase='created'").all(r.id)).map(n=>n.shipment_id)):null;
   for(const s of all){if((await routeReasons(r,s)).length||dispatchMatchReasons(r,s,{activeCount,capacity:Number(env.TRACKSHIP_RIDER_CAPACITY||5)}).length)continue;
    const testAvailable=testMode&&await canTestDispatch(db,s);matched.push({...preview(s),testDispatchAvailable:testAvailable});
    if(recover&&!known.has(s.id)){const ready=['paid','held'].includes(s.payment?.status)||testAvailable;await db.prepare('INSERT OR IGNORE INTO delivery_notifications(id,rider_id,shipment_id,phase,title,body,created) VALUES (?,?,?,?,?,?,?)').run(randomUUID(),r.id,s.id,'created','New shipment in your pickup area',`${s.business} · ${s.origin}, ${s.originState}. ${ready?'Ready to accept.':'Awaiting vendor payment.'} Open SendRack delivery offers.`,Date.now());}
   }return matched;
  }
  async function diagnostics(shipmentId,riderId){
   const all=(await db.prepare('SELECT s.payload FROM shipments s JOIN shipment_index i ON i.id=s.id WHERE i.removed=0'+(shipmentId?' AND i.id=?':'')+' ORDER BY i.created_at DESC,i.id DESC LIMIT 100').all(...(shipmentId?[shipmentId]:[]))).map(row=>JSON.parse(row.payload)),riders=await db.prepare('SELECT id,display_name,public_profile,phone,identity_status,identity_format,suspended FROM rider_profiles'+(riderId?' WHERE id=?':'')+' ORDER BY id LIMIT 200').all(...(riderId?[riderId]:[]));
   if(!shipmentId&&!riderId)return {shipments:all.sort((a,b)=>Date.parse(b.createdAt)-Date.parse(a.createdAt)).slice(0,100).map(s=>({id:s.id,code:s.code,status:s.status})),riders:riders.map(r=>({id:r.id,name:r.display_name}))};
   const s=all.find(s=>s.id===shipmentId),r=riders.find(r=>r.id===riderId);if(!s||!r)fail('Select an existing shipment and rider.',404);
   const reasons=[...dispatchMatchReasons(r,s,{activeCount:await activeAssignmentCount(db,r.id),capacity:Number(env.TRACKSHIP_RIDER_CAPACITY||5)}),...await routeReasons(r,s)];let profile={};try{profile=JSON.parse(r.public_profile||'{}');}catch{}
   const route=s.routeId?await db.prepare('SELECT name FROM admin_routes WHERE id=?').get(s.routeId):null,selectedRoutes=await db.prepare('SELECT a.name,p.direction,p.available,p.route_revision AS revision FROM rider_route_preferences p JOIN admin_routes a ON a.id=p.route_id WHERE p.rider_id=?').all(r.id);
   const notice=await db.prepare("SELECT COUNT(*) AS total FROM delivery_notifications WHERE shipment_id=? AND rider_id=? AND account_role='rider'").get(s.id,r.id),devices=await db.prepare(`SELECT COUNT(*) AS total FROM push_installations i JOIN rider_sessions session ON session.token_hash=i.session_hash WHERE i.rider_id=? AND i.account_role='rider' AND session.rider_id=i.rider_id AND i.enabled=1 AND session.expires>?`).get(r.id,Date.now());
   return {matches:reasons.length===0,reasons,shipment:{code:s.code,routeName:route?.name||null,status:s.status,pickupCity:s.origin,pickupState:s.originState,vehicle:s.vehicleClass||'any',weightKg:s.weightKg||null,paymentStatus:s.payment?.status},rider:{name:r.display_name,selectedRoutes,city:profile.city,state:profile.state,vehicle:profile.vehicle,identityStatus:r.identity_status,identityFormat:r.identity_format},notifications:Number(notice.total),activeDevices:Number(devices.total)};
  }
  return {
    notify,diagnostics,recover: r=>matchingOffers(r,{recover:true}),
    async canNotify({riderId,shipmentId,phase}){const s=await getShipment(shipmentId),r=await db.prepare('SELECT '+matchRiderColumns(db)+' FROM rider_profiles r WHERE r.id=?').get(riderId);if(!s||s.testRemoval||!r||r.suspended)return false;if(phase?.startsWith('status:'))return Object.values(s.actors||{}).some(a=>a?.id===riderId)&&(s.events||[]).some(e=>'status:'+(e.id||e.status+':'+e.at)===phase);return Boolean(s.status==='Created'&&await eligible(r,s));},

    matchesVehicle:(r,s)=>{try{return vehicleMatches(JSON.parse(r.public_profile||'{}'),s);}catch{return false;}},
    eligible,
    async route(req, path, send) {
      if(['/api/v4/rider/dispatch/feed','/api/v4/rider/dispatch/sync'].includes(path)&&req.method===(path.endsWith('/feed')?'GET':'POST')){
       const r=await rider(req);if(req.method==='POST')await body(req);const offers=await matchingOffers(r,{recover:req.method==='POST'});
       send(200,{offers,notifications:await notificationsFor(r),identityRequired:r.identity_format<4||!['submitted','approved'].includes(r.identity_status)});return true;
      }
      if(path==='/api/v4/rider/routes'&&['GET','POST'].includes(req.method)){
        const r=await rider(req);
        if(req.method==='POST'){
          const p=await body(req);if(!Array.isArray(p.routes)||p.routes.length>50||typeof p.available!=='boolean')fail('Choose up to 50 route directions and your availability.');
          if(p.available&&!p.routes.length)fail('Choose at least one route, or stay unavailable today.');
          const selected=[],keys=new Set();
          for(const choice of p.routes){
            if(!choice||typeof choice.routeId!=='string'||!['forward','reverse'].includes(choice.direction))fail('Invalid route direction.');
            const route=await db.prepare('SELECT * FROM admin_routes WHERE id=? AND active=1').get(choice.routeId);
            const state=JSON.parse(r.public_profile||'{}').state;
            if(route&&(choice.direction==='reverse'?route.destination_state:route.origin_state)!==state)fail('Choose a route starting in your registered state.',403);
            if(!route||choice.direction==='reverse'&&!route.bidirectional||choice.revision!==route.revision)fail('A route changed or is unavailable. Refresh the route list.',409);
            const key=route.id+':'+choice.direction;if(keys.has(key))fail('Duplicate route selection.');keys.add(key);selected.push({route,direction:choice.direction});
          }
          await db.exec('BEGIN IMMEDIATE');try{
            await db.prepare('DELETE FROM rider_route_preferences WHERE rider_id=?').run(r.id);
            await db.prepare('INSERT INTO rider_route_days(rider_id,day,updated) VALUES (?,?,?) ON CONFLICT(rider_id) DO UPDATE SET day=excluded.day,updated=excluded.updated').run(r.id,lagosDay(),Date.now());
            for(const {route,direction}of selected)await db.prepare('INSERT INTO rider_route_preferences(rider_id,route_id,direction,route_revision,available) VALUES(?,?,?,?,?)').run(r.id,route.id,direction,route.revision,p.available?1:0);
            await db.exec('COMMIT');
          }catch(e){await db.exec('ROLLBACK');throw e;}
          if(p.available)await matchingOffers(r,{recover:true});
        }
        const routes=(await db.prepare('SELECT id,name,origin_city,origin_state,destination_city,destination_state,bidirectional,revision FROM admin_routes WHERE active=1 ORDER BY name,id').all()).map(x=>({id:x.id,name:x.name,origin:x.origin_city,originState:x.origin_state,destination:x.destination_city,destinationState:x.destination_state,bidirectional:Boolean(x.bidirectional),revision:x.revision,allowedDirections:[...(x.origin_state===JSON.parse(r.public_profile||'{}').state?['forward']:[]),...(x.bidirectional&&x.destination_state===JSON.parse(r.public_profile||'{}').state?['reverse']:[])]})).filter(x=>x.allowedDirections.length);
        const selected=await db.prepare('SELECT route_id AS "routeId",direction,route_revision AS revision,available FROM rider_route_preferences WHERE rider_id=?').all(r.id);
        const daily=await db.prepare('SELECT day FROM rider_route_days WHERE rider_id=?').get(r.id),routesChanged=selected.some(s=>s.available&&!routes.some(route=>route.id===s.routeId&&route.revision===s.revision&&route.allowedDirections.includes(s.direction)));send(200,{routes,selected,today:lagosDay(),selectedDay:daily?.day||null,routesChanged,dailyConfirmed:daily?.day===lagosDay()&&!routesChanged,available:daily?.day===lagosDay()&&!routesChanged&&selected.some(x=>Boolean(x.available))});return true;
      }
      if (path === '/api/v4/rider/offers' && req.method === 'GET') {
        const r = await rider(req);
        send(200, {
          offers: await matchingOffers(r),
          matching: 'declared route and direction',
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
        for (const id of p.ids) await db.prepare("UPDATE delivery_notifications SET seen=1 WHERE id=? AND rider_id=? AND account_role='rider'").run(String(id), r.id);
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

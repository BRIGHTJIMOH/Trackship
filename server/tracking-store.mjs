import {trackingLeg} from '../web/lifecycle.mjs';
export async function initializeTrackingStore(db){await db.exec(`CREATE TABLE IF NOT EXISTS rider_location_state(shipment_id TEXT PRIMARY KEY,rider_id TEXT NOT NULL,leg TEXT NOT NULL,session_hash TEXT NOT NULL,consent INTEGER NOT NULL,lat REAL,lng REAL,accuracy REAL,observed_at INTEGER NOT NULL,received_at INTEGER NOT NULL);
 CREATE INDEX IF NOT EXISTS rider_location_session ON rider_location_state(session_hash,shipment_id);`);}
export async function hydrateTracking(db,shipments){
 if(!shipments.length)return shipments;
 const rows=await db.prepare(`SELECT l.*,s.expires AS session_expires,r.suspended FROM rider_location_state l LEFT JOIN rider_sessions s ON s.token_hash=l.session_hash AND s.rider_id=l.rider_id LEFT JOIN rider_profiles r ON r.id=l.rider_id WHERE l.shipment_id IN (${shipments.map(()=>'?').join(',')})`).all(...shipments.map(s=>s.id)),byId=new Map(rows.map(r=>[r.shipment_id,r]));
 return shipments.map(s=>{const row=byId.get(s.id);if(!row)return s;const leg=trackingLeg(s),same=s.actors?.[leg]?.id===row.rider_id&&row.leg===leg&&!s.testRemoval&&!['Delivered','Cancelled'].includes(s.status);if(!same)return !s.testRemoval&&!['Delivered','Cancelled'].includes(s.status)&&s.locationConsent?.actor===s.actors?.[leg]?.id&&s.locationConsent?.leg===leg?s:{...s,location:null,locationConsent:null};
  // An explicit newer workflow start supersedes an earlier stopped location session.
  if(Date.parse(s.locationConsent?.at||'')>row.received_at)return s;
  if(!row.consent||!row.session_expires||row.session_expires<=Date.now()||row.suspended)return {...s,location:null,locationConsent:null};
  const at=new Date(row.received_at).toISOString(),consent={actor:row.rider_id,sessionHash:row.session_hash,leg,at};return {...s,locationConsent:consent,location:row.lat===null?null:{lat:row.lat,lng:row.lng,accuracy:row.accuracy,at,receivedAt:at,observedAt:new Date(row.observed_at).toISOString(),leg}};
 });
}
export async function saveRiderLocation(db,{shipmentId,riderId,leg,sessionHash,p,now}){
 const lat=p.stop===true||p.start===true?null:p.lat,lng=lat===null?null:p.lng,accuracy=lat===null?null:p.accuracy;
 return db.prepare(`INSERT INTO rider_location_state(shipment_id,rider_id,leg,session_hash,consent,lat,lng,accuracy,observed_at,received_at) VALUES (?,?,?,?,?,?,?,?,?,?) ON CONFLICT(shipment_id) DO UPDATE SET rider_id=excluded.rider_id,leg=excluded.leg,session_hash=excluded.session_hash,consent=excluded.consent,lat=excluded.lat,lng=excluded.lng,accuracy=excluded.accuracy,observed_at=excluded.observed_at,received_at=excluded.received_at WHERE excluded.observed_at>=rider_location_state.observed_at`).run(shipmentId,riderId,leg,sessionHash,p.stop===true?0:1,lat,lng,accuracy,p.observedAt||now,now);
}

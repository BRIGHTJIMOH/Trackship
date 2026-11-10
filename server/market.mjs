import { randomUUID } from 'node:crypto';
const normalize = s => String(s || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
const fail = (message, status = 400) => {
  const e = new Error(message);
  e.status = status;
  throw e;
};
export async function marketplace(db, {
  body,
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
  async function eligible(r, s) {
    if(r.suspended)return false;
    if (!['submitted', 'approved'].includes(r.identity_status) || r.identity_format < 4) return false;
    let p;
    try {
      p = JSON.parse(r.public_profile || '{}');
    } catch {
      return false;
    }
    if (!p.city || !p.state || normalize(p.state) !== normalize(s.originState) || normalize(p.city) !== normalize(s.origin)) return false;
    if (p.community && s.pickupCommunity && normalize(p.community) !== normalize(s.pickupCommunity)) return false;
    if (s.riderPhone && normalize(s.riderPhone) !== normalize(r.phone) && s.riderPhone.replace(/\D/g, '').replace(/^234/, '0') !== r.phone) return false;
    const active = (await db.prepare('SELECT payload FROM shipments').all()).map(r => JSON.parse(r.payload)).filter(j => !['Delivered', 'Cancelled'].includes(j.status) && Object.entries(j.actors || {}).some(([leg, a]) => a.id === r.id && (j.custodian === leg || j.status === 'Rider accepted'))).length;
    return active < Number(env.TRACKSHIP_RIDER_CAPACITY || 5);
  }
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
    paymentStatus: s.payment.status,
    match: 'service-area',
    createdAt: s.createdAt
  });
  async function notify(s, phase = 'created') {
    const rows = await db.prepare("SELECT * FROM rider_profiles WHERE identity_status IN ('submitted','approved') AND identity_format>=4").all();
    let count = 0;
    const sends = [];
    for (const r of rows) {
      if (!(await eligible(r, s))) continue;
      const id = randomUUID();
      const title = phase === 'ready' ? 'Delivery ready for pickup' : 'New shipment in your pickup area';
      const text = `${s.business} · ${s.pickupCommunity || s.origin}, ${s.originState}. ${phase === 'ready' ? 'Payment confirmed.' : 'Awaiting vendor payment.'} Open SendRack nearby deliveries.`;
      const inserted = await db.prepare('INSERT OR IGNORE INTO delivery_notifications(id,rider_id,shipment_id,phase,title,body,created) VALUES (?,?,?,?,?,?,?)').run(id, r.id, s.id, phase, title, text, Date.now());
      if (!inserted.changes) continue;
      count++;
      if (env.TRACKSHIP_SEND_JOB_SMS === 'true' && providers.smsReady && sends.length < 20) sends.push(providers.sms(r.phone, title + '. ' + text));
    }
    await Promise.allSettled(sends);
    return count;
  }
  async function matchingOffers(r){const matched=[];for(const s of await open())if(await eligible(r,s))matched.push(preview(s));return matched;}
  return {
    notify,
    eligible,
    async route(req, path, send) {
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
        const current = JSON.parse(r.public_profile || '{}');
        await db.prepare('UPDATE rider_profiles SET public_profile=? WHERE id=?').run(JSON.stringify({
          ...current,
          city: p.city.trim(),
          state: p.state.trim(),
          community: p.community.trim(),
          vehicle: p.vehicle || current.vehicle
        }), r.id);
        send(200, {
          saved: true
        });
        return true;
      }
      if (path === '/api/v4/rider/notifications' && req.method === 'GET') {
        const r = await rider(req);
        send(200, {
          notifications: await db.prepare('SELECT id,shipment_id AS "shipmentId",title,body,seen,created FROM delivery_notifications WHERE rider_id=? ORDER BY created DESC LIMIT 100').all(r.id)
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
          if (!['paid','held'].includes(s.payment.status)) fail('The vendor must pay before this delivery can be accepted.', 409);
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

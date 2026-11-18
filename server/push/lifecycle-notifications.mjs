import {randomUUID} from 'node:crypto';
const statuses=new Set(['Rider accepted','Picked up','Carrier accepted','Last-mile rider accepted','Delivered','Cancelled']);
// Called within the shipment write transaction. GPS-only writes create no alerts.
export async function recordLifecycleNotifications(db,before,after){
 if(!before||after.workflowVersion!==3||after.testRemoval)return 0;
 const known=new Set((before.events||[]).map(e=>e.id||e.status+':'+e.at));
 const events=(after.events||[]).filter(e=>statuses.has(e.status)&&!known.has(e.id||e.status+':'+e.at));
 const recipients=[...new Set(Object.values(after.actors||{}).map(a=>a?.id).filter(Boolean))];let count=0;
 for(const event of events)for(const riderId of recipients){
  const phase='status:'+(event.id||event.status+':'+event.at);
  const result=await db.prepare('INSERT OR IGNORE INTO delivery_notifications(id,rider_id,shipment_id,phase,title,body,created) VALUES (?,?,?,?,?,?,?)').run(randomUUID(),riderId,after.id,phase,'Delivery update',after.code+' · '+event.status+'. Open SendRack to view the update.',Date.now());
  count+=result.changes;
 }
 const vendorEvents=(after.events||[]).filter(e=>e.status!=='Created'&&!known.has(e.id||e.status+':'+e.at));
 const row=await db.prepare('SELECT v.id FROM shipments s JOIN vendor_accounts v ON v.owner_key=s.owner WHERE s.id=? AND COALESCE(v.suspended,0)=0').get(after.id);
 if(row)for(const event of vendorEvents){const phase='vendor-status:'+(event.id||event.status+':'+event.at);const result=await db.prepare("INSERT OR IGNORE INTO delivery_notifications(id,rider_id,shipment_id,phase,title,body,created,account_role) VALUES (?,?,?,?,?,?,?,'vendor')").run(randomUUID(),row.id,after.id,phase,'Delivery update',after.code+' · '+event.status+'. Open SendRack to view the update.',Date.now());count+=result.changes;}
 return count;
}

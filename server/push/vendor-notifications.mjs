import {createHash} from 'node:crypto';
const fail=(message,status)=>{throw Object.assign(Error(message),{status});};
export async function vendorPushAccount(db,req){
 const token=req.headers.authorization?.match(/^Bearer ([a-f0-9]{64})$/)?.[1];if(!token)fail('Sign in to your vendor account.',401);
 const sessionHash=createHash('sha256').update(token).digest('hex');const v=await db.prepare('SELECT v.id,v.owner_key FROM vendor_sessions s JOIN vendor_accounts v ON v.id=s.vendor_id WHERE s.token_hash=? AND s.expires>? AND COALESCE(v.suspended,0)=0').get(sessionHash,Date.now());
 if(!v)fail('Sign in to your vendor account.',401);return {id:v.id,ownerKey:v.owner_key,sessionHash};
}
export function vendorNotifications(db,{body}){return async(req,path,send)=>{
 if(!['/api/v4/vendor/notifications','/api/v4/vendor/notifications/read'].includes(path))return false;
 if(req.method!==(path.endsWith('/read')?'POST':'GET'))return false;
 const account=await vendorPushAccount(db,req);
 if(req.method==='POST'){const p=await body(req,8192);if(!Array.isArray(p.ids)||p.ids.length>100)fail('Invalid notification references.',400);for(const id of p.ids)await db.prepare("UPDATE delivery_notifications SET seen=1 WHERE id=? AND rider_id=? AND account_role='vendor'").run(String(id),account.id);send(200,{read:true});return true;}
 const rows=await db.prepare(`SELECT n.id,n.shipment_id AS "shipmentId",n.title,n.body,n.seen,n.created,s.payload FROM delivery_notifications n JOIN shipments s ON s.id=n.shipment_id WHERE n.rider_id=? AND n.account_role='vendor' AND s.owner=? ORDER BY n.created DESC LIMIT 100`).all(account.id,account.ownerKey);
 send(200,{notifications:rows.filter(r=>!JSON.parse(r.payload).testRemoval).map(({payload,...r})=>r)});return true;
};}

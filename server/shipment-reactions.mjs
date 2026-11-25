import {createHash,randomUUID} from 'node:crypto';
import {REACTION_OPTIONS} from '../web/reaction-options.mjs';
import {recordReactionNotification} from './push/reaction-notifications.mjs';
import {sharedRequestLimits} from './request-controls.mjs';
const digest=value=>createHash('sha256').update(value).digest('hex');
const fail=(message,status=400)=>{throw Object.assign(new Error(message),{status});};
const labels={vendor:'Vendor',rider:'Current handler',viewer:'Tracking viewer'};
export async function shipmentReactions(db,{owner,rider,job,body,env,onChanged=()=>{}}){
 await db.exec(`CREATE TABLE IF NOT EXISTS shipment_reactions(id TEXT PRIMARY KEY,shipment_id TEXT NOT NULL,handler_id TEXT NOT NULL,handler_leg TEXT NOT NULL,sender_key TEXT NOT NULL,sender_kind TEXT NOT NULL,reaction TEXT NOT NULL,updated INTEGER NOT NULL,UNIQUE(shipment_id,handler_id,handler_leg,sender_key));
 CREATE INDEX IF NOT EXISTS shipment_reactions_delivery ON shipment_reactions(shipment_id,handler_id,handler_leg,updated);`);
 const rate=await sharedRequestLimits(db,env);
 async function access(req,path,lock){
  const v=path.match(/^\/api\/v3\/shipments\/([a-f0-9-]{36})\/reactions$/),r=path.match(/^\/api\/v3\/jobs\/([a-f0-9]{64})\/reactions$/),p=path.match(/^\/api\/track\/([a-f0-9]{64})\/reactions$/);
  if(!v&&!r&&!p)return null;
  const suffix=lock&&db.kind==='postgres'?' FOR UPDATE':'';let row,kind,sender,leg;
  if(v){const who=await owner(req);if(!who)fail('Sign in to your vendor account.',401);row=await db.prepare('SELECT payload FROM shipments WHERE id=? AND owner=?'+suffix).get(v[1],who);kind='vendor';sender=who;}
  if(r){const who=await rider(req);if(!who?.id)fail('Sign in to your rider account.',401);const item=await job(r[1]);row=await db.prepare('SELECT payload FROM shipments WHERE id=?'+suffix).get(item.s.id);leg=item.leg;kind='rider';sender=who.id;}
  if(p){row=await db.prepare('SELECT payload FROM shipments WHERE public_hash=?'+suffix).get(digest(p[1]));kind='viewer';sender=digest(p[1]);}
  if(!row)fail('Delivery not found.',404);const s=JSON.parse(row.payload);if(s.testRemoval)fail('This tracking link is no longer active.',404);
  if(kind==='rider'&&s.actors?.[leg]?.id!==sender)fail('Only the assigned handler can view these reactions.',403);
  const handlerLeg=s.custodian,handler=s.actors?.[handlerLeg];const active=s.workflowVersion===3&&!['Delivered','Cancelled'].includes(s.status)&&['pickup','carrier','lastmile'].includes(handlerLeg)&&Boolean(handler?.id);
  return {s,kind,key:digest(kind+':'+sender),handlerId:handler?.id||'',handlerLeg,available:active&&(kind!=='rider'||leg===handlerLeg)};
 }
 async function state(a){
  if(!a.available)return {available:false,reactions:[],ownReaction:null,nextAllowedAt:0,message:['Delivered','Cancelled'].includes(a.s.status)?'Reactions are closed for this delivery.':'Reactions become available while your assigned handler has the parcel.'};
  const rows=await db.prepare('SELECT sender_key,sender_kind,reaction,updated FROM shipment_reactions WHERE shipment_id=? AND handler_id=? AND handler_leg=? ORDER BY updated DESC LIMIT 10').all(a.s.id,a.handlerId,a.handlerLeg);
  const own=rows.find(r=>r.sender_key===a.key);return {available:true,reactions:rows.map(r=>({sender:labels[r.sender_kind],reaction:r.reaction,at:Number(r.updated),own:r.sender_key===a.key})),ownReaction:own?.reaction||null,nextAllowedAt:own?Number(own.updated)+15000:0,message:a.kind==='viewer'?'Anyone with this tracking link can react. Reactions are not delivery confirmation.':'Share how you feel. Reactions do not confirm delivery or change payments.'};
 }
 return async(req,path,send)=>{
  if(!/^\/api\/(?:v3\/(?:shipments|jobs)|track)\/[^/]+\/reactions$/.test(path))return false;
  if(!['GET','POST'].includes(req.method)){send(405,{error:'Method not allowed.'});return true;}
  if(req.method==='GET'){const a=await access(req,path,false);if(!a)fail('Delivery not found.',404);send(200,await state(a));return true;}
  const input=await body(req,1024);if(!REACTION_OPTIONS.some(r=>r.id===input.reaction))fail('Choose one of the available reactions.');
  await db.exec('BEGIN IMMEDIATE');try{
   const a=await access(req,path,true);if(!a)fail('Delivery not found.',404);if(!a.available)fail('Reactions are only available while the current handler has this parcel.',409);
   const old=await db.prepare('SELECT reaction,updated FROM shipment_reactions WHERE shipment_id=? AND handler_id=? AND handler_leg=? AND sender_key=?').get(a.s.id,a.handlerId,a.handlerLeg,a.key);
   if(old?.reaction===input.reaction){const result=await state(a);await db.exec('COMMIT');send(200,result);return true;}
   if(old&&Date.now()-Number(old.updated)<15000)fail('Wait a few seconds before changing your reaction.',429);
   if(!await rate(req,'shipment-reactions',12,60000))fail('Too many reactions. Please wait a minute.',429);
   await db.prepare('INSERT INTO shipment_reactions(id,shipment_id,handler_id,handler_leg,sender_key,sender_kind,reaction,updated) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(shipment_id,handler_id,handler_leg,sender_key) DO UPDATE SET reaction=excluded.reaction,updated=excluded.updated').run(randomUUID(),a.s.id,a.handlerId,a.handlerLeg,a.key,a.kind,input.reaction,Date.now());
   await recordReactionNotification(db,a,input.reaction);
   const result=await state(a);await db.exec('COMMIT');onChanged();send(200,result);return true;
  }catch(e){await db.exec('ROLLBACK');throw e;}
 };
}

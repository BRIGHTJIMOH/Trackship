import {randomUUID} from 'node:crypto';
import {REACTION_OPTIONS} from '../../web/reaction-options.mjs';
export const isReactionPhase=phase=>typeof phase==='string'&&phase.startsWith('reaction:');
export function reactionAccessible(s,phase,role,accountId){
 if(!s||s.testRemoval)return false;const parts=String(phase).split(':');
 return parts.length===4&&['pickup','carrier','lastmile'].includes(parts[1])&&parts[2]===s.actors?.[parts[1]]?.id&&(role==='vendor'||parts[2]===accountId);
}
export function reactionStillRelevant(s,phase,role,accountId){
 return reactionAccessible(s,phase,role,accountId)&&!['Delivered','Cancelled'].includes(s.status)&&String(phase).split(':')[1]===s.custodian;
}
// Written in the same transaction as the reaction, before waking the durable push worker.
export async function recordReactionNotification(db,a,reaction){
 const option=REACTION_OPTIONS.find(o=>o.id===reaction),s=a.s;
 const vendor=await db.prepare('SELECT v.id FROM shipments s JOIN vendor_accounts v ON v.owner_key=s.owner WHERE s.id=? AND COALESCE(v.suspended,0)=0').get(s.id);
 const role=a.kind==='rider'?'vendor':'rider',recipient=role==='vendor'?vendor?.id:a.handlerId;if(!recipient)return;
 const name=String(a.kind==='vendor'?(s.business||s.sender||'Your vendor'):a.kind==='rider'?(s.actors?.[a.handlerLeg]?.name||'Your handler'):'A tracking viewer').replace(/[\r\n\u0000-\u001f]/g,' ').slice(0,60);
 await db.prepare('INSERT INTO delivery_notifications(id,rider_id,shipment_id,phase,title,body,created,account_role) VALUES(?,?,?,?,?,?,?,?)').run(randomUUID(),recipient,s.id,'reaction:'+a.handlerLeg+':'+a.handlerId+':'+randomUUID(),option.emoji+' '+name+' reacted',s.code+' · '+option.label+' '+option.emoji,Date.now(),role);
}
export const notificationView=({phase,...n})=>({...n,type:isReactionPhase(phase)?'reaction':'delivery'});

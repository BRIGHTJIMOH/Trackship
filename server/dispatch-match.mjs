import {vehicleMatches} from '../web/vehicles.mjs';
const normalize=value=>String(value||'').trim().toLowerCase().replace(/[^a-z0-9]/g,'');
export function dispatchMatchReasons(r,s,{activeCount=0,capacity=5,now=Date.now()}={}){
 const reasons=[];let p={};try{p=JSON.parse(r.public_profile||'{}');}catch{reasons.push('rider-profile-invalid');}
 if(s.workflowVersion!==3||s.status!=='Created')reasons.push('shipment-not-open');
 if(!(now-Date.parse(s.createdAt)<7*86400000))reasons.push('shipment-expired');
 if(r.suspended)reasons.push('rider-suspended');
 if(!vehicleMatches(p,s))reasons.push('vehicle-or-weight-mismatch');
 if(!['submitted','approved'].includes(r.identity_status)||r.identity_format<4)reasons.push('identity-incomplete');
 if(!p.state||normalize(p.state)!==normalize(s.originState))reasons.push('pickup-state-mismatch');
 if(!p.city||normalize(p.city)!==normalize(s.origin))reasons.push('pickup-city-mismatch');
 if(p.community&&s.pickupCommunity&&normalize(p.community)!==normalize(s.pickupCommunity))reasons.push('pickup-area-mismatch');
 if(s.riderPhone&&normalize(s.riderPhone)!==normalize(r.phone)&&s.riderPhone.replace(/\D/g,'').replace(/^234/,'0')!==r.phone)reasons.push('assigned-to-another-rider');
 if(!(activeCount<capacity))reasons.push('rider-at-capacity');
 return reasons;
}

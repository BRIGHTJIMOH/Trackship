import {VEHICLE_TYPES,kgToGrams} from './vehicles.mjs';
export const STAGES = ['Created', 'Picked up', 'In transit', 'Out for delivery', 'Delivered'];
export const STATUSES = [...STAGES, 'Cancelled'];
export function clean(value, max=160) { return String(value ?? '').trim().slice(0,max); }
export function validateShipment(s) {
  const errors=[];
  for (const [field,label,max] of [['sender','Sender name',80],['recipient','Recipient name',80],['origin','Pickup city',80],['destination','Delivery city',80],['address','Delivery address',240],['description','Package description',160]]) {
    if (!clean(s[field]) || typeof s[field] !== 'string' || s[field].length>max) errors.push(`${label} is required (maximum ${max} characters).`);
  }
  if (!/^\+?[\d\s()-]{10,20}$/.test(s.phone||'')) errors.push('Enter a valid recipient phone number.');
  if (s.riderPhone && !/^\+?[\d\s()-]{10,20}$/.test(s.riderPhone)) errors.push('Enter a valid rider phone number.');
  if (s.rider && (typeof s.rider!=='string'||s.rider.length>80)) errors.push('Rider name is too long.');
  if (s.notes && (typeof s.notes!=='string'||s.notes.length>240)) errors.push('Delivery notes are too long.');
  return errors;
}
export function canTransition(from,to) {
 return from !== 'Delivered' && from !== 'Cancelled' && (to === 'Cancelled' || STAGES.indexOf(to) === STAGES.indexOf(from)+1);
}
export function newShipment(fields, business) {
 const errors=validateShipment(fields); if(errors.length) throw new Error(errors[0]);
 const id=crypto.randomUUID(); const now=new Date().toISOString();
 return {...fields,riderToken:crypto.randomUUID().replaceAll('-','')+crypto.randomUUID().replaceAll('-',''),id,code:`TS-${id.slice(0,8).toUpperCase()}`,business:clean(business,80)||'My business',publicToken:crypto.randomUUID().replaceAll('-','')+crypto.randomUUID().replaceAll('-',''),createdAt:now,status:'Created',dirty:true,events:[{id:crypto.randomUUID(),status:'Created',note:'Shipment registered',at:now}]};
}
export function addEvent(shipment,status,note='') {
 if(shipment.workflowVersion===3)throw new Error('Use the connected handoff workflow for this delivery.');
 if(!canTransition(shipment.status,status)) throw new Error('That delivery update is not allowed.');
 return {...shipment,status,dirty:true,events:[...shipment.events,{id:crypto.randomUUID(),status,note:clean(note,240),at:new Date().toISOString()}]};
}
export function publicShipment(s) {
 return {code:s.code,business:s.business,description:s.description,origin:s.origin,destination:s.destination,status:s.status,createdAt:s.createdAt,events:s.events.map(({status,at})=>({status,at}))};
}
export function trackingUrl(base, shipment) {return `${base.replace(/\/$/,'')}/t/${shipment.publicToken}`;}
export function validateBackup(d) {
 try {
  if(!d||typeof d.profile?.name!=='string'||d.profile.name.length>80||typeof d.profile.phone!=='string'||d.profile.phone.length>20||!Array.isArray(d.shipments)||d.shipments.length>5000)return false;
  const ids=new Set();const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  for(const s of d.shipments){
   if(!s||!uuid.test(s.id)||ids.has(s.id)||validateShipment(s).length||s.code!==`TS-${s.id.slice(0,8).toUpperCase()}`||!/^[a-f0-9]{64}$/.test(s.publicToken)||typeof s.business!=='string'||s.business.length>80||!Array.isArray(s.events)||s.events.length<1||s.events.length>(s.workflowVersion===3?20:6)||s.events[0].status!=='Created'||s.createdAt!==s.events[0].at)return false;
   for(let i=0;i<s.events.length;i++){const e=s.events[i];if(!uuid.test(e.id)||!Number.isFinite(Date.parse(e.at))||typeof e.note!=='string'||e.note.length>240||(i&&s.workflowVersion!==3&&!canTransition(s.events[i-1].status,e.status)))return false;}
   if(s.status!==s.events.at(-1).status)return false;
   ids.add(s.id);
  }
  if(d.deviceLock&&(typeof d.deviceLock.salt!=='string'||d.deviceLock.salt.length<16||!/^[a-f0-9]{64}$/.test(d.deviceLock.hash)||!Number.isFinite(d.deviceLock.lockedUntil)||!Number.isInteger(d.deviceLock.attempts)||d.deviceLock.attempts<0))return false;
  if(d.riderConnection){const u=new URL(d.riderConnection.base);if(u.protocol!=='https:'||u.origin!==d.riderConnection.base||!/^[a-f0-9]{64}$/.test(d.riderConnection.token))return false;}
  if(d.deviceAccounts){if(typeof d.deviceAccounts!=='object'||Array.isArray(d.deviceAccounts)||Object.keys(d.deviceAccounts).length>100)return false;for(const [key,a]of Object.entries(d.deviceAccounts)){if(!a||!['vendor','rider'].includes(a.role)||validateOnboarding(a.role,a.profile||{}).length||key!==a.role+':'+normalizePhone(a.profile.phone))return false;if(a.pin&&(typeof a.pin.salt!=='string'||a.pin.salt.length<16||!/^[a-f0-9]{64}$/.test(a.pin.hash)))return false;if(a.connection){const u=new URL(a.connection.base);if(u.protocol!=='https:'||u.origin!==a.connection.base||!/^[a-f0-9]{64}$/.test(a.connection.token))return false;}}}
  if(d.accounts){
   if(typeof d.accounts!=='object'||Array.isArray(d.accounts))return false;
   for(const role of ['vendor','rider'])if(d.accounts[role]&&validateOnboarding(role,d.accounts[role]).length)return false;
  }
  if(d.activeRole&&!['vendor','rider'].includes(d.activeRole))return false;
  if(d.riderJobs){
   if(!Array.isArray(d.riderJobs)||d.riderJobs.length>5000)return false;
   for(const job of d.riderJobs){
    if(validateShipment(job).length||!uuid.test(job.id)||!Array.isArray(job.events)||!job.events.length||job.events.length>(job.workflowVersion===3?20:6)||job.events[0].status!=='Created'||job.status!==job.events.at(-1).status||!/^[a-f0-9]{64}$/.test(job.dispatchToken))return false;
    const u=new URL(job.remoteBase);if(u.protocol!=='https:'||u.origin!==job.remoteBase)return false;
    for(let i=0;i<job.events.length;i++){const e=job.events[i];if(!uuid.test(e.id)||!Number.isFinite(Date.parse(e.at))||typeof e.note!=='string'||e.note.length>240||(i&&job.workflowVersion!==3&&!canTransition(job.events[i-1].status,e.status)))return false;}
   }
  }
  if(d.connection){const u=new URL(d.connection.base);if(u.protocol!=='https:'||u.origin!==d.connection.base||!/^[a-f0-9]{64}$/.test(d.connection.token))return false;}
  return true;
 }catch{return false;}
}
export function normalizePhone(phone) {
 const digits=String(phone||'').replace(/\D/g,'');
 return digits.startsWith('234')?'0'+digits.slice(3):digits;
}
export function validateOnboarding(role,p) {
 const errors=[];
 const required=role==='vendor'?[['businessName','Business name'],['ownerName','Your name'],['city','Pickup city'],['pickupAddress','Pickup address']]:role==='rider'?[['fullName','Full name'],['city','Delivery city'],['vehicle','Vehicle type']]:[];
 if(!['vendor','rider'].includes(role))return ['Choose Vendor or Rider.'];
 for(const [k,label]of required)if(typeof p[k]!=='string'||!p[k].trim()||p[k].length>(k==='pickupAddress'?240:80))errors.push(`${label} is required.`);
 if(!/^0[789]\d{9}$/.test(normalizePhone(p.phone)))errors.push('Enter a valid Nigerian mobile number (e.g. 08012345678).');
 if(role==='rider'&&p.vehicle&&!VEHICLE_TYPES.includes(p.vehicle))errors.push('Choose a supported vehicle type.');
 if(role==='rider'){try{kgToGrams(p.maxLoadKg);}catch(e){errors.push(e.message);}}

 return errors;
}
export function upgradeData(raw={}) {
 const source=raw&&typeof raw==='object'?raw:{};
 return {...source,profile:source.profile||{name:'',phone:''},shipments:Array.isArray(source.shipments)?source.shipments:[],connection:source.connection||null,accounts:{vendor:source.accounts?.vendor||null,rider:source.accounts?.rider||null},activeRole:['vendor','rider'].includes(source.activeRole)?source.activeRole:null,riderJobs:Array.isArray(source.riderJobs)?source.riderJobs:[],riderConnection:source.riderConnection||null,theme:['dark','light'].includes(source.theme)?source.theme:'light',riderAvailable:source.riderAvailable===true,introSeen:source.introSeen===true};
}
export function visibleShipments(data,role) {
 if(role==='vendor')return data.shipments||[];
 return (data.riderJobs||[]).filter(s=>s.workflowVersion!==3||data.riderConnection);
}

export function historyRelation(local,remote) {
 const shortest=Math.min(local.events.length,remote.events.length);
 for(let i=0;i<shortest;i++)if(JSON.stringify(local.events[i])!==JSON.stringify(remote.events[i]))return 'conflict';
 return remote.events.length>local.events.length?'remote':local.events.length>remote.events.length?'local':'equal';
}

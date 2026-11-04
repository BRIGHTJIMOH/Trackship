import {normalizePhone} from './core.mjs';
export const accountKey=(role,phone)=>role+':'+normalizePhone(phone);
export function stashAccount(data){
 const role=data.activeRole,profile=data.accounts?.[role];if(!role||!profile)return data;
 const key=accountKey(role,profile.phone);const current=data.deviceAccounts?.[key]||{};
 const record={...current,role,profile,pin:data.roleLocks?.[role]||current.pin||null,...(role==='vendor'?{shipments:data.shipments||[],basket:data.shipmentBasket||[],connection:data.connection||null}:{jobs:data.riderJobs||[],connection:data.riderConnection||null})};
 return {...data,deviceAccounts:{...data.deviceAccounts,[key]:record}};
}
export function findAccount(data,role,phone){return data.deviceAccounts?.[accountKey(role,phone)]||null;}
export function activateAccount(data,record){
 const saved=stashAccount(data);const role=record.role;return {...saved,activeRole:role,activeAccountKey:accountKey(role,record.profile.phone),loggedOut:false,accounts:{...saved.accounts,[role]:record.profile},roleLocks:{...saved.roleLocks,[role]:record.pin||null},profile:role==='vendor'?{name:record.profile.businessName,phone:record.profile.phone}:{name:'',phone:''},shipmentBasket:role==='vendor'?(record.basket||[]):[],shipments:role==='vendor'?(record.shipments||[]):[],connection:role==='vendor'?(record.connection||null):null,riderJobs:role==='rider'?(record.jobs||[]):[],riderConnection:role==='rider'?(record.connection||null):null,deviceAccounts:{...saved.deviceAccounts,[accountKey(role,record.profile.phone)]:record}};
}
export function migrateDeviceAccounts(data){
 let next={...data,deviceAccounts:{...(data.deviceAccounts||{})},roleLocks:{...(data.roleLocks||{})}};
 for(const role of ['vendor','rider']){const profile=data.accounts?.[role];if(!profile)continue;const key=accountKey(role,profile.phone);if(!next.deviceAccounts[key])next.deviceAccounts[key]={role,profile,pin:data.roleLocks?.[role]||data.deviceLock||null,...(role==='vendor'?{shipments:data.shipments||[],basket:data.shipmentBasket||[],connection:data.connection||null}:{jobs:data.riderJobs||[],connection:data.riderConnection||null})};if(!next.roleLocks[role])next.roleLocks[role]=next.deviceAccounts[key].pin||null;}
 if(next.activeRole==='rider'){next.profile={name:'',phone:''};next.connection=null;next.shipments=[];}
 delete next.deviceLock;delete next.riderAvailable;return next;
}
export function exportCurrentAccount(data){const saved=stashAccount(data),role=data.activeRole,profile=data.accounts?.[role];if(!role||!profile)throw new Error('Log in before exporting your account.');const key=accountKey(role,profile.phone);return {...saved,accounts:{vendor:role==='vendor'?profile:null,rider:role==='rider'?profile:null},deviceAccounts:{[key]:saved.deviceAccounts[key]},roleLocks:{[role]:saved.roleLocks?.[role]||null},shipments:role==='vendor'?data.shipments:[],connection:role==='vendor'?data.connection:null,profile:role==='vendor'?data.profile:{name:'',phone:''},riderJobs:role==='rider'?data.riderJobs:[],riderConnection:role==='rider'?data.riderConnection:null};}

// Reauthentication preserves records and scoped service credentials, never an open dashboard.
export function lockDeviceAccounts(data){const saved=stashAccount(data);return {...saved,lastRole:saved.activeRole||saved.lastRole||null,activeRole:null,activeAccountKey:null,connection:null,riderConnection:null,shipments:[],riderJobs:[],shipmentBasket:[],profile:{name:'',phone:''}};}

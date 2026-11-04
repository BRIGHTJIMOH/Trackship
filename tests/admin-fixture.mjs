import {createApp} from '../server/server.mjs';
import {testDatabase} from './database-fixture.mjs';
import {mkdtempSync,rmSync} from 'node:fs';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {randomBytes} from 'node:crypto';
export const OWNER_PASSWORD='test-only-owner-password-8472';
export const vendorProfile={businessName:'Ada Market',ownerName:'Ada Obi',phone:'08012345678',city:'Zaria',state:'Kaduna',community:'GRA',pickupAddress:'10 Private Pickup Road, Zaria'};
export const riderProfile={fullName:'Chika Rider',phone:'08098765432',city:'Zaria',state:'Kaduna',community:'GRA',vehicle:'Bicycle'};
export const photo='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==';
export async function adminFixture({configured=true,production=false}={}){
 const database=await testDatabase(),dir=mkdtempSync(path.join(tmpdir(),'sendrack-admin-')),texts=[],charges=new Map();const env={...database.env,...(production?{NODE_ENV:'production'}:{}),TRACKSHIP_PUBLIC_URL:'https://pilot.test',TRACKSHIP_IDENTITY_KEY:randomBytes(32).toString('hex'),TRACKSHIP_ADMIN_TOKEN:randomBytes(32).toString('hex'),...(configured?{ADMIN_USERNAME:'owner',ADMIN_PASSWORD:OWNER_PASSWORD}:{})};
 const providers={paymentReady:true,smsReady:true,identityReady:true,mode:'test',webhookKey:'test-only',async sms(phone,message){texts.push({phone,message});},async initialize(p){charges.set(p.reference,{...p,id:1,status:'success',domain:'test'});return {authorization_url:'https://checkout.paystack.com/test'};},async verify(ref){return {...charges.get(ref),reference:ref};}};
 const server=await createApp({dataDir:dir,env,providers});await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`;
 const api=(url,body,{cookie,csrf,token,origin,method}={})=>fetch(base+url,{method:method||(body===undefined?'GET':'POST'),headers:{'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{}),...(csrf?{'X-CSRF-Token':csrf}:{}),...(token?{Authorization:'Bearer '+token}:{}),...(origin?{Origin:origin}:{})},body:body===undefined?undefined:JSON.stringify(body)});
 async function login(){const response=await api('/api/admin/login',{username:'owner',password:OWNER_PASSWORD});if(response.status!==200)throw new Error(await response.text());return {...await response.json(),cookie:response.headers.get('set-cookie').split(';')[0],cookieHeader:response.headers.get('set-cookie')};}
 async function account(role,profile){const response=await api('/api/accounts/request-code',{role,intent:'signup',phone:profile.phone,profile});if(response.status!==200)throw new Error(await response.text());const {challengeId}=await response.json(),code=texts.at(-1).message.match(/\b\d{6}\b/)[0];const result=await api('/api/accounts/verify-code',{challengeId,code});if(result.status!==200)throw new Error(await result.text());return result.json();}
 async function identity(role,auth){return api('/api/accounts/identity',{fullName:role==='vendor'?vendorProfile.ownerName:riderProfile.fullName,idType:'National ID card',idNumber:'12345678901',idPhoto:photo,homeAddress:'10 Private Residential Road, Zaria',consent:true,...(role==='rider'?{nin:'12345678901',vehicle:'Bicycle',drivingLicence:'',vehicleRegistration:'',emergencyPhone:'08011112222'}:{})},{token:auth.token});}
 return {server,base,env,providers,api,login,account,identity,texts,async close(){await new Promise(r=>server.close(r));await server.databaseClosed;await database.cleanup();rmSync(dir,{recursive:true,force:true});}};
}

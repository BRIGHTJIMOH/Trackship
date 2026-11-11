import {createPrivateKey,sign} from 'node:crypto';
import {readFileSync} from 'node:fs';
const encode=value=>Buffer.from(JSON.stringify(value)).toString('base64url');
export function createFcmSender({env=process.env,fetchImpl=fetch,now=Date.now}={}){
 if(env.FCM_ENABLED!=='true')return {ready:false};
 let account=null;let serviceJson=env.FCM_SERVICE_ACCOUNT_JSON;if(env.FCM_SERVICE_ACCOUNT_FILE){try{serviceJson=readFileSync(env.FCM_SERVICE_ACCOUNT_FILE,'utf8');}catch{throw new Error('FCM private service-account file is not readable.');}}if(serviceJson){try{account=JSON.parse(serviceJson);if(account.type!=='service_account')throw new Error();}catch{throw new Error('FCM_SERVICE_ACCOUNT_JSON must be a private service-account configuration.');}}
 const project=env.FCM_PROJECT_ID||account?.project_id,email=env.FCM_CLIENT_EMAIL||account?.client_email,pem=account?.private_key||(env.FCM_PRIVATE_KEY_BASE64?Buffer.from(env.FCM_PRIVATE_KEY_BASE64,'base64').toString('utf8'):null);
 if(!/^[a-z][a-z0-9-]{4,62}$/.test(project||'')||!/^.+@.+\.gserviceaccount\.com$/.test(email||'')||!pem)throw new Error('FCM needs its project ID and private service-account settings.');
 let key;try{key=createPrivateKey(pem);if(key.asymmetricKeyType!=='rsa')throw new Error();}catch{throw new Error('FCM private signing key is invalid.');}
 let cached=null,pending=null;
 async function accessToken(){
  if(cached&&cached.until>now()+60000)return cached.value;
  if(pending)return pending;
  pending=(async()=>{const seconds=Math.floor(now()/1000),header=encode({alg:'RS256',typ:'JWT'}),claims=encode({iss:email,scope:'https://www.googleapis.com/auth/firebase.messaging',aud:'https://oauth2.googleapis.com/token',iat:seconds,exp:seconds+3600}),input=header+'.'+claims,assertion=input+'.'+sign('RSA-SHA256',Buffer.from(input),key).toString('base64url');
   const response=await fetchImpl('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion}),signal:AbortSignal.timeout(10000),redirect:'error'});
   if(!response.ok)throw new Error('FCM authorization failed.');const result=await response.json();if(typeof result.access_token!=='string'||!Number.isFinite(result.expires_in)||result.expires_in<60)throw new Error('FCM authorization response is invalid.');cached={value:result.access_token,until:now()+Math.min(result.expires_in,3600)*1000};return cached.value;
  })();try{return await pending;}finally{pending=null;}
 }
 return {ready:true,async send({token,eventId,binding}){
  const response=await fetchImpl('https://fcm.googleapis.com/v1/projects/'+project+'/messages:send',{method:'POST',headers:{Authorization:'Bearer '+await accessToken(),'Content-Type':'application/json'},body:JSON.stringify({message:{token,data:{eventId,binding},android:{priority:'HIGH',ttl:'3600s',restricted_package_name:'ng.sendrack.test'}}}),signal:AbortSignal.timeout(10000),redirect:'error'});
  const result=await response.json().catch(()=>({}));
  if(response.ok&&typeof result.name==='string')return {status:'sent',reference:result.name};
  if(response.status===401)cached=null;
  const code=result.error?.details?.find(d=>d['@type']==='type.googleapis.com/google.firebase.fcm.v1.FcmError')?.errorCode;
  return {status:code==='UNREGISTERED'?'invalid-token':'retry',code:code==='UNREGISTERED'?'UNREGISTERED':'FCM_HTTP_'+response.status};
 }};
}

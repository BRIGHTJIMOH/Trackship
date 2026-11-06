import {randomUUID,randomBytes,randomInt,createHash,timingSafeEqual} from 'node:crypto';
import {normalizePhone,validateOnboarding} from '../web/core.mjs';
const hash=s=>createHash('sha256').update(s).digest('hex');
const fail=(message,status=400)=>{const e=new Error(message);e.status=status;throw e;};
export const normalizeEmail=value=>typeof value==='string'?value.trim().toLowerCase():'';
export const validEmail=value=>value.length<=254&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
export async function emailAccounts(db,{body,providers,publicProfile,vendor}){
 for(const table of ['vendor_accounts','rider_profiles']){
  const columns=await db.prepare('PRAGMA table_info('+table+')').all();
  for(const [name,type]of [['email','TEXT'],['email_verified_at','INTEGER']])if(!columns.some(c=>c.name===name))await db.exec('ALTER TABLE '+table+' ADD COLUMN '+name+' '+type);
  await db.exec('CREATE UNIQUE INDEX IF NOT EXISTS '+table+'_email ON '+table+'(email)');
 }
 await db.exec(`CREATE TABLE IF NOT EXISTS email_account_challenges(id TEXT PRIMARY KEY,email TEXT,phone TEXT,role TEXT,intent TEXT,account_id TEXT,profile TEXT,salt TEXT,hash TEXT,expires INTEGER,attempts INTEGER DEFAULT 0,used INTEGER DEFAULT 0,created INTEGER);
 CREATE INDEX IF NOT EXISTS email_challenge_address ON email_account_challenges(email,role,created);
 CREATE INDEX IF NOT EXISTS email_challenge_phone ON email_account_challenges(phone,role,created);`);
 const table=role=>role==='vendor'?'vendor_accounts':'rider_profiles';
 async function authenticated(req,role){
  if(role==='vendor')return vendor(req);
  const token=req.headers.authorization?.match(/^Bearer ([a-f0-9]{64})$/)?.[1];if(!token)return null;
  const session=await db.prepare('SELECT rider_id,expires FROM rider_sessions WHERE token_hash=?').get(hash(token));
  if(!session||session.expires<=Date.now())return null;
  const account=await db.prepare('SELECT * FROM rider_profiles WHERE id=?').get(session.rider_id);return account&&!account.suspended?account:null;
 }
 async function transaction(fn){await db.exec('BEGIN IMMEDIATE');try{const value=await fn();await db.exec('COMMIT');return value;}catch(e){await db.exec('ROLLBACK');throw e;}}
 return async(req,path,send)=>{
  if(!['/api/accounts/email/request-code','/api/accounts/email/verify-code'].includes(path))return false;
  if(req.method!=='POST')fail('Method not allowed.',405);
  if(path.endsWith('/request-code')){
   const p=await body(req,180000);if(!p||typeof p!=='object')fail('Enter valid account details.');const email=normalizeEmail(p.email);
   if(!['vendor','rider'].includes(p.role)||!['signup','login','link'].includes(p.intent)||!validEmail(email))fail('Choose your account type and enter a valid email address.');
   if(!providers.emailReady)fail('Email verification is not connected yet. Your signup details and ID are still here; try again when the service is ready.',503);
   let account=null,phone=normalizePhone(p.phone),profile={};
   if(p.intent==='signup'){
    if(!/^0[789]\d{9}$/.test(phone))fail('Enter a valid Nigerian phone number.');
    if(await db.prepare('SELECT id FROM '+table(p.role)+' WHERE phone=? OR email=?').get(phone,email))fail('An account already exists. Log in instead. Existing phone accounts must link an email from their signed-in profile.',409);
    profile=publicProfile(p.role,phone,p.profile);const errors=validateOnboarding(p.role,profile);if(errors.length)fail(errors[0]);
   }else if(p.intent==='login'){
    account=await db.prepare('SELECT * FROM '+table(p.role)+' WHERE email=?').get(email);
    if(!account||!account.email_verified_at)fail('No verified email account matches. Existing phone accounts must link an email from their signed-in profile.',404);
    phone=account.phone;
   }else{
    account=await authenticated(req,p.role);if(!account)fail('Log in to your existing account before linking an email.',401);
    if(account.email&&account.email!==email)fail('This account already has a verified email. Contact support to change it.',409);
    const other=await db.prepare('SELECT id FROM '+table(p.role)+' WHERE email=?').get(email);if(other&&other.id!==account.id)fail('That email is already linked to another account of this type.',409);
    phone=account.phone;
   }
   if(account?.suspended)fail('Account access is unavailable. Contact support.',403);
   const now=Date.now();
   const recent=await db.prepare('SELECT created FROM email_account_challenges WHERE role=? AND (email=? OR phone=?) ORDER BY created DESC LIMIT 1').get(p.role,email,phone);
   if(recent&&now-recent.created<60000)fail('Wait one minute before requesting another email code.',429);
   const count=await db.prepare('SELECT COUNT(*) AS count FROM email_account_challenges WHERE role=? AND (email=? OR phone=?) AND created>?').get(p.role,email,phone,now-3600000);
   if(count.count>=5)fail('Too many email codes requested. Try again in one hour.',429);
   const id=randomUUID(),salt=randomBytes(32).toString('hex'),code=String(randomInt(100000,1000000));
   // Reserve the rate limit before sending, including failed/uncertain deliveries.
   await db.prepare('INSERT INTO email_account_challenges(id,email,phone,role,intent,account_id,profile,salt,hash,expires,created) VALUES (?,?,?,?,?,?,?,?,?,?,?)').run(id,email,phone,p.role,p.intent,account?.id||null,JSON.stringify(profile),salt,hash(salt+code),now+600000,now);
   try{await providers.email(email,`Your SendRack ${p.role} verification code`,`Your SendRack ${p.role} ${p.intent==='signup'?'signup':p.intent==='link'?'email linking':'login'} code is ${code}. It expires in 10 minutes and can be used once. Do not share it. If you did not request this code, ignore this email.`);}catch(e){await db.prepare('UPDATE email_account_challenges SET used=1 WHERE id=?').run(id);throw e;}
   // A successful resend supersedes all earlier codes for this account/address.
   await db.prepare('UPDATE email_account_challenges SET used=1 WHERE role=? AND (email=? OR phone=?) AND id<>?').run(p.role,email,phone,id);
   send(200,{challengeId:id,expiresAt:now+600000,resendAt:now+60000});return true;
  }
  const p=await body(req);if(!p||typeof p.challengeId!=='string'||!/^[a-f0-9-]{36}$/.test(p.challengeId))fail('Request a new email verification code.',401);const c=await db.prepare('SELECT * FROM email_account_challenges WHERE id=?').get(p.challengeId);
  if(!c||c.used||c.expires<=Date.now()||c.attempts>=5)fail('This email code is expired, already used or locked. Request a new code.',401);
  await db.prepare('UPDATE email_account_challenges SET attempts=attempts+1 WHERE id=?').run(c.id);
  const given=hash(c.salt+(typeof p.code==='string'?p.code:''));if(typeof p.code!=='string'||!/^\d{6}$/.test(p.code)||!timingSafeEqual(Buffer.from(given),Buffer.from(c.hash)))fail('Incorrect email verification code.',401);
  const result=await transaction(async()=>{
   const fresh=await db.prepare('SELECT used,expires FROM email_account_challenges WHERE id=?').get(c.id);
   if(fresh.used||fresh.expires<=Date.now())fail('This email code has expired or was already used.',401);
   let account=await db.prepare('SELECT * FROM '+table(c.role)+' WHERE phone=?').get(c.phone);
   if(c.intent==='signup'&&account)fail('This phone account already exists. Log in instead.',409);
   if(c.intent!=='signup'&&(!account||account.id!==c.account_id||account.suspended))fail('Account access is unavailable. Log in again.',401);
   if(c.intent==='login'&&(account.email!==c.email||!account.email_verified_at))fail('The account email changed. Request a new code.',401);
   if(c.intent==='link'){
    const authorized=await authenticated(req,c.role);if(!authorized||authorized.id!==account.id)fail('Log in to the same account to finish linking this email.',401);
    if(account.email&&account.email!==c.email)fail('The account email changed. Request a new code.',409);
   }
   const other=await db.prepare('SELECT id FROM '+table(c.role)+' WHERE email=?').get(c.email);if(other&&other.id!==account?.id)fail('This email is already linked to another account of this type.',409);
   const created=!account,verifiedAt=account?.email_verified_at||Date.now();
   if(!account){const id=randomUUID(),profile=JSON.parse(c.profile);if(c.role==='vendor')await db.prepare('INSERT INTO vendor_accounts(id,phone,owner_key,profile,email,email_verified_at) VALUES (?,?,?,?,?,?)').run(id,c.phone,randomUUID(),JSON.stringify(profile),c.email,verifiedAt);else await db.prepare('INSERT INTO rider_profiles(id,phone,display_name,public_profile,email,email_verified_at) VALUES (?,?,?,?,?,?)').run(id,c.phone,profile.fullName,JSON.stringify(profile),c.email,verifiedAt);account=await db.prepare('SELECT * FROM '+table(c.role)+' WHERE id=?').get(id);
   }else if(c.intent==='link')await db.prepare('UPDATE '+table(c.role)+' SET email=?,email_verified_at=? WHERE id=?').run(c.email,verifiedAt,account.id);
   await db.prepare('UPDATE email_account_challenges SET used=1 WHERE id=?').run(c.id);
   const token=randomBytes(32).toString('hex');await db.prepare('INSERT INTO '+(c.role==='vendor'?'vendor_sessions':'rider_sessions')+' VALUES (?,?,?)').run(hash(token),account.id,Date.now()+30*86400000);
   const profile=JSON.parse((c.role==='vendor'?account.profile:account.public_profile)||'{}');return {role:c.role,token,created,profile:{...profile,id:account.id,phone:c.phone,email:c.email,emailVerifiedAt:verifiedAt,identityStatus:account.identity_status||'missing'}};
  });
  send(200,result);return true;
 };
}

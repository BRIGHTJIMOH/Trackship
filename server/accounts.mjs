import {randomUUID,randomBytes,randomInt,createHash,timingSafeEqual} from 'node:crypto';
import {normalizePhone,validateOnboarding} from '../web/core.mjs';
const hash=s=>createHash('sha256').update(s).digest('hex');
const token=()=>randomBytes(32).toString('hex');
const fail=(message,status=400)=>{const e=new Error(message);e.status=status;throw e;};
const same=(a,b)=>{const x=Buffer.from(a),y=Buffer.from(b);return x.length===y.length&&timingSafeEqual(x,y);};
export function accounts(db,{body,providers}){
 db.exec(`CREATE TABLE IF NOT EXISTS vendor_accounts(id TEXT PRIMARY KEY,phone TEXT UNIQUE,owner_key TEXT UNIQUE,profile TEXT);
 CREATE TABLE IF NOT EXISTS vendor_sessions(token_hash TEXT PRIMARY KEY,vendor_id TEXT,expires INTEGER);
 CREATE TABLE IF NOT EXISTS account_challenges(id TEXT PRIMARY KEY,phone TEXT,role TEXT,intent TEXT,profile TEXT,salt TEXT,hash TEXT,expires INTEGER,attempts INTEGER DEFAULT 0,used INTEGER DEFAULT 0,created INTEGER);`);
 if(!db.prepare('PRAGMA table_info(workspaces)').all().some(c=>c.name==='disabled'))db.exec('ALTER TABLE workspaces ADD COLUMN disabled INTEGER DEFAULT 0');
 if(!db.prepare('PRAGMA table_info(rider_profiles)').all().some(c=>c.name==='public_profile'))db.exec('ALTER TABLE rider_profiles ADD COLUMN public_profile TEXT');
 const rates=new Map();
 function rate(req){const ip=req.socket.remoteAddress,now=Date.now();let r=rates.get(ip);if(!r||r.until<now)r={count:0,until:now+600000};r.count++;rates.set(ip,r);if(r.count>10)fail('Too many sign-in codes requested. Try again later.',429);}
 const raw=req=>req.headers.authorization?.match(/^Bearer ([a-f0-9]{64})$/)?.[1];
 function vendor(req){const t=raw(req);if(!t)return null;const s=db.prepare('SELECT vendor_id,expires FROM vendor_sessions WHERE token_hash=?').get(hash(t));return s&&s.expires>Date.now()?db.prepare('SELECT * FROM vendor_accounts WHERE id=?').get(s.vendor_id):null;}
 const publicProfile=(role,phone,input={})=>{const names=role==='vendor'?['businessName','ownerName','city','state','community','pickupAddress','category']:['fullName','city','state','community','vehicle'];const p={phone};for(const k of names)if(typeof input[k]==='string')p[k]=input[k].trim().slice(0,k==='pickupAddress'?240:80);return p;};
 function transaction(fn){db.exec('BEGIN IMMEDIATE');try{const r=fn();db.exec('COMMIT');return r;}catch(e){db.exec('ROLLBACK');throw e;}}
 return {vendor,owner:req=>vendor(req)?.owner_key||null,async route(req,path,send){
  if(path==='/api/accounts/request-code'&&req.method==='POST'){
   const p=await body(req);if(!['vendor','rider'].includes(p.role)||!['signup','login'].includes(p.intent))fail('Choose Vendor or Rider and Sign up or Log in.');const phone=normalizePhone(p.phone);if(!/^0[789]\d{9}$/.test(phone))fail('Enter a valid Nigerian phone number.');if(!providers.smsReady)fail('Account phone verification is not connected on this service.',503);rate(req);
   const recent=db.prepare('SELECT created FROM account_challenges WHERE phone=? ORDER BY created DESC LIMIT 1').get(phone);if(recent&&Date.now()-recent.created<60000)fail('Wait one minute before requesting another code.',429);
   const profile=publicProfile(p.role,phone,p.profile);if(p.intent==='signup'){const errors=validateOnboarding(p.role,profile);if(errors.length)fail(errors[0]);}
   const id=randomUUID(),salt=token(),code=String(randomInt(100000,1000000));await providers.sms(phone,`Your TrackShip ${p.role} ${p.intent==='signup'?'signup':'login'} code is ${code}. It expires in 10 minutes. Do not share it.`);db.prepare('INSERT INTO account_challenges(id,phone,role,intent,profile,salt,hash,expires,created) VALUES (?,?,?,?,?,?,?,?,?)').run(id,phone,p.role,p.intent,JSON.stringify(profile),salt,hash(salt+code),Date.now()+600000,Date.now());send(200,{challengeId:id});return true;
  }
  if(path==='/api/accounts/verify-code'&&req.method==='POST'){
   const p=await body(req);const c=db.prepare('SELECT * FROM account_challenges WHERE id=?').get(p.challengeId);if(!c||c.used||c.expires<Date.now()||c.attempts>=5)fail('This sign-in code is expired or locked.',401);db.prepare('UPDATE account_challenges SET attempts=attempts+1 WHERE id=?').run(c.id);if(!/^\d{6}$/.test(p.code||'')||!same(hash(c.salt+p.code),c.hash))fail('Incorrect sign-in code.',401);
   const existing=c.role==='vendor'?db.prepare('SELECT * FROM vendor_accounts WHERE phone=?').get(c.phone):db.prepare('SELECT * FROM rider_profiles WHERE phone=?').get(c.phone);
   if(c.intent==='login'&&!existing)fail('No account was found for this phone and role. Choose Sign up.',404);
   const authToken=token();let account,profile,created=false;transaction(()=>{const fresh=db.prepare('SELECT used FROM account_challenges WHERE id=?').get(c.id);if(fresh.used)fail('This code was already used.',401);db.prepare('UPDATE account_challenges SET used=1 WHERE id=?').run(c.id);profile=JSON.parse(c.profile);
    if(c.role==='vendor'){account=existing;if(!account){const id=randomUUID(),ownerKey=randomUUID();db.prepare('INSERT INTO vendor_accounts VALUES (?,?,?,?)').run(id,c.phone,ownerKey,JSON.stringify(profile));account=db.prepare('SELECT * FROM vendor_accounts WHERE id=?').get(id);created=true;}profile=JSON.parse(account.profile);db.prepare('INSERT INTO vendor_sessions VALUES (?,?,?)').run(hash(authToken),account.id,Date.now()+30*86400000);}
    else{account=existing;if(!account){const id=randomUUID();db.prepare('INSERT INTO rider_profiles(id,phone,display_name,public_profile) VALUES (?,?,?,?)').run(id,c.phone,profile.fullName,JSON.stringify(profile));account=db.prepare('SELECT * FROM rider_profiles WHERE id=?').get(id);created=true;}profile=account.public_profile?JSON.parse(account.public_profile):{...profile,fullName:account.display_name,phone:account.phone};db.prepare('INSERT INTO rider_sessions VALUES (?,?,?)').run(hash(authToken),account.id,Date.now()+30*86400000);}
   });send(200,{role:c.role,token:authToken,created,profile:{...profile,id:account.id,phone:c.phone,...(c.role==='rider'?{identityStatus:account.identity_status}:{} )}});return true;
  }
  if(path==='/api/accounts/profile'&&req.method==='POST'){
   const p=await body(req),v=vendor(req);if(v){const profile=publicProfile('vendor',v.phone,p);const errors=validateOnboarding('vendor',profile);if(errors.length)fail(errors[0]);db.prepare('UPDATE vendor_accounts SET profile=? WHERE id=?').run(JSON.stringify(profile),v.id);send(200,{saved:true});return true;}
   const t=raw(req);const session=t?db.prepare('SELECT rider_id,expires FROM rider_sessions WHERE token_hash=?').get(hash(t)):null;if(!session||session.expires<Date.now())fail('Log in to your account.',401);const r=db.prepare('SELECT * FROM rider_profiles WHERE id=?').get(session.rider_id);const profile=publicProfile('rider',r.phone,p);const errors=validateOnboarding('rider',profile);if(errors.length)fail(errors[0]);db.prepare('UPDATE rider_profiles SET public_profile=? WHERE id=?').run(JSON.stringify(profile),r.id);send(200,{saved:true});return true;
  }
  if(path==='/api/accounts/vendor/shipments'&&req.method==='GET'){const v=vendor(req);if(!v)fail('Log in to your vendor account.',401);send(200,{shipments:db.prepare('SELECT payload FROM shipments WHERE owner=?').all(v.owner_key).map(r=>JSON.parse(r.payload))});return true;}
  if(path==='/api/accounts/vendor/claim-legacy'&&req.method==='POST'){const v=vendor(req);if(!v)fail('Log in to your vendor account.',401);const p=await body(req);if(!/^[a-f0-9]{64}$/.test(p.legacyToken||''))fail('Invalid previous device access.');const key=hash(p.legacyToken);const old=db.prepare('SELECT token_hash FROM workspaces WHERE token_hash=?').get(key);if(!old)fail('Previous device workspace was not found.',404);transaction(()=>{db.prepare('UPDATE shipments SET owner=? WHERE owner=?').run(v.owner_key,key);db.prepare('DELETE FROM workspaces WHERE token_hash=?').run(key);});send(200,{claimed:true});return true;}
  return false;
 }};
}

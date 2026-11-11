import {createHash,createHmac,randomBytes,randomUUID,scrypt as scryptCb,timingSafeEqual} from 'node:crypto';
import {promisify} from 'node:util';
import {WalletError} from './provider.mjs';
import {requireRole} from './admin.mjs';
const scrypt=promisify(scryptCb);
const hash=value=>createHash('sha256').update(value).digest('hex');
const equal=(a,b)=>{const x=Buffer.from(a||''),y=Buffer.from(b||'');return x.length===y.length&&timingSafeEqual(x,y);};
const fail=(message,status=403)=>{throw new WalletError(message,status);};
export class FinanceAuth {
 constructor({admin,secret}) {
  if(typeof secret!=='string'||secret.length<32)throw new Error('Configure a private finance session secret.');
  this.admin=admin;this.ledger=admin.ledger;this.pool=admin.pool;this.schema=admin.schema;this.secret=secret;
 }
 csrf(token){return createHmac('sha256',this.secret).update('finance-csrf:'+token).digest('hex');}
 async passwordHash(password,salt){return (await scrypt(password,salt,32,{N:32768,r:8,p:1,maxmem:64*1024*1024})).toString('hex');}
 async createStaff(actor,{username,password,role,reason}) {
  requireRole(actor,['Admin']);
  if(!/^[A-Za-z0-9_.-]{3,80}$/.test(username||'')||typeof password!=='string'||password.length<12||password.length>200||!['Admin','Finance','Support'].includes(role)||typeof reason!=='string'||reason.trim().length<5||reason.length>500)fail('Use a valid username, role, reason and password of 12–200 characters.',400);
  const salt=randomBytes(16).toString('hex'),passwordHash=await this.passwordHash(password,salt),id=randomUUID();
  await this.ledger.transaction(async c=>{
   await c.query(`INSERT INTO ${this.schema}.finance_staff(id,username,role,password_salt,password_hash) VALUES($1,$2,$3,$4,$5)`,[id,username,role,salt,passwordHash]);
   await this.admin.audit(c,actor,'staff_created',id,reason,{username,role});
  });return {id,username,role};
 }
 async setStaff(actor,{id,enabled,reason}) {
  requireRole(actor,['Admin']);if(typeof enabled!=='boolean'||typeof reason!=='string'||reason.trim().length<5||reason.length>500)fail('Provide access state and reason.',400);
  if(actor.id==='staff:'+id)fail('You cannot change your own access.');
  await this.ledger.transaction(async c=>{
   const r=await c.query(`UPDATE ${this.schema}.finance_staff SET enabled=$2 WHERE id=$1 RETURNING id`,[id,enabled]);if(!r.rowCount)fail('Staff account not found.',404);
   await c.query(`DELETE FROM ${this.schema}.finance_sessions WHERE staff_id=$1`,[id]);await this.admin.audit(c,actor,enabled?'staff_enabled':'staff_disabled',id,reason);
  });return {saved:true};
 }
 async login({username,password,ip}) {
  const now=this.ledger.clock(),key=createHmac('sha256',this.secret).update('ip:'+ip).digest('hex');
  const rate=(await this.pool.query(`INSERT INTO ${this.schema}.finance_login_limits(ip_hash,attempts,until_ms) VALUES($1,1,$2)
   ON CONFLICT(ip_hash) DO UPDATE SET attempts=CASE WHEN finance_login_limits.until_ms<=$3 THEN 1 ELSE finance_login_limits.attempts+1 END,until_ms=CASE WHEN finance_login_limits.until_ms<=$3 THEN $2 ELSE finance_login_limits.until_ms END RETURNING attempts`,[key,now+900000,now])).rows[0];
  if(rate.attempts>10)fail('Too many finance login attempts. Retry later.',429);
  if(typeof username!=='string'||username.length>80||typeof password!=='string'||password.length>200)fail('Invalid finance login.',401);
  const staff=(await this.pool.query(`SELECT * FROM ${this.schema}.finance_staff WHERE username=$1`,[username])).rows[0];
  const candidate=await this.passwordHash(password,staff?.password_salt||'unconfigured-finance-account');
  if(!staff?.enabled||!equal(candidate,staff.password_hash))fail('Invalid finance login.',401);
  const token=randomBytes(32).toString('hex');
  await this.pool.query(`DELETE FROM ${this.schema}.finance_sessions WHERE expires<$1`,[now]);
  await this.pool.query(`INSERT INTO ${this.schema}.finance_sessions(token_hash,staff_id,credential_tag,expires) VALUES($1,$2,$3,$4)`,[hash(token),staff.id,hash(staff.password_hash),now+4*3600000]);
  return {token,actor:{id:'staff:'+staff.id,role:staff.role,username:staff.username,csrf:this.csrf(token)}};
 }
 cookie(req){const value=(req.headers.cookie||'').split(';').map(v=>v.trim()).find(v=>v.startsWith('sendrack_finance='))?.slice(17);return /^[a-f0-9]{64}$/.test(value||'')?value:null;}
 async session(req){const token=this.cookie(req);if(!token)return null;
  const row=(await this.pool.query(`SELECT s.*,u.username,u.role,u.enabled,u.password_hash FROM ${this.schema}.finance_sessions s JOIN ${this.schema}.finance_staff u ON u.id=s.staff_id WHERE s.token_hash=$1`,[hash(token)])).rows[0];
  if(!row?.enabled||Number(row.expires)<=this.ledger.clock()||row.credential_tag!==hash(row.password_hash))return null;
  return {id:'staff:'+row.staff_id,username:row.username,role:row.role,csrf:this.csrf(token)};
 }
 async logout(req){const token=this.cookie(req);if(token)await this.pool.query(`DELETE FROM ${this.schema}.finance_sessions WHERE token_hash=$1`,[hash(token)]);}
 verifyCsrf(req,actor){if(!equal(req.headers['x-csrf-token'],actor.csrf))fail('Refresh the finance session before making changes.');}
}

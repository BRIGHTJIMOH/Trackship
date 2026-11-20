import {sharedRequestLimits} from './request-controls.mjs';
import {shipmentPage,scopedShipment,peoplePage,overviewSummary} from './operations-queries.mjs';
import {regionalAdministration} from './regional-admin.mjs';
import {randomUUID,randomBytes,createHash,createHmac,scrypt as scryptCallback,timingSafeEqual} from 'node:crypto';
import {promisify} from 'node:util';
const scrypt=promisify(scryptCallback),digest=s=>createHash('sha256').update(s).digest('hex');
const fail=(message,status=400)=>{const e=new Error(message);e.status=status;throw e;};
const equal=(a,b)=>{const x=Buffer.from(String(a)),y=Buffer.from(String(b));return x.length===y.length&&timingSafeEqual(x,y);};
const scrub=s=>{const {jobTokens,riderToken,publicToken,dispatchToken,locationConsent,...record}=s;return {...record,hasTrackingLink:Boolean(publicToken)};};
export async function adminConsole(db,{body,env,catalog}){
 await db.exec(`CREATE TABLE IF NOT EXISTS admin_sessions(token_hash TEXT PRIMARY KEY,credential_tag TEXT,expires INTEGER,created INTEGER);
 CREATE TABLE IF NOT EXISTS admin_audit(id TEXT PRIMARY KEY,actor TEXT,action TEXT,entity TEXT,entity_id TEXT,summary TEXT,created INTEGER);`);
 for(const table of ['vendor_accounts','rider_profiles'])if(!(await db.prepare('PRAGMA table_info('+table+')').all()).some(c=>c.name==='suspended'))await db.exec('ALTER TABLE '+table+' ADD COLUMN suspended INTEGER DEFAULT 0');
 const username=env.ADMIN_USERNAME||'owner',rawPassword=env.ADMIN_PASSWORD||'',encoded=env.ADMIN_PASSWORD_HASH||'',salt=randomBytes(16).toString('hex');
 const validRaw=rawPassword.length>=14&&rawPassword.length<=200&&rawPassword.trim().length>=14;let passwordHash=null,passwordSalt=salt;
 if(validRaw)passwordHash=await scrypt(rawPassword,salt,32,{N:32768,r:8,p:1,maxmem:64*1024*1024});
 else if(/^scrypt\$[a-f0-9]{32}\$[a-f0-9]{64}$/.test(encoded)){const p=encoded.split('$');passwordSalt=p[1];passwordHash=Buffer.from(p[2],'hex');}
 const configured=Boolean(passwordHash),credential=digest(validRaw?rawPassword:encoded),secret=env.TRACKSHIP_ADMIN_TOKEN||credential,tag=createHmac('sha256',secret).update(credential).digest('hex');
 const csrf=token=>createHmac('sha256',secret).update('csrf:'+token).digest('hex');
 const cookies=req=>req.headers.cookie?.split(';').map(s=>s.trim()).find(s=>s.startsWith('sendrack_owner='))?.slice('sendrack_owner='.length)||'';
 const setCookie=(res,value,maxAge)=>res.setHeader('Set-Cookie','sendrack_owner='+value+'; Path=/; HttpOnly; SameSite=Strict; Max-Age='+maxAge+(env.NODE_ENV==='production'?'; Secure':''));
 const loginRate=await sharedRequestLimits(db,env);
 const audit=async(actor,action,entity,id,summary='')=>db.prepare('INSERT INTO admin_audit(id,actor,action,entity,entity_id,summary,created) VALUES (?,?,?,?,?,?,?)').run(randomUUID(),actor,action,entity,id,String(summary).slice(0,300),Date.now());
 async function session(req){const token=cookies(req);if(!/^[a-f0-9]{64}$/.test(token)||!configured)return null;const s=await db.prepare('SELECT * FROM admin_sessions WHERE token_hash=?').get(digest(token));if(s&&s.expires>Date.now()&&equal(s.credential_tag,tag))return {actor:username,token,expires:s.expires,csrf:csrf(token)};const region=await regional.session(token);return region?{...region,csrf:csrf(token)}:null;}
 function origin(req){if(!req.headers.origin)return;let permitted=false;try{const u=new URL(req.headers.origin);permitted=u.host===req.headers.host&&['http:','https:'].includes(u.protocol);}catch{}if(!permitted)fail('Admin requests must come from this dashboard.',403);}
 async function authorize(req,{operator=true,regional:allowRegional=false}={}){const bearer=req.headers.authorization?.replace(/^Bearer /,'');if(operator&&env.TRACKSHIP_ADMIN_TOKEN&&bearer&&equal(bearer,env.TRACKSHIP_ADMIN_TOKEN))return {actor:'operator',operator:true};const s=await session(req);if(!s)fail('Log in to the owner dashboard.',401);if(s.regional&&!allowRegional)fail('This action is reserved for the owner.',403);if(!['GET','HEAD','OPTIONS'].includes(req.method)){origin(req);if(!equal(req.headers['x-csrf-token']||'',s.csrf))fail('Refresh the dashboard before making changes.',403);}return s;}
 const regional=await regionalAdministration(db,{authorize,audit,body,catalog,ownerUsername:username,tag});
 async function dispatch(req,res,url,send){const p=url.pathname;if(p==='/api/admin/login'&&req.method==='POST'){
  origin(req);if(!configured)fail('Owner login is not configured. Set a private admin password of at least 14 characters on the server.',503);
  const now=Date.now();
  const input=await body(req);if(typeof input.password!=='string'||input.password.length>200||typeof input.username!=='string'||input.username.length>80)fail('Invalid login details.',401);
  const manager=input.username!==username?await regional.login(input):null;
  const checked=await scrypt(input.password,passwordSalt,32,{N:32768,r:8,p:1,maxmem:64*1024*1024});if(!manager&&(!equal(input.username,username)||!timingSafeEqual(checked,passwordHash)))fail('Invalid login details.',401);
  const token=randomBytes(32).toString('hex'),expires=now+8*3600000;await db.prepare('DELETE FROM admin_sessions WHERE expires<?').run(now);if(manager)await regional.createSession(manager,token,expires);else await db.prepare('INSERT INTO admin_sessions VALUES (?,?,?,?)').run(digest(token),tag,expires,now);await audit(manager?.username||username,'login','session','current');setCookie(res,token,8*3600);send(200,{username:manager?.username||username,regional:Boolean(manager),states:manager?JSON.parse(manager.states):[],csrf:csrf(token),expires});return true;
 }
 if(p==='/api/admin/session'&&req.method==='GET'){const s=await authorize(req,{operator:false,regional:true});send(200,{username:s.actor,regional:Boolean(s.regional),states:s.states||[],csrf:s.csrf,expires:s.expires});return true;}
 if(await regional.manage(req,url,send))return true;
 const handled=['/api/admin/waitlist','/api/admin/logout','/api/admin/overview','/api/admin/shipments','/api/admin/users','/api/admin/routes','/api/admin/pricing','/api/admin/settlements','/api/admin/audit'];const detail=p.match(/^\/api\/admin\/(shipments|users|routes)\/([a-z0-9-]+)(?:\/(suspend|resume))?$/);
 const routeDelete=p.match(/^\/api\/admin\/routes\/([a-z0-9-]+)\/delete$/);
 if(!handled.includes(p)&&!detail&&!routeDelete)return false;
 const s=await authorize(req,{regional:true});const actor=s.actor;
 if(s.regional&&p!=='/api/admin/logout')return regional.scoped(req,url,send,s);
 if(p==='/api/admin/logout'&&req.method==='POST'){const token=cookies(req);if(token){await db.prepare('DELETE FROM admin_sessions WHERE token_hash=?').run(digest(token));await db.prepare('DELETE FROM regional_admin_sessions WHERE token_hash=?').run(digest(token));}setCookie(res,'',0);await audit(actor,'logout','session','current');send(200,{loggedOut:true});return true;}
 if(p==='/api/admin/overview'&&req.method==='GET'){const result=await overviewSummary(db,{routes:await catalog.list()});send(200,{...result,recent:result.recent.map(scrub)});return true;}
 if(p==='/api/admin/shipments'&&req.method==='GET'){const result=await shipmentPage(db,url,{removedAllowed:true});send(200,{...result,shipments:result.shipments.map(scrub)});return true;}
 if(detail?.[1]==='shipments'&&req.method==='GET'){const sh=await scopedShipment(db,detail[2]);if(!sh)fail('Shipment not found.',404);send(200,{shipment:scrub(sh),earnings:await db.prepare('SELECT id,leg,rider_id,amount,mode,status FROM earnings WHERE shipment_id=?').all(sh.id)});return true;}
 if(p==='/api/admin/waitlist'&&req.method==='GET'){
  const page=Math.max(1,Math.min(10000,Math.floor(Number(url.searchParams.get('page'))||1)));
  const total=(await db.prepare('SELECT COUNT(*) AS count FROM marketing_waitlist').get()).count;
  const entries=await db.prepare('SELECT name,email,role,city,created_at FROM marketing_waitlist ORDER BY created_at DESC,email LIMIT 50 OFFSET ?').all((page-1)*50);
  send(200,{page,total,entries});return true;
 }
 if(p==='/api/admin/users'&&req.method==='GET'){send(200,await peoplePage(db,url));return true;}
 if(detail?.[1]==='users'&&['suspend','resume'].includes(detail[3])&&req.method==='POST'){const input=await body(req),table=input.role==='vendor'?'vendor_accounts':input.role==='rider'?'rider_profiles':null;if(!table)fail('Choose vendor or rider.');const user=await db.prepare('SELECT id FROM '+table+' WHERE id=?').get(detail[2]);if(!user)fail('Account not found.',404);const suspended=detail[3]==='suspend'?1:0;await db.prepare('UPDATE '+table+' SET suspended=? WHERE id=?').run(suspended,user.id);if(suspended){await db.prepare('DELETE FROM '+(input.role==='vendor'?'vendor_sessions WHERE vendor_id=?':'rider_sessions WHERE rider_id=?')).run(user.id);if(input.role==='rider')for(const row of await db.prepare("SELECT s.payload FROM shipments s JOIN shipment_index i ON i.id=s.id WHERE i.tracking_rider=? AND i.removed=0").all(user.id)){const sh=JSON.parse(row.payload);await db.prepare('UPDATE shipments SET payload=? WHERE id=?').run(JSON.stringify({...sh,ownerId:undefined,location:null,locationConsent:null}),sh.id);}}await audit(actor,detail[3],'account',user.id,input.role);send(200,{suspended:Boolean(suspended)});return true;}
 if(routeDelete&&req.method==='POST'){const input=await body(req),result=await catalog.remove(routeDelete[1],input.revision);await audit(actor,'route.delete','route',result.id,result.name);send(200,result);return true;}
 if(p==='/api/admin/routes'&&req.method==='GET'){send(200,{routes:await catalog.list()});return true;}
 if((p==='/api/admin/routes'||detail?.[1]==='routes')&&req.method==='POST'){const input=await body(req);const result=await catalog.save(input,detail?.[2]);await audit(actor,detail?'route.update':'route.create','route',result.id,result.name);send(detail?200:201,result);return true;}
 if(p==='/api/admin/pricing'&&req.method==='GET'){send(200,await catalog.pricing());return true;}
 if(p==='/api/admin/pricing'&&req.method==='POST'){const result=await catalog.savePricing(await body(req));await audit(actor,'pricing.update','pricing','default','Platform/Express rules updated');send(200,result);return true;}
 if(p==='/api/admin/settlements'&&req.method==='GET'){const page=Math.max(1,Math.min(10000,Math.floor(Number(url.searchParams.get('page'))||1))),counts=await db.prepare('SELECT (SELECT COUNT(*) FROM earnings) AS entries,(SELECT COUNT(*) FROM payments) AS payments').get();send(200,{page,total:Math.max(Number(counts.entries),Number(counts.payments)),entries:await db.prepare("SELECT e.id,e.shipment_id,e.leg,e.rider_id,e.amount,e.mode,e.status,e.transfer_ref,e.created,COALESCE(r.display_name,'Handler') AS name FROM earnings e LEFT JOIN rider_profiles r ON r.id=e.rider_id ORDER BY e.created DESC,e.id DESC LIMIT 100 OFFSET ?").all((page-1)*100),payments:await db.prepare('SELECT reference,shipment_id,amount,mode,status,created FROM payments ORDER BY created DESC,reference DESC LIMIT 100 OFFSET ?').all((page-1)*100),payoutsEnabled:env.TRACKSHIP_ENABLE_PAYOUTS==='true'});return true;}
 if(p==='/api/admin/audit'&&req.method==='GET'){const page=Math.max(1,Math.min(10000,Math.floor(Number(url.searchParams.get('page'))||1))),total=(await db.prepare('SELECT COUNT(*) AS count FROM admin_audit').get()).count;send(200,{page,total,events:await db.prepare('SELECT * FROM admin_audit ORDER BY created DESC,id DESC LIMIT 100 OFFSET ?').all((page-1)*100)});return true;}
 fail('Method not allowed.',405);
 }
 async function route(req,res,url,send){if(url.pathname==='/api/admin/login'&&req.method==='POST'&&configured){origin(req);if(!await loginRate(req,'owner-login',8,600000))fail('Too many login attempts. Try again in ten minutes.',429);}if(!url.pathname.startsWith('/api/admin/')||['GET','HEAD','OPTIONS'].includes(req.method))return dispatch(req,res,url,send);await db.exec('BEGIN IMMEDIATE');try{let response=null;const handled=await dispatch(req,res,url,(status,value)=>{response={status,value};});await db.exec('COMMIT');if(response)send(response.status,response.value);return handled;}catch(e){await db.exec('ROLLBACK');throw e;}}
 return {route,authorize,audit};
}

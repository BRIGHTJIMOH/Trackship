import {randomBytes,randomUUID} from 'node:crypto';
import {normalizePhone} from '../web/core.mjs';
const fail=(message,status=400)=>{throw Object.assign(new Error(message),{status});};
const defaults=()=>({revision:0,enabled:false,campaignId:'waitlist-launch',title:'Invite vendors and riders',terms:'',startsAt:'',endsAt:''});
export async function referrals(db,{authorize,audit,body,account,publicOrigin}){
 await db.exec(`CREATE TABLE IF NOT EXISTS referral_settings(id TEXT PRIMARY KEY,payload TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS referral_codes(code TEXT PRIMARY KEY,account_role TEXT NOT NULL,account_id TEXT NOT NULL,display_name TEXT NOT NULL,created TEXT NOT NULL,UNIQUE(account_role,account_id));
 CREATE TABLE IF NOT EXISTS referral_entries(id TEXT PRIMARY KEY,campaign_id TEXT NOT NULL,referrer_code TEXT NOT NULL,waitlist_email TEXT NOT NULL UNIQUE,phone_key TEXT NOT NULL,status TEXT NOT NULL,created TEXT NOT NULL,reviewed_by TEXT,reviewed_at TEXT,reason TEXT,UNIQUE(campaign_id,phone_key));
 CREATE INDEX IF NOT EXISTS marketing_waitlist_whatsapp ON marketing_waitlist(whatsapp);
 CREATE INDEX IF NOT EXISTS referral_entries_counts ON referral_entries(campaign_id,referrer_code,status);
 CREATE INDEX IF NOT EXISTS referral_entries_review ON referral_entries(campaign_id,status,created,id);`);
 const inviteOrigin=new URL(publicOrigin).origin;
 const settings=async()=>{const r=await db.prepare('SELECT payload FROM referral_settings WHERE id=?').get('main');return r?JSON.parse(r.payload):defaults();};
 const active=c=>c.enabled&&(!c.startsAt||Date.parse(c.startsAt)<=Date.now())&&(!c.endsAt||Date.parse(c.endsAt)>Date.now());
 const transaction=async fn=>{await db.exec('BEGIN IMMEDIATE');try{const result=await fn();await db.exec('COMMIT');return result;}catch(e){await db.exec('ROLLBACK');throw e;}};
 async function principal(req){const a=await account(req);if(!a?.id||!['vendor','rider'].includes(a.role))fail('Sign in to your vendor or rider account.',401);return a;}
 async function ownCode(a){let row=await db.prepare('SELECT code,created FROM referral_codes WHERE account_role=? AND account_id=?').get(a.role,a.id);if(row)return row;
  for(let i=0;i<5;i++){const code='SR-'+(a.role==='vendor'?'V':'R')+'-'+randomBytes(8).toString('hex').toUpperCase();await db.prepare('INSERT INTO referral_codes(code,account_role,account_id,display_name,created) VALUES(?,?,?,?,?) ON CONFLICT DO NOTHING').run(code,a.role,a.id,a.name||'SendRack member',new Date().toISOString());row=await db.prepare('SELECT code,created FROM referral_codes WHERE account_role=? AND account_id=?').get(a.role,a.id);if(row)return row;}fail('Could not create your code. Please retry.',503);
 }
 async function summary(a,c){const code=await db.prepare('SELECT code FROM referral_codes WHERE account_role=? AND account_id=?').get(a.role,a.id);const totals=code?await db.prepare("SELECT status,COUNT(*) AS total FROM referral_entries WHERE campaign_id=? AND referrer_code=? GROUP BY status").all(c.campaignId,code.code):[];const counts={pending:0,approved:0,rejected:0};for(const r of totals)counts[r.status]=Number(r.total);return {code:code?.code||null,link:code?inviteOrigin+'/?ref='+encodeURIComponent(code.code)+'#waitlist':null,campaign:{title:c.title,terms:c.terms,active:active(c),startsAt:c.startsAt,endsAt:c.endsAt},counts};}
 async function registerWaitlist(p){
  const supplied=p.referralCode??'';if(typeof supplied!=='string'||supplied.length>32)fail('Check the referral code.');const code=supplied.trim().toUpperCase();if(code&&!/^SR-[VR]-[A-F0-9]{16}$/.test(code))fail('Check the referral code.');
  return transaction(async()=>{
   let referrer=null;const campaign=await settings();
   if(code){referrer=await db.prepare('SELECT code,account_role,account_id FROM referral_codes WHERE code=?').get(code);if(!referrer)fail('That referral code was not found. Check it or clear it to join without one.');}
   const existingContact=p.whatsapp?await db.prepare('SELECT email FROM marketing_waitlist WHERE whatsapp=? LIMIT 1').get(p.whatsapp):null;
   const result=await db.prepare('INSERT INTO marketing_waitlist(email,name,role,city,created_at,whatsapp,whatsapp_consent,whatsapp_consented_at) VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(email) DO NOTHING').run(p.email,p.name,p.role,p.city,p.createdAt,p.whatsapp||null,p.whatsappConsent?1:0,p.whatsappConsent?p.createdAt:null);
   if(!result.changes)return {referralMessage:code?'Your place is already saved. Existing sign-ups do not count as new referrals.':''};
   if(!code)return {referralMessage:''};
   if(existingContact)return {referralMessage:'Your place is saved. This contact is already on the waitlist and is not counted again.'};
   if(!active(campaign))return {referralMessage:'Your place is saved. The referral promotion is not currently active, so this signup does not count toward it.'};
   if(!p.whatsapp||!p.whatsappConsent)return {referralMessage:'Your place is saved. A WhatsApp number and WhatsApp consent are needed for referral review.'};
   const table=referrer.account_role==='vendor'?'vendor_accounts':'rider_profiles';
   const owner=await db.prepare('SELECT phone,email,suspended FROM '+table+' WHERE id=?').get(referrer.account_id);
   if(!owner||owner.suspended)return {referralMessage:'Your place is saved. This referral is not eligible for the promotion.'};
   if(normalizePhone(owner.phone)===p.whatsapp||String(owner.email||'').toLowerCase()===p.email)return {referralMessage:'Your place is saved. Self-referrals do not count.'};
   const inserted=await db.prepare("INSERT INTO referral_entries(id,campaign_id,referrer_code,waitlist_email,phone_key,status,created) VALUES(?,?,?,?,?,'pending',?) ON CONFLICT DO NOTHING").run(randomUUID(),campaign.campaignId,code,p.email,p.whatsapp,p.createdAt);
   return {referralMessage:inserted.changes?'Your referral was recorded and is pending review.':'Your place is saved. This contact has already been entered for the promotion and is not counted again.'};
  });
 }
 async function route(req,url,send){
  const path=url.pathname;
  if(path==='/api/referrals/me'&&req.method==='GET'){const a=await principal(req);send(200,await summary(a,await settings()));return true;}
  if(path==='/api/referrals/code'&&req.method==='POST'){const a=await principal(req);await transaction(()=>ownCode(a));send(200,await summary(a,await settings()));return true;}
  if(path!=='/api/admin/referrals'&&path!=='/api/admin/referrals/review')return false;
  const owner=await authorize(req,{operator:false});
  if(path==='/api/admin/referrals'&&req.method==='GET'){
   const c=await settings();const leaders=await db.prepare("SELECT r.code,r.account_role,r.display_name,COUNT(e.id) AS total,COALESCE(SUM(CASE WHEN e.status='approved' THEN 1 ELSE 0 END),0) AS approved,COALESCE(SUM(CASE WHEN e.status='pending' THEN 1 ELSE 0 END),0) AS pending FROM referral_codes r LEFT JOIN referral_entries e ON e.referrer_code=r.code AND e.campaign_id=? GROUP BY r.code,r.account_role,r.display_name ORDER BY approved DESC,total DESC,r.code LIMIT 100").all(c.campaignId);
   const pending=await db.prepare("SELECT e.id,e.referrer_code,e.created,w.name,w.email,w.whatsapp,w.role,w.city FROM referral_entries e JOIN marketing_waitlist w ON w.email=e.waitlist_email WHERE e.campaign_id=? AND e.status='pending' ORDER BY e.created,e.id LIMIT 100").all(c.campaignId);
   const totals=await db.prepare('SELECT status,COUNT(*) AS total FROM referral_entries WHERE campaign_id=? GROUP BY status').all(c.campaignId);
   send(200,{...c,active:active(c),leaders,pending,totals});return true;
  }
  if(req.method!=='POST'){send(405,{error:'Method not allowed.'});return true;}
  const p=await body(req,8192);
  if(path.endsWith('/review')){
   if(typeof p.id!=='string'||!['approved','rejected'].includes(p.status)||typeof p.reason!=='string'||p.reason.trim().length<3||p.reason.length>300)fail('Choose approve/reject and add a review reason.');
   await transaction(async()=>{const c=await settings();const row=await db.prepare("SELECT id FROM referral_entries WHERE id=? AND campaign_id=? AND status='pending'").get(p.id,c.campaignId);if(!row)fail('This referral has already changed. Refresh the list.',409);const result=await db.prepare("UPDATE referral_entries SET status=?,reviewed_by=?,reviewed_at=?,reason=? WHERE id=? AND status='pending'").run(p.status,owner.actor,new Date().toISOString(),p.reason.trim(),p.id);if(!result.changes)fail('This referral has already changed. Refresh the list.',409);await audit(owner.actor,'referral.'+p.status,'referral',p.id,p.reason.trim());});send(200,{reviewed:true});return true;
  }
  if(typeof p.enabled!=='boolean'||typeof p.title!=='string'||!p.title.trim()||p.title.length>100||typeof p.terms!=='string'||p.terms.length>1500)fail('Check the campaign title and terms.');
  if(p.enabled&&!p.terms.trim())fail('Add the qualifying rules and prize status before turning the promotion on.');
  for(const k of ['startsAt','endsAt'])if(typeof p[k]!=='string'||p[k].length>40||p[k]&&!Number.isFinite(Date.parse(p[k])))fail('Use valid campaign dates.');
  const start=p.startsAt?new Date(p.startsAt).toISOString():'',end=p.endsAt?new Date(p.endsAt).toISOString():'';if(start&&end&&start>=end||p.enabled&&end&&Date.parse(end)<=Date.now())fail('Choose a valid campaign period.');
  const c=await transaction(async()=>{const old=await settings();if(p.revision!==old.revision)fail('Campaign settings changed. Refresh before saving.',409);const next={revision:old.revision+1,enabled:p.enabled,campaignId:old.campaignId,title:p.title.trim(),terms:p.terms.trim(),startsAt:start,endsAt:end};const r=old.revision===0?await db.prepare('INSERT INTO referral_settings(id,payload) VALUES(?,?) ON CONFLICT(id) DO NOTHING').run('main',JSON.stringify(next)):await db.prepare('UPDATE referral_settings SET payload=? WHERE id=? AND payload=?').run(JSON.stringify(next),'main',JSON.stringify(old));if(!r.changes)fail('Campaign settings changed. Refresh before saving.',409);await audit(owner.actor,'referral.settings','settings','main',next.enabled?'Enabled':'Disabled');return next;});send(200,c);return true;
 }
 return {route,registerWaitlist};
}

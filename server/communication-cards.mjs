import {randomUUID} from 'node:crypto';
const fail=(message,status=400)=>{throw Object.assign(new Error(message),{status});};
const blank=()=>({title:'',message:'',audience:'both',startsAt:'',endsAt:'',action:'none',buttonLabel:''});
export async function communicationCards(db,{authorize,audit,body}){
 await db.exec('CREATE TABLE IF NOT EXISTS communication_cards(id TEXT PRIMARY KEY,payload TEXT NOT NULL)');
 const read=async()=>{const r=await db.prepare('SELECT payload FROM communication_cards WHERE id=?').get('main');return r?JSON.parse(r.payload):{revision:0,draft:blank(),published:null};};
 function validate(p){
  if(!p||typeof p!=='object')fail('Complete the card details.');
  const c={};for(const[k,max]of [['title',100],['message',500],['buttonLabel',35]]){if(typeof p[k]!=='string'||p[k].length>max)fail('Check the card text and its length.');c[k]=p[k].trim();}
  if(!c.title||!c.message)fail('Add a title and message.');
  if(!['both','vendor','rider'].includes(p.audience))fail('Choose the card audience.');c.audience=p.audience;
  if(!['none','track','create','notifications','profile'].includes(p.action))fail('Choose a supported button destination.');c.action=p.action;
  if(c.action!=='none'&&!c.buttonLabel)fail('Add button text.');
  for(const k of ['startsAt','endsAt']){if(typeof p[k]!=='string'||p[k].length>40||p[k]&&!Number.isFinite(Date.parse(p[k])))fail('Use valid start and end times.');c[k]=p[k]?new Date(p[k]).toISOString():'';}
  if(c.endsAt&&Date.parse(c.endsAt)<=Date.now())fail('Choose an end time in the future.');
  if(c.startsAt&&c.endsAt&&c.startsAt>=c.endsAt)fail('End time must be after start time.');return c;
 }
 return async(req,url,send)=>{
  if(url.pathname==='/api/communication-cards'&&req.method==='GET'){
   const role=url.searchParams.get('role');if(!['vendor','rider'].includes(role))fail('Choose vendor or rider.');
   const {published:c}=await read(),now=Date.now();const active=c&&(!c.startsAt||Date.parse(c.startsAt)<=now)&&(!c.endsAt||Date.parse(c.endsAt)>now)&&(c.audience==='both'||c.audience===role);
   send(200,{card:active?c:null});return true;
  }
  if(url.pathname!=='/api/admin/communication-cards')return false;
  const owner=await authorize(req,{operator:false});
  if(req.method==='GET'){send(200,await read());return true;}
  if(req.method!=='POST'){send(405,{error:'Method not allowed.'});return true;}
  const p=await body(req,8192);if(!['save','publish','unpublish'].includes(p.operation))fail('Choose save, publish or turn off.');
  await db.exec('BEGIN IMMEDIATE');try{
   const old=await read();if(p.revision!==old.revision)fail('This card changed. Refresh before saving.',409);
   const draft=p.operation==='unpublish'?old.draft:validate(p.card);
   const next={revision:old.revision+1,draft,published:p.operation==='save'?old.published:p.operation==='unpublish'?null:{...draft,id:randomUUID(),publishedAt:new Date().toISOString()}};
   const result=old.revision===0?await db.prepare('INSERT INTO communication_cards(id,payload) VALUES(?,?) ON CONFLICT(id) DO NOTHING').run('main',JSON.stringify(next)):await db.prepare('UPDATE communication_cards SET payload=? WHERE id=? AND payload=?').run(JSON.stringify(next),'main',JSON.stringify(old));
   if(!result.changes)fail('This card changed. Refresh before saving.',409);
   await audit(owner.actor,'communication_card.'+p.operation,'settings','main',draft.title);await db.exec('COMMIT');send(200,next);return true;
  }catch(e){await db.exec('ROLLBACK');throw e;}
 };
}

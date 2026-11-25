const fail=(message,status=400)=>{throw Object.assign(new Error(message),{status});};
const initial=()=>({revision:0,members:[{id:'bright-jimoh',name:'Bright Jimoh',role:'Founder',responsibility:'Communications, community engagement and company direction',bio:'Bright Jimoh is the founder of SendRack. He leads communications and community engagement, and shapes the company’s direction around helping vendors grow and expanding earning opportunities for riders and vehicle owners.',published:true}]});
function profilePhoto(value){
 if(value===undefined||value==='')return '';
 if(typeof value!=='string'||value.length>120000||!/^data:image\/(jpeg|png);base64,[A-Za-z0-9+/]+={0,2}$/.test(value))fail('Choose a JPG or PNG profile photo under 90 KB after resizing.');
 const bytes=Buffer.from(value.split(',')[1],'base64');
 const png=value.startsWith('data:image/png;')&&bytes.length>=24&&bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
 const jpeg=value.startsWith('data:image/jpeg;')&&bytes.length>=4&&bytes[0]===255&&bytes[1]===216&&bytes[2]===255&&bytes.at(-2)===255&&bytes.at(-1)===217;
 if(!png&&!jpeg)fail('Choose a valid JPG or PNG profile photo.');return value;
}
export async function websiteTeam(db,{authorize,audit,body}){
 await db.exec('CREATE TABLE IF NOT EXISTS website_team(id TEXT PRIMARY KEY,payload TEXT NOT NULL)');
 const read=async()=>{const row=await db.prepare('SELECT payload FROM website_team WHERE id=?').get('main');return row?JSON.parse(row.payload):initial();};
 return async(req,path,send)=>{
  if(path==='/api/website-team'&&req.method==='GET'){const d=await read();send(200,{members:d.members.filter(m=>m.published).map(({published,...m})=>m)});return true;}
  if(path!=='/api/admin/website-team')return false;
  const owner=await authorize(req,{operator:false});
  if(req.method==='GET'){send(200,await read());return true;}
  if(req.method!=='POST'){send(405,{error:'Method not allowed.'});return true;}
  const input=await body(req,3800000);
  if(!Number.isSafeInteger(input.revision)||!Array.isArray(input.members)||input.members.length>30)fail('Use at most 30 team profiles and a valid revision.');
  const ids=new Set(),members=input.members.map(m=>{
   if(!m||typeof m!=='object'||typeof m.id!=='string'||!/^[a-z0-9-]{1,80}$/.test(m.id)||ids.has(m.id))fail('Each member needs a unique profile reference.');ids.add(m.id);
   const result={id:m.id,published:m.published===true,photo:profilePhoto(m.photo)};
   for(const [key,max]of [['name',100],['role',120],['responsibility',240],['bio',1600]]){if(typeof m[key]!=='string'||m[key].trim().length>max)fail('Check the '+key+' field length.');result[key]=m[key].trim();}
   if(result.published&&['name','role','responsibility','bio'].some(k=>!result[k]))fail('Add a name, role, responsibilities and bio before publishing.');return result;
  });
  await db.exec('BEGIN IMMEDIATE');try{
   const previous=await read();if(input.revision!==previous.revision)fail('Team profiles changed. Refresh before saving.',409);
   const next={revision:previous.revision+1,members};
   const result=previous.revision===0?await db.prepare('INSERT INTO website_team(id,payload) VALUES(?,?) ON CONFLICT(id) DO NOTHING').run('main',JSON.stringify(next)):await db.prepare('UPDATE website_team SET payload=? WHERE id=? AND payload=?').run(JSON.stringify(next),'main',JSON.stringify(previous));
   if(!result.changes)fail('Team profiles changed. Refresh before saving.',409);
   await audit(owner.actor,'website_team.update','settings','main',members.length+' team profiles');await db.exec('COMMIT');send(200,next);return true;
  }catch(e){await db.exec('ROLLBACK');throw e;}
 };
}

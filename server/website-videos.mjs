const slots=['founder','problem-1','problem-2','problem-3','problem-4','problem-5'];
const fail=(message,status=400)=>{throw Object.assign(new Error(message),{status});};
export function videoSource(value){
 let u;try{u=new URL(value);}catch{fail('Use a complete HTTPS video link.');}
 if(u.protocol!=='https:'||u.username||u.password)fail('Use a public HTTPS video link.');
 const host=u.hostname.toLowerCase();let id;
 if(host==='youtu.be')id=u.pathname.slice(1);
 else if(['youtube.com','www.youtube.com','m.youtube.com'].includes(host))id=u.searchParams.get('v')||u.pathname.match(/^\/(?:embed|shorts)\/([^/]+)$/)?.[1];
 if(id&&/^[\w-]{11}$/.test(id))return {type:'youtube',src:'https://www.youtube-nocookie.com/embed/'+id};
 if(['vimeo.com','www.vimeo.com'].includes(host)&&/^\/\d+$/.test(u.pathname))return {type:'vimeo',src:'https://player.vimeo.com/video'+u.pathname};
 if(/\.mp4$/i.test(u.pathname))return {type:'file',src:u.href};
 fail('Use a YouTube, public Vimeo or direct MP4 link.');
}
export async function websiteVideos(db,{authorize,body}){
 await db.exec('CREATE TABLE IF NOT EXISTS website_videos (id TEXT PRIMARY KEY, payload TEXT NOT NULL)');
 const empty=()=>({revision:0,videos:slots.map(id=>({id,title:'',url:'',description:'',speakerName:'',speakerRole:'',quote:'',published:false}))});
 const read=async()=>{const row=await db.prepare('SELECT payload FROM website_videos WHERE id=?').get('main');return row?JSON.parse(row.payload):empty();};
 return async(req,path,send)=>{
 if(path==='/api/website-videos'&&req.method==='GET'){const d=await read();send(200,{videos:d.videos.filter(v=>v.published&&v.url).map(v=>({id:v.id,title:v.title,description:v.description||'',speakerName:v.speakerName||'',speakerRole:v.speakerRole||'',quote:v.quote||'',...videoSource(v.url)}))});return true;}
 if(path!=='/api/admin/website-videos')return false;
 await authorize(req,{operator:false});
 if(req.method==='GET'){send(200,await read());return true;}
 if(req.method!=='POST'){send(405,{error:'Method not allowed.'});return true;}
 const input=await body(req),previous=await read();
 if(input.revision!==previous.revision)fail('Videos changed. Refresh before saving.',409);
 if(!Array.isArray(input.videos)||input.videos.length!==6||!slots.every(id=>input.videos.filter(v=>v.id===id).length===1))fail('Keep one founder video and five problem videos.');
 const videos=slots.map(id=>{const v=input.videos.find(v=>v.id===id),title=String(v.title||'').trim(),url=String(v.url||'').trim();if(title.length>120||url.length>1500)fail('Title or link is too long.');if(url)videoSource(url);if(v.published&&(!title||!url))fail('Add a title and link before publishing.');const details={};for(const [key,max]of [['description',1200],['speakerName',100],['speakerRole',120],['quote',600]]){const value=v[key]??previous.videos.find(old=>old.id===id)?.[key]??'';if(typeof value!=='string'||value.trim().length>max)fail('Check the '+key+' field length.');details[key]=value.trim();}return {id,title,url,...details,published:v.published===true};});
 const next={revision:previous.revision+1,videos};
 const result=previous.revision===0?await db.prepare('INSERT INTO website_videos(id,payload) VALUES(?,?) ON CONFLICT(id) DO NOTHING').run('main',JSON.stringify(next)):await db.prepare('UPDATE website_videos SET payload=? WHERE id=? AND payload=?').run(JSON.stringify(next),'main',JSON.stringify(previous));
 if(!result.changes)fail('Videos changed. Refresh before saving.',409);
 send(200,next);return true;
 };
}

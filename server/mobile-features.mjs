const fail=(message,status=400)=>{throw Object.assign(new Error(message),{status});};
export async function mobileFeatures(db,{authorize,audit,body}){
 await db.exec('CREATE TABLE IF NOT EXISTS mobile_features(id TEXT PRIMARY KEY,payload TEXT NOT NULL)');
 const read=async()=>{const row=await db.prepare('SELECT payload FROM mobile_features WHERE id=?').get('main');return row?JSON.parse(row.payload):{revision:0,bulkShipments:false,receiveParcel:false};};
 return {read,async route(req,path,send){
  if(path==='/api/mobile-features'&&req.method==='GET'){send(200,await read());return true;}
  if(path!=='/api/admin/mobile-features')return false;
  const session=await authorize(req,{operator:false});
  if(req.method==='GET'){send(200,await read());return true;}
  if(req.method!=='POST'){send(405,{error:'Method not allowed.'});return true;}
  const input=await body(req),previous=await read();
  if(input.revision!==previous.revision)fail('Feature settings changed. Refresh before saving.',409);
  if(typeof input.bulkShipments!=='boolean'||typeof input.receiveParcel!=='boolean')fail('Choose on or off for each mobile feature.');
  const next={revision:previous.revision+1,bulkShipments:input.bulkShipments,receiveParcel:input.receiveParcel};
  await db.exec('BEGIN IMMEDIATE');try{
   const result=previous.revision===0?await db.prepare('INSERT INTO mobile_features(id,payload) VALUES(?,?) ON CONFLICT(id) DO NOTHING').run('main',JSON.stringify(next)):await db.prepare('UPDATE mobile_features SET payload=? WHERE id=? AND payload=?').run(JSON.stringify(next),'main',JSON.stringify(previous));
   if(!result.changes)fail('Feature settings changed. Refresh before saving.',409);
   await audit(session.actor,'mobile_features.update','settings','main',JSON.stringify(next));await db.exec('COMMIT');
  }catch(e){await db.exec('ROLLBACK');throw e;}
  send(200,next);return true;
 }};
}

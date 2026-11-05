import {DatabaseSync} from 'node:sqlite';
import {existsSync} from 'node:fs';
import {createHash,createDecipheriv} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {createApp} from './server.mjs';
const TABLES=['marketing_waitlist','workspaces','shipments','auth_challenges','rider_sessions','rider_profiles','job_tokens','delivery_proofs','payments','earnings','vendor_accounts','vendor_sessions','account_challenges','delivery_notifications','admin_sessions','admin_audit','admin_routes','admin_pricing'];
const identifier=name=>{if(!/^[a-z_]+$/.test(name))throw new Error('Unexpected database identifier.');return '"'+name+'"';};
const checksum=(rows,columns)=>createHash('sha256').update(JSON.stringify(rows.map(row=>columns.map(c=>row[c]??null)).map(JSON.stringify).sort())).digest('hex');
export function sqliteSnapshot(filename){
 if(!filename||!existsSync(filename))throw new Error('An existing SQLite source file is required.');
 const source=new DatabaseSync(filename,{readOnly:true});
 try{
  const check=source.prepare('PRAGMA quick_check').get();if(check.quick_check!=='ok')throw new Error('SQLite integrity check failed.');source.exec('BEGIN');
  const names=source.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all().map(r=>r.name);
  if(names.some(n=>!TABLES.includes(n)))throw new Error('Source has unknown tables; review them before migration.');
  const snapshot=[];for(const table of TABLES.filter(t=>names.includes(t))){const columns=source.prepare('PRAGMA table_info('+table+')').all().map(c=>c.name);const rows=source.prepare('SELECT * FROM '+identifier(table)).all();snapshot.push({table,columns,rows,checksum:checksum(rows,columns)});}source.exec('COMMIT');return snapshot;
 }finally{source.close();}
}
export async function migrateSqlite({source,env=process.env,apply=false}={}){
 const snapshot=sqliteSnapshot(source),counts=Object.fromEntries(snapshot.map(s=>[s.table,s.rows.length]));
 if(!apply)return {mode:'dry-run',counts,message:'Source read only. No target changes were made.'};
 if(!env.DATABASE_URL)throw new Error('DATABASE_URL is required to import into PostgreSQL.');
 const encrypted=snapshot.filter(t=>['vendor_accounts','rider_profiles'].includes(t.table)).flatMap(t=>t.rows).filter(r=>r.identity_cipher);
 if(encrypted.length){const raw=env.TRACKSHIP_IDENTITY_KEY||'';if(raw.length<32)throw new Error('The existing identity encryption key is required before importing documents.');const key=/^[a-f0-9]{64}$/.test(raw)?Buffer.from(raw,'hex'):createHash('sha256').update(raw).digest();try{for(const row of encrypted){const p=JSON.parse(row.identity_cipher),cipher=createDecipheriv('aes-256-gcm',key,Buffer.from(p.iv,'hex'));cipher.setAuthTag(Buffer.from(p.tag,'hex'));JSON.parse(Buffer.concat([cipher.update(Buffer.from(p.data,'hex')),cipher.final()]).toString());}}catch{throw new Error('Identity key verification failed. Import refused to prevent unreadable documents.');}}
 const server=await createApp({env});const db=server.database;
 try{
  if(db.kind!=='postgres')throw new Error('Migration target must be PostgreSQL.');
  await db.withRequest('POST',async()=>{
   // Never overwrite an existing account, shipment or ledger, even if IDs appear to match.
   for(const table of TABLES){const row=await db.prepare('SELECT COUNT(*) AS count FROM '+identifier(table)).get();if(row.count!==0)throw new Error('Target is not empty. Import was refused.');}
   await db.exec('BEGIN IMMEDIATE');try{
    for(const {table,columns,rows}of snapshot){const targetColumns=(await db.prepare('PRAGMA table_info('+table+')').all()).map(c=>c.name);if(columns.some(c=>!targetColumns.includes(c)))throw new Error('Target schema does not support all source columns.');
     const insert=db.prepare('INSERT INTO '+identifier(table)+' ('+columns.map(identifier).join(',')+') VALUES ('+columns.map(()=>'?').join(',')+')');for(const row of rows)await insert.run(...columns.map(c=>row[c]??null));
    }
    for(const table of snapshot){const rows=await db.prepare('SELECT '+table.columns.map(identifier).join(',')+' FROM '+identifier(table.table)).all();if(rows.length!==table.rows.length||checksum(rows,table.columns)!==table.checksum)throw new Error('Migration verification failed; transaction rolled back.');}
    await db.exec('COMMIT');
   }catch(e){await db.exec('ROLLBACK');throw e;}
  });
  return {mode:'applied',counts,verified:true,message:'All source row counts and checksums match. Preserve the existing identity encryption key.'};
 }finally{await new Promise(resolve=>server.close(()=>resolve()));await server.databaseClosed;}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const args=process.argv.slice(2),source=args.find(a=>!a.startsWith('--'));
 try{console.log(JSON.stringify(await migrateSqlite({source,apply:args.includes('--apply')}),null,2));}catch{console.error('Migration failed. Check the source, empty target, database access, identity key and schema. No existing target rows are overwritten.');process.exitCode=1;}
}

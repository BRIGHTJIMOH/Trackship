import {DatabaseSync} from 'node:sqlite';
import {AsyncLocalStorage} from 'node:async_hooks';
import {mkdirSync} from 'node:fs';
import path from 'node:path';
import pg from 'pg';
pg.types.setTypeParser(20,value=>{const n=Number(value);if(!Number.isSafeInteger(n))throw new Error('Database integer exceeds the supported range.');return n;});
const LOCK=738291604;
function serial(){let tail=Promise.resolve();return async fn=>{const previous=tail;let release;tail=new Promise(r=>{release=r;});await previous;try{return await fn();}finally{release();}};}
export function postgresSql(sql){
 let result='',quoted=false,index=0;
 for(let i=0;i<sql.length;i++){const c=sql[i];if(c==="'"){result+=c;if(quoted&&sql[i+1]==="'"){result+=sql[++i];continue;}quoted=!quoted;}else result+=c==='?'&&!quoted?'$'+(++index):c;}
 result=result.replace(/\bINTEGER\b/gi,'BIGINT').replace(/^BEGIN IMMEDIATE$/i,'BEGIN');
 if(/^INSERT OR IGNORE /i.test(result))result=result.replace(/^INSERT OR IGNORE /i,'INSERT ')+' ON CONFLICT DO NOTHING';
 return result;
}
export async function openDatabase({env=process.env,dataDir='.data'}={}){
 const scope=new AsyncLocalStorage(),exclusive=serial();
 if(!env.DATABASE_URL){
  if(env.NODE_ENV==='production')throw new Error('DATABASE_URL is required in production. SQLite is available for local development.');
  mkdirSync(dataDir,{recursive:true,mode:0o700});const sqlite=new DatabaseSync(path.join(dataDir,'trackship.sqlite'));sqlite.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000');
  return {kind:'sqlite',prepare:sql=>{const s=sqlite.prepare(sql);return {get:async(...args)=>s.get(...args),all:async(...args)=>s.all(...args),run:async(...args)=>s.run(...args)};},exec:async sql=>sqlite.exec(sql),close:async()=>sqlite.close(),withRequest:async(method,fn)=>scope.getStore()?fn():exclusive(()=>scope.run({sqlite:true},fn))};
 }
 let url;try{url=new URL(env.DATABASE_URL);}catch{throw new Error('DATABASE_URL must be a valid PostgreSQL connection URL.');}if(!['postgres:','postgresql:'].includes(url.protocol))throw new Error('DATABASE_URL must be a PostgreSQL connection URL.');
 const local=['localhost','127.0.0.1','::1','[::1]'].includes(url.hostname);const sslmode=env.DATABASE_SSL||(local?'disable':'require');if(!['disable','require'].includes(sslmode))throw new Error('DATABASE_SSL must be require or disable.');
 // Driver URL flags must not silently override certificate verification.
 for(const key of ['sslmode','sslcert','sslkey','sslrootcert','uselibpqcompat'])url.searchParams.delete(key);
 const config={connectionString:url.toString(),ssl:sslmode==='require'?{rejectUnauthorized:true}:false,connectionTimeoutMillis:10000,idleTimeoutMillis:30000,statement_timeout:20000,application_name:'sendrack'};
 const pool=new pg.Pool({...config,max:6}),writes=new pg.Pool({...config,max:1});let failed=false;
 const onError=()=>{failed=true;};pool.on('error',onError);writes.on('error',onError);
 const execute=async(sql,args=[])=>{
  const pragma=sql.match(/^PRAGMA table_info\(([a-z_]+)\)$/i);
  const client=scope.getStore()?.client||pool;
  if(pragma)return client.query('SELECT column_name AS name FROM information_schema.columns WHERE table_schema=current_schema() AND table_name=$1',[pragma[1]]);
  return client.query(postgresSql(sql),args);
 };
 try{await pool.query('SELECT 1');}catch{await Promise.allSettled([pool.end(),writes.end()]);throw new Error('PostgreSQL connection failed. Check DATABASE_URL, DATABASE_SSL and network access.');}
 return {kind:'postgres',prepare:sql=>({get:async(...args)=>(await execute(sql,args)).rows[0],all:async(...args)=>(await execute(sql,args)).rows,run:async(...args)=>({changes:(await execute(sql,args)).rowCount})}),exec:async sql=>execute(sql),close:async()=>{await Promise.all([pool.end(),writes.end()]);},
 async withRequest(method,fn){
  if(scope.getStore())return fn();const mutation=!['GET','HEAD','OPTIONS'].includes(method);const client=await(mutation?writes:pool).connect();let broken=false;
  try{
   // Serialize pilot mutations across instances while JSON shipment records are updated.
   // Reads use a separate pool so a payment/SMS provider cannot block customer tracking reads.
   if(mutation)await client.query('SELECT pg_advisory_lock($1)',[LOCK]);
   return await scope.run({client},fn);
  }catch(e){if(['57P01','08006','08003'].includes(e.code))broken=true;throw e;}
  finally{if(mutation&&!broken)try{await client.query('ROLLBACK');await client.query('SELECT pg_advisory_unlock($1)',[LOCK]);}catch{broken=true;}client.release(broken||undefined);}
 },get connectionFailed(){return failed;}};
}

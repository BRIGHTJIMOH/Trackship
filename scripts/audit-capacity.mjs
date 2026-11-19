// Local-only architecture experiment, NOT a production load test or capacity certificate.
import {randomBytes} from 'node:crypto';import {performance} from 'node:perf_hooks';import {writeFile} from 'node:fs/promises';import pg from 'pg';import {openDatabase} from '../server/database.mjs';
const target=process.env.SENDRACK_AUDIT_POSTGRES_URL;if(!target)throw Error('Set SENDRACK_AUDIT_POSTGRES_URL to an isolated local PostgreSQL database.');const url=new URL(target);if(!['127.0.0.1','localhost','[::1]'].includes(url.hostname))throw Error('This experiment only permits a local disposable database.');
const schema='capacity_audit_'+randomBytes(6).toString('hex'),client=new pg.Client({connectionString:target,ssl:false});await client.connect();await client.query(`CREATE SCHEMA ${schema}`);url.searchParams.set('options','-c search_path='+schema);const env={DATABASE_URL:url.toString(),DATABASE_SSL:'disable'};const adapters=[];
const percentile=(a,p)=>[...a].sort((x,y)=>x-y)[Math.min(a.length-1,Math.floor(a.length*p))];const result={scope:'Isolated local PostgreSQL adapter experiment; synthetic waits/data; not HTTP load, not production, not a supported-user count.',databaseVersion:(await client.query('SHOW server_version')).rows[0].server_version,lock:[],scans:[]};
try{
 adapters.push(await openDatabase({env}),await openDatabase({env}));
 for(const instances of [1,2])for(const delayMs of [40,100]){
  let active=0,maxActive=0;const durations=[],starts=performance.now();
  await Promise.all(Array.from({length:20},async(_,i)=>{const requested=performance.now();await adapters[i%instances].withRequest('POST',async()=>{active++;maxActive=Math.max(maxActive,active);try{await adapters[i%instances].prepare('SELECT pg_sleep(?)').get(delayMs/1000);}finally{active--;}});durations.push(performance.now()-requested);}));
  const elapsedMs=performance.now()-starts;result.lock.push({instances,operations:20,syntheticLockHoldMs:delayMs,maxConcurrentMutationBodies:maxActive,elapsedMs:Math.round(elapsedMs),p95CompletionMs:Math.round(percentile(durations,.95)),operationsPerSecond:Number((20000/elapsedMs).toFixed(2))});
 }
 await adapters[0].withRequest('POST',()=>adapters[0].exec('CREATE TABLE shipments(id TEXT PRIMARY KEY,owner TEXT NOT NULL,public_hash TEXT UNIQUE NOT NULL,payload TEXT NOT NULL,rider_hash TEXT UNIQUE)'));
 for(const rows of [5000,50000]){
  await client.query(`TRUNCATE ${schema}.shipments`);await client.query(`INSERT INTO ${schema}.shipments SELECT i::text,'vendor-'||(i%1000),md5(i::text),json_build_object('id',i::text,'owner',i%1000,'status','Created','description',repeat('x',1024))::text,NULL FROM generate_series(1,$1) i`,[rows]);await client.query(`ANALYZE ${schema}.shipments`);
  const sample=[];for(let i=0;i<3;i++){const start=performance.now();const values=await adapters[0].withRequest('GET',()=>adapters[0].prepare('SELECT payload FROM shipments').all());values.map(x=>JSON.parse(x.payload));sample.push(performance.now()-start);}
  const plan=(await client.query(`EXPLAIN (ANALYZE, FORMAT JSON) SELECT payload FROM ${schema}.shipments WHERE owner='vendor-1'`)).rows[0]['QUERY PLAN'][0];result.scans.push({rows,fullReadAndJsonParseMedianMs:Math.round(percentile(sample,.5)),ownerLookupPlan:plan.Plan['Node Type'],ownerLookupReturned:plan.Plan['Actual Rows'],ownerLookupRowsRemoved:plan.Plan['Rows Removed by Filter'],ownerLookupExecutionMs:plan['Execution Time']});
 }
 const out=process.env.SENDRACK_AUDIT_OUTPUT||'/tmp/sendrack-capacity-evidence.json';await writeFile(out,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));
}finally{await Promise.allSettled(adapters.map(x=>x.close()));await client.query(`DROP SCHEMA ${schema} CASCADE`);await client.end();}

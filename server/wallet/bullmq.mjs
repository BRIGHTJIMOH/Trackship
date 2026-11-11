import {Queue, Worker} from 'bullmq';
// Redis is an optional dispatcher. PostgreSQL outbox remains the durable source of work.
// Repeated sweeps recover lost Redis jobs; provider idempotency protects reclaimed leases.
export async function startWalletQueue({worker,reconciliation,connection,env=process.env,prefix='sendrack-wallet'}) {
  if(env.NODE_ENV==='production'||process.env.NODE_ENV==='production')throw new Error('Mock wallet worker cannot run in production.');
  const queue=new Queue('outbox',{connection,prefix});
  const consumer=new Worker('outbox',async job=>{
    if(job.name==='daily-reconciliation'&&reconciliation){const day=new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Lagos',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(worker.ledger.clock()));await reconciliation.run({idempotencyKey:'daily:'+day});return;}
    for(let i=0;i<100;i++)if(!await worker.runOnce())break;
  },{connection,prefix,concurrency:2});
  // Never print connection URLs or bank payloads in worker error handlers.
  let lastError=null;
  consumer.on('error',()=>{lastError='queue_unavailable';});
  queue.on('error',()=>{lastError='queue_unavailable';});
  const dispatch=()=>queue.add('sweep',{}, {jobId:'outbox-sweep',removeOnComplete:true,removeOnFail:true,attempts:3,backoff:{type:'exponential',delay:1000}});
  await dispatch();
  if(reconciliation){await queue.upsertJobScheduler('daily-reconciliation',{pattern:'0 0 * * *',tz:'Africa/Lagos'},{name:'daily-reconciliation',data:{},opts:{removeOnComplete:true,removeOnFail:100}});await queue.add('daily-reconciliation',{}, {removeOnComplete:true,removeOnFail:100});}
  const timer=setInterval(()=>{dispatch().catch(()=>{lastError='queue_unavailable';});},5000);timer.unref();
  return {dispatch,status:()=>({lastError}),async close(){clearInterval(timer);await consumer.close();await queue.close();}};
}

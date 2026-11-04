import {createApp} from '../server/server.mjs';
if(!process.env.DATABASE_URL){console.error('Set DATABASE_URL privately before checking the hosted database.');process.exitCode=1;}else{
 let server;try{server=await createApp();await server.database.prepare('SELECT 1 AS ready').get();console.log('SendRack PostgreSQL schema and connection are ready.');}catch{console.error('Database check failed. Check connection settings and service access; credentials are not printed.');process.exitCode=1;}finally{if(server){await new Promise(r=>server.close(()=>r()));await server.databaseClosed;}}
}

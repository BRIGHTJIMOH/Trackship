import {createApp} from '../server.mjs';
const server=await createApp({env:{...process.env,PUSH_WORKER_MODE:'worker'}});
const close=async()=>{await new Promise(resolve=>server.close(()=>resolve()));await server.databaseClosed;};
if(!server.deliveryPushReady){await close();throw new Error('Notification worker requires configured FCM server credentials.');}
server.startBackgroundWorkers();
const keepAlive=setInterval(()=>{},60000);
console.log(JSON.stringify({event:'notification_worker_started'}));
let closing=false;for(const signal of ['SIGTERM','SIGINT'])process.on(signal,async()=>{if(closing)return;closing=true;clearInterval(keepAlive);try{await close();process.exitCode=0;}catch{process.exitCode=1;}});

import {randomUUID} from 'node:crypto';
export async function selectRoute(f,rider,routeId,direction='forward',available=true,revision=1){
 const body={routes:[{routeId,direction,revision}],available};
 const response=f.call?await f.call('/api/v4/rider/routes',body,rider.token):await f.api('/api/v4/rider/routes',body,{token:rider.token});
 if(response.status!==200)throw new Error('Test route selection failed: '+await response.text());return response;
}
export async function configuredRoute(f,fields,riders=[]){
 const db=f.storage||f.server.database,id=randomUUID(),interstate=fields.deliveryType==='interstate';
 await db.withRequest('POST',()=>db.prepare('INSERT INTO admin_routes(id,name,origin_city,origin_state,destination_city,destination_state,delivery_type,pickup_kobo,carrier_kobo,lastmile_kobo,bidirectional,active,revision,created,updated) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(id,'Test configured route',fields.origin,fields.originState,fields.destination,fields.destinationState,fields.deliveryType,Math.round(Number(interstate?fields.pickupFee:fields.deliveryFee)*100),interstate?Math.round(Number(fields.carrierFee)*100):0,interstate?Math.round(Number(fields.lastMileFee)*100):0,1,1,1,Date.now(),Date.now()));
 for(const rider of riders)await selectRoute(f,rider,id);return id;
}

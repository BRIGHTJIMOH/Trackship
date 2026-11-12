// Contact numbers are fetched only for an authenticated shipment participant.
// Public tracking and unaccepted dispatch previews never include these records.
const phonePattern=/^0[789][0-9]{9}$/;
const fail=(message,status)=>{throw Object.assign(Error(message),{status});};
export function deliveryContacts(db,{owner,rider,job}){
 return async function route(req,path,send){
  const vendorPath=path.match(/^\/api\/v3\/shipments\/([a-f0-9-]{36})\/contacts$/);
  const riderPath=path.match(/^\/api\/v3\/jobs\/([a-f0-9]{64})\/contacts$/);
  if(req.method!=='GET'||!vendorPath&&!riderPath)return false;
  let shipment,ownerKey,requestingRider;
  if(vendorPath){
   ownerKey=await owner(req);if(!ownerKey)fail('Sign in to view delivery contacts.',401);
   const row=await db.prepare('SELECT payload FROM shipments WHERE id=? AND owner=?').get(vendorPath[1],ownerKey);
   if(!row)fail('Delivery not found.',404);shipment=JSON.parse(row.payload);
  }else{
   requestingRider=await rider(req);const item=await job(riderPath[1]);shipment=item.s;
   if(!requestingRider.id||shipment.actors?.[item.leg]?.id!==requestingRider.id)fail('Accept your assigned delivery before viewing its contacts.',403);
   ownerKey=(await db.prepare('SELECT owner FROM shipments WHERE id=?').get(shipment.id))?.owner;
  }
  if(['Delivered','Cancelled'].includes(shipment.status)){send(200,{contacts:[],message:'This delivery has ended.'});return true;}
  const contacts=[];
  if(requestingRider){
   const vendor=await db.prepare('SELECT phone,profile,suspended FROM vendor_accounts WHERE owner_key=?').get(ownerKey);
   if(vendor&&!vendor.suspended&&phonePattern.test(vendor.phone)){
    let profile={};try{profile=JSON.parse(vendor.profile||'{}');}catch{}
    contacts.push({id:'vendor',label:'Vendor',name:String(profile.businessName||profile.ownerName||'Sender').slice(0,80),phone:vendor.phone});
   }
  }else{
   for(const leg of ['pickup','carrier','lastmile']){
    const actor=shipment.actors?.[leg];if(!actor?.id)continue;
    const handler=await db.prepare('SELECT phone,display_name,suspended FROM rider_profiles WHERE id=?').get(actor.id);
    if(handler&&!handler.suspended&&phonePattern.test(handler.phone))contacts.push({id:leg,label:leg==='carrier'?'Carrier':leg==='lastmile'?'Last-mile rider':'Pickup rider',name:String(handler.display_name||'Assigned handler').slice(0,80),phone:handler.phone});
   }
  }
  send(200,{contacts,message:contacts.length?'':requestingRider?'Vendor contact unavailable.':'Your rider’s contact appears after they accept.'});return true;
 };
}

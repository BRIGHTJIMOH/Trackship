// Presentation only. Stages describe recorded custody, never distance or an ETA.
const titles={Created:'Waiting for a rider','Rider accepted':'Rider assigned','Picked up':'Parcel collected','Carrier handoff requested':'Handoff requested','Carrier accepted':'With your carrier','In transit':'On the way','Arrived at destination':'Arrived at destination','Last-mile handoff requested':'Final handoff requested','Last-mile rider accepted':'Final rider assigned','Out for delivery':'Out for delivery','Delivery OTP sent':'Confirming delivery',Delivered:'Parcel delivered',Cancelled:'Cancelled'};
export function deliveryCardState(s,{isRider=false}={}){
 const unsent=!isRider&&!s.synced,phase=s.status==='Delivered'?3:['Out for delivery','Delivery OTP sent'].includes(s.status)?2:['Picked up','Carrier handoff requested','Carrier accepted','In transit','Arrived at destination','Last-mile handoff requested','Last-mile rider accepted'].includes(s.status)?1:0;
 const collecting=isRider&&s.status==='Rider accepted'&&s.jobLeg==='pickup';
 return {title:unsent?'Ready to send':collecting?'Ready to collect':titles[s.status]||'Shipment update',phase:unsent||!titles[s.status]||s.status==='Cancelled'?-1:phase,unsent,labels:['Pickup','Journey','Delivery'],requestedDate:typeof s.deliveryDate==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s.deliveryDate)?s.deliveryDate:null};
}
export function completedDeliveryCount(shipments,{isRider=false}={}){return shipments.filter(s=>s.status==='Delivered'&&!s.testRemoval&&(isRider?Boolean(s.remoteBase):s.synced===true)).length;}

export const HISTORY_AGE_MS=24*60*60*1000;
export const isHistoryShipment=s=>['Delivered','Cancelled'].includes(s?.status);
export const isVisibleShipment=s=>!s?.testRemoval;
export const isEarlierUpdate=(n,jobs=[],now=Date.now())=>now-Number(n.created)>=HISTORY_AGE_MS||jobs.some(s=>s.id===n.shipmentId&&isHistoryShipment(s));

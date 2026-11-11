export const VEHICLE_TYPES=['Motorcycle','Bicycle','Tricycle / Keke NAPEP','Car','Van','Truck'];
export const DELIVERY_VEHICLES=[
 {id:'keke',name:'Keke',description:'Tricycle deliveries',vehicle:'Tricycle / Keke NAPEP',asset:'vehicle-keke.webp'},
 {id:'car',name:'Car',description:'Deliver with a car',vehicle:'Car',asset:'vehicle-car.webp'},
 {id:'dispatch',name:'Dispatch bike',description:'Motorcycle deliveries',vehicle:'Motorcycle',asset:'vehicle-dispatch.webp'},
 {id:'truck',name:'Truck / Movers',description:'Truck deliveries',vehicle:'Truck',asset:'vehicle-truck.webp'}
];
export function kgToGrams(value){
 if(value===undefined||value===null||value==='')return null;
 if(!['string','number'].includes(typeof value))throw Error('Enter a numeric weight in kg.');
 const text=String(value);if(!/^\d+(\.\d{1,3})?$/.test(text))throw Error('Enter a weight in kg with up to three decimal places.');
 const [whole,fraction='']=text.split('.'),grams=BigInt(whole)*1000n+BigInt(fraction.padEnd(3,'0'));
 if(grams<1n||grams>BigInt(Number.MAX_SAFE_INTEGER))throw Error('Enter a valid positive weight.');return Number(grams);
}
export function vehicleMatches(profile,shipment){
 if(shipment.vehicleClass){const selected=DELIVERY_VEHICLES.find(v=>v.id===shipment.vehicleClass);if(!selected||profile.vehicle!==selected.vehicle)return false;}
 try{const weight=kgToGrams(shipment.weightKg);if(weight!==null){const capacity=kgToGrams(profile.maxLoadKg);if(capacity===null||capacity<weight)return false;}}catch{return false;}
 return true;
}

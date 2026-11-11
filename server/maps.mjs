// Map display credentials are public browser keys, never Paystack/server credentials.
export function publicMapConfig(env=process.env){
 const key=env.PUBLIC_MAPTILER_KEY||'';
 if(key&&/^[A-Za-z0-9_-]{10,100}$/.test(key))return {provider:'maptiler',tileUrl:'https://api.maptiler.com/maps/streets-v2/{z}/{x}/{y}.png?key='+encodeURIComponent(key),attribution:'&copy; <a href="https://www.maptiler.com/copyright/">MapTiler</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',maxZoom:20};
 return {provider:'openstreetmap-pilot',tileUrl:'https://tile.openstreetmap.org/{z}/{x}/{y}.png',attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',maxZoom:19};
}
// A sender-confirmed pickup pin is a static routing location, never rider GPS.
export function pickupLocation(value,now=Date.now()){
 if(value===undefined||value===null)return null;
 if(value.confirmed!==true||!Number.isFinite(value.lat)||Math.abs(value.lat)>90||!Number.isFinite(value.lng)||Math.abs(value.lng)>180||!Number.isFinite(value.accuracy)||value.accuracy<0||value.accuracy>50000)throw Object.assign(Error('Confirm a valid pickup location.'),{status:400});
 return {lat:value.lat,lng:value.lng,accuracy:Math.max(10,value.accuracy),source:'sender-confirmed',recordedAt:new Date(now).toISOString()};
}

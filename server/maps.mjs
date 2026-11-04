// Map display credentials are public browser keys, never Paystack/server credentials.
export function publicMapConfig(env=process.env){
 const key=env.PUBLIC_MAPTILER_KEY||'';
 if(key&&/^[A-Za-z0-9_-]{10,100}$/.test(key))return {provider:'maptiler',tileUrl:'https://api.maptiler.com/maps/streets-v2/{z}/{x}/{y}.png?key='+encodeURIComponent(key),attribution:'&copy; <a href="https://www.maptiler.com/copyright/">MapTiler</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',maxZoom:20};
 return {provider:'openstreetmap-pilot',tileUrl:'https://tile.openstreetmap.org/{z}/{x}/{y}.png',attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',maxZoom:19};
}

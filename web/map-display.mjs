// Map display only. GPS freshness, account permissions and API connectivity are separate.
export function validatedMapConfig(value) {
  if (value?.provider === 'maptiler' && /^https:\/\/api\.maptiler\.com\/maps\/streets-v2\/\{z\}\/\{x\}\/\{y\}\.png\?key=[A-Za-z0-9_-]{10,100}$/.test(value.tileUrl)) {
    return {provider:'maptiler',tileUrl:value.tileUrl,maxZoom:20,attribution:'&copy; <a href="https://www.maptiler.com/copyright/">MapTiler</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'};
  }
  if (value?.provider === 'openstreetmap-pilot' && value.tileUrl === 'https://tile.openstreetmap.org/{z}/{x}/{y}.png') {
    return {provider:'openstreetmap-pilot',tileUrl:value.tileUrl,maxZoom:19,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'};
  }
  throw new Error('Map provider configuration is unavailable. GPS/API connectivity is separate.');
}
export function createMapTiles(L, map, supplied, status) {
  const config=validatedMapConfig(supplied),name=config.provider==='maptiler'?'MapTiler':'OpenStreetMap pilot';
  const originHint=globalThis.location?.origin==='https://appassets.trackship.ng'&&config.provider==='maptiler'?' The installed app uses https://appassets.trackship.ng; this origin must be allowed on the restricted MapTiler key.':'';
  let failed=0,active=true;if(status)status.dataset.phase='tiles';
  const report=(state,message)=>{if(active&&status?.isConnected&&status.dataset.phase!=='configuration-error'){status.dataset.state=state;status.textContent=message;}};
  const layer=L.tileLayer(config.tileUrl,{
    attribution:config.attribution,maxZoom:config.maxZoom,
    // The HTTPS provider receives only the site origin, never private tracking URLs.
    referrerPolicy:'strict-origin-when-cross-origin',
  });
  layer.on('loading',()=>{failed=0;report('loading','Loading map tiles · '+name+'…');});
  layer.on('tileerror',()=>{failed++;report('error','Map tiles unavailable · '+name+'. Check provider access, key restrictions and network. GPS/API connectivity is separate.'+originHint);});
  layer.on('load',()=>{
    const images=[...layer.getContainer().querySelectorAll('img.leaflet-tile')];
    if(failed||images.some(i=>i.complete&&!i.naturalWidth))report('error','Map tiles unavailable · '+name+'. GPS/API connectivity is separate.'+originHint);
    else if(images.length&&images.every(i=>i.complete&&i.naturalWidth))report('ready','Map tiles loaded · '+name+'.');
  });
  layer.on('remove',()=>{active=false;});
  return layer.addTo(map);
}

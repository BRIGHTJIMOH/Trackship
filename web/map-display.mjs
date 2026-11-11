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
// Raster providers can return HTTP-200 "Invalid key" images. Validate their
// TileJSON response first; decoding an image alone does not establish authorization.
export async function verifyMapProvider(config,{signal,fetchImpl=fetch}={}){
 if(config.provider!=='maptiler')return;
 const url=config.tileUrl.replace('/{z}/{x}/{y}.png','/tiles.json');
 const response=await fetchImpl(url,{credentials:'omit',cache:'no-store',referrerPolicy:'strict-origin-when-cross-origin',signal});
 if(!response.ok)throw Object.assign(Error('MapTiler authorization/configuration check failed (HTTP '+response.status+').'),{kind:response.status===401||response.status===403?'authorization':'provider'});
 const value=await response.json().catch(()=>null);
 if(!value||value.error||typeof value.tilejson!=='string'||!Array.isArray(value.tiles)||!value.tiles.length||!value.tiles.every(t=>typeof t==='string'))throw Object.assign(Error('MapTiler returned an error or invalid TileJSON, even though HTTP succeeded.'),{kind:'authorization'});
}
export function createMapTiles(L,map,supplied,status){
 const config=validatedMapConfig(supplied),owner=status?.classList.contains('map-tiles-status');
 let active=true,flight=null,controller=null,fallback=null,providerError='';
 const report=(state,text,detail=text)=>{if(active&&status?.isConnected&&status.dataset.phase!=='configuration-error'){status.dataset.state=state;status.textContent=owner?detail:text;}};
 const makeLayer=value=>L.tileLayer(value.tileUrl,{attribution:value.attribution,maxZoom:value.maxZoom,referrerPolicy:'strict-origin-when-cross-origin',crossOrigin:value.provider==='maptiler'?'anonymous':false});
 const primary=makeLayer(config);
 function bind(layer,value,isFallback=false){let failed=0;const name=value.provider==='maptiler'?'MapTiler':'OpenStreetMap pilot';
  const current=()=>active&&(isFallback?fallback===layer:!fallback);
  layer.on('loading',()=>{if(!current())return;failed=0;report('loading','Loading map…','Loading map tiles · '+name+'…');});
  layer.on('tileerror',()=>{if(!current())return;failed++;if(value.provider==='maptiler'){useFallback('MapTiler tiles failed.');return;}if(status)status.dataset.failure='tiles';report('error','Map unavailable. Try again.',providerError+' '+name+' tiles unavailable. GPS/API connectivity is separate.');});
  layer.on('load',()=>{if(!current())return;const images=[...(layer.getContainer()?.querySelectorAll('img.leaflet-tile')||[])];if(failed||images.some(i=>i.complete&&!i.naturalWidth))return;if(images.length&&images.every(i=>i.complete&&i.naturalWidth))report('ready',isFallback?'Basic map':'Map ready',isFallback?providerError+' Using OpenStreetMap pilot. GPS/API connectivity is separate.':'Map tiles loaded · '+name+'.');});
 }
 function useFallback(reason){if(!active||fallback)return;providerError=reason;if(map.hasLayer(primary))map.removeLayer(primary);
  const basic=validatedMapConfig({provider:'openstreetmap-pilot',tileUrl:'https://tile.openstreetmap.org/{z}/{x}/{y}.png'});
  if(status){status.dataset.provider='openstreetmap-pilot';status.dataset.providerError=reason;status.dataset.degraded='true';}
  fallback=makeLayer(basic);bind(fallback,basic,true);fallback.addTo(map);
 }
 async function start(){if(!active||flight)return flight;controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),8000);
  if(status){status.dataset.phase='tiles';status.dataset.provider=config.provider;status.dataset.failure='';status.dataset.degraded='false';delete status.dataset.providerError;}
  if(fallback){const old=fallback;fallback=null;map.removeLayer(old);}providerError='';if(map.hasLayer(primary))map.removeLayer(primary);
  report('loading','Loading map…','Checking map provider authorization…');
  flight=(async()=>{try{await verifyMapProvider(config,{signal:controller.signal});if(!active||!map.getContainer()?.isConnected)return;primary.addTo(map);}catch(e){if(!active)return;if(status){status.dataset.failure=e.kind||'network';status.dataset.requestOrigin=globalThis.location?.origin||'';}useFallback(e.kind?e.message:'MapTiler authorization could not be checked.');}finally{clearTimeout(timeout);flight=null;}})();return flight;
 }
 bind(primary,config);const originalRemove=primary.remove.bind(primary);
 primary.remove=()=>{active=false;controller?.abort();if(fallback){map.removeLayer(fallback);fallback=null;}return originalRemove();};
 primary.retryProvider=start;
 if(status){status.dataset.phase='tiles';status.dataset.provider=config.provider;}
 if(config.provider==='maptiler')void start();else primary.addTo(map);
 return primary;
}

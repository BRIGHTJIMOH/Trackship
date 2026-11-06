// One foreground viewer fix only. This module never writes shipment data or starts tracking.
const pendingNative=new Map();
if(typeof window!=='undefined')window.SendRackViewerLocationResult=(id,result)=>pendingNative.get(id)?.(result);
export function validViewerPosition(value){
 const {latitude:lat,longitude:lng,accuracy}=value?.coords||{};
 if(!Number.isFinite(lat)||!Number.isFinite(lng)||lat< -90||lat>90||lng< -180||lng>180||!Number.isFinite(accuracy)||accuracy<0||accuracy>20040000)throw Object.assign(new Error('Location unavailable'),{code:2});
 return {lat,lng,accuracy};
}
export function viewerErrorMessage(error){
 if(error?.code===1)return 'Location permission was denied. Allow location for this site or app in Settings, then tap My location to retry.';
 if(error?.code===3)return 'Finding your location timed out. Move near a window or outdoors, check location settings, then tap My location to retry.';
 return 'Your location is unavailable. Turn on device location services and check your connection, then tap My location to retry.';
}
export function viewerPosition({signal,timeoutMs=18000}={}){
 return new Promise((resolve,reject)=>{
  let settled=false,id=null,timer;
  const finish=(error,value)=>{if(settled)return;settled=true;clearTimeout(timer);signal?.removeEventListener('abort',cancel);if(id){pendingNative.delete(id);try{window.TrackShip?.cancelViewerLocation?.(id);}catch{}}if(error)reject(error);else try{resolve(validViewerPosition(value));}catch(e){reject(e);}};
  const cancel=()=>finish(Object.assign(new Error('Location request cancelled'),{code:2}));
  if(signal?.aborted){cancel();return;}signal?.addEventListener('abort',cancel,{once:true});
  timer=setTimeout(()=>finish({code:3}),timeoutMs);
  if(window.TrackShip?.requestViewerLocation){
   id=crypto.randomUUID();pendingNative.set(id,result=>result?.ok?finish(null,{coords:{latitude:result.lat,longitude:result.lng,accuracy:result.accuracy}}):finish({code:result?.code||2}));
   try{window.TrackShip.requestViewerLocation(id);}catch{finish({code:2});}
  }else if(navigator.geolocation){
   try{navigator.geolocation.getCurrentPosition(value=>finish(null,value),error=>finish(error),{enableHighAccuracy:true,timeout:15000,maximumAge:0});}catch{finish({code:2});}
  }else finish({code:2});
 });
}
const accuracyText=n=>n>=1000?(n/1000).toFixed(n>=10000?0:1)+' km':Math.max(1,Math.round(n))+' m';
export function viewerMapControls({L,map,host,getShipment,getAll=null,initialPosition=null,remember=()=>{}}){
 const section=document.createElement('section');section.className='viewer-map-controls';section.setAttribute('aria-label','Map view controls');
 section.innerHTML='<div class="viewer-map-actions"><button type="button" class="viewer-my-location">My location</button><button type="button" class="viewer-shipment">View shipment</button>'+(getAll?'<button type="button" class="viewer-all">View all deliveries</button>':'')+'</div><p class="viewer-location-status" role="status" aria-live="polite">My location shows your device only; it never shares delivery GPS. Desktop location may be less accurate than phone GPS.</p><p class="viewer-location-legend"><span aria-hidden="true">●</span> Blue = your last requested device fix. Shipment-holder locations are separate.</p>';
 host.append(section);const viewerPane='sendrack-viewer-location',pane=map.getPane(viewerPane)||map.createPane(viewerPane);pane.style.zIndex='620';pane.style.pointerEvents='none';const button=section.querySelector('.viewer-my-location'),status=section.querySelector('.viewer-location-status');let disposed=false,flight=null,dot=null,circle=null;
 const report=(message,state='info')=>{if(!disposed){status.textContent=message;status.dataset.state=state;}};
 function draw(position,center=false){
  dot?.remove();circle?.remove();
  dot=L.circleMarker([position.lat,position.lng],{pane:viewerPane,interactive:false,radius:8,color:'#fff',weight:3,fillColor:'#1769d2',fillOpacity:1,className:'viewer-location-dot'}).addTo(map).bindTooltip('Your device location — not the rider');
  circle=L.circle([position.lat,position.lng],{interactive:false,radius:position.accuracy,color:'#1769d2',weight:1,fillColor:'#1769d2',fillOpacity:.10,className:'viewer-location-accuracy'}).addTo(map);
  if(center){if(position.accuracy>20)map.fitBounds(circle.getBounds(),{padding:[30,30],maxZoom:16,animate:false});else map.setView([position.lat,position.lng],16,{animate:false});}
 }
 if(initialPosition)draw(initialPosition);
 button.onclick=async()=>{if(flight||disposed)return;flight=new AbortController();button.disabled=true;button.textContent='Finding location…';report('Requesting your device location. This will not start shipment sharing.');try{const position=await viewerPosition({signal:flight.signal});if(disposed)return;draw(position,true);remember(position);report((position.accuracy>100?'Approximate device location':'Your device location')+' · accuracy about ±'+accuracyText(position.accuracy)+'. Single fix, not background sharing. This is not the rider’s position. Desktop location may be less accurate than phone GPS.','ready');}catch(error){report(viewerErrorMessage(error),'error');}finally{flight=null;if(!disposed){button.disabled=false;button.textContent='My location';}}};
 section.querySelector('.viewer-shipment').onclick=()=>{const shipment=getShipment?.();if(!shipment?.position){report(shipment?.message||'No shipment location is available. Your device location is not a substitute.','info');return;}map.setView([shipment.position.lat,shipment.position.lng],15,{animate:false});report(shipment.message||'Viewing the selected shipment holder. Your device location remains separate.');};
 section.querySelector('.viewer-all')?.addEventListener('click',()=>{const positions=getAll();if(!positions.length){report('No deliveries matching these filters have a current shipment location. Your device location is separate.');return;}map.fitBounds(positions.map(p=>[p.lat,p.lng]),{padding:[28,28],maxZoom:13,animate:false});report('Viewing delivery locations matching the current filters. Your device location is excluded from these bounds.');});
 return {element:section,destroy(){disposed=true;flight?.abort();dot?.remove();circle?.remove();section.remove();}};
}

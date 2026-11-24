let enabled=true;
try{enabled=localStorage.getItem('sendrack-location-enabled')!=='off';}catch{}
try{if(JSON.parse(window.TrackShip?.getLocationState?.()||'null')?.paused)enabled=false;}catch{}
export const locationAllowed=()=>enabled;
export function setLocationAllowed(value){enabled=Boolean(value);try{localStorage.setItem('sendrack-location-enabled',enabled?'on':'off');}catch{}window.TrackShip?.setLocationPaused?.(!enabled);}

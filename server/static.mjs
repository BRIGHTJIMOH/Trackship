import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
const policy="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https://tile.openstreetmap.org https://api.maptiler.com; connect-src 'self' https:; frame-src https://www.youtube-nocookie.com https://player.vimeo.com; media-src 'self' https:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'";
export function createStaticHandler(root){
 const cache=new Map();
 const ownerFiles={'/admin/file-library.js':'file-library.js','/admin':'index.html','/admin/':'index.html','/admin/app.js':'app.js','/admin/style.css':'style.css','/admin/live-map.js':'live-map.js','/admin/live-map-model.mjs':'live-map-model.mjs','/admin/live-map.css':'live-map.css','/admin/wallet':'wallet.html','/admin/wallet/':'wallet.html','/admin/wallet.css':'wallet.css','/admin/wallet.js':'wallet.js'};
 const files = {
        '/welcome':'marketing.html',
        '/welcome/':'marketing.html',
        '/marketing.css':'marketing.css',
        '/marketing.js':'marketing.js',
        '/sendrack-entry.html': 'index.html',
        '/sendrack-main.js': 'app.js',
        '/sendrack-ui.css': 'style.css',
        '/': 'marketing.html',
        '/app': 'index.html',
        '/app/': 'index.html',
        '/index.html': 'index.html',
        '/app.js': 'app.js',
        '/core.mjs': 'core.mjs',
        '/delivery-cards.mjs': 'delivery-cards.mjs',
        '/lifecycle.mjs': 'lifecycle.mjs',
        '/history.mjs': 'history.mjs',
        '/features.mjs': 'features.mjs',
        '/map-display.mjs': 'map-display.mjs',
        '/viewer-location.mjs': 'viewer-location.mjs',
        '/map-controls.css': 'map-controls.css',
        '/config.mjs': 'config.mjs',
        '/accounts.mjs': 'accounts.mjs',
        '/identity.mjs': 'identity.mjs',
        '/vehicles.mjs':'vehicles.mjs',
        '/customer-wallet.mjs':'customer-wallet.mjs',
        '/assets/leaflet.js': 'assets/leaflet.js',
        '/assets/leaflet.css': 'assets/leaflet.css',
        '/style.css': 'style.css',
        '/assets/sendrack-studio-scooter.webp':'assets/sendrack-studio-scooter.webp',
        '/assets/sendrack-courier-illustration.webp':'assets/sendrack-courier-illustration.webp',
        '/assets/vehicle-keke.webp':'assets/vehicle-keke.webp',
        '/assets/vehicle-car.webp':'assets/vehicle-car.webp',
        '/assets/vehicle-dispatch.webp':'assets/vehicle-dispatch.webp',
        '/assets/vehicle-truck.webp':'assets/vehicle-truck.webp',
        '/assets/sendrack-mark.svg': 'assets/sendrack-mark.svg',
        '/assets/Inter.ttf': 'assets/Inter.ttf',
        '/assets/Poppins-Regular.ttf': 'assets/Poppins-Regular.ttf',
        '/assets/Poppins-Medium.ttf': 'assets/Poppins-Medium.ttf',
        '/assets/Poppins-SemiBold.ttf': 'assets/Poppins-SemiBold.ttf'
      };

 const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.jpg':'image/jpeg','.ttf':'font/ttf'};
 return async(req,res)=>{try{
  const route=new URL(req.url,'http://local').pathname;
  res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('Content-Security-Policy',policy);
  if(!['GET','HEAD'].includes(req.method)){res.writeHead(405,{'Cache-Control':'no-store'});res.end();return;}
  if(route==='/app/wallet'){res.writeHead(302,{Location:'/app#wallet','Cache-Control':'no-store'});res.end();return;}
  const owner=ownerFiles[route],file=owner||((route.startsWith('/t/')||route.startsWith('/r/')||route==='/payment-return')?'index.html':files[route]);
  if(!file){res.writeHead(404,{'Cache-Control':'no-store'});res.end('Not found.');return;}
  const key=(owner?'admin/':'web/')+file;let cached=cache.get(key);
  if(!cached){const bytes=await readFile(path.join(root,key));cached={bytes,etag:'"'+createHash('sha256').update(bytes).digest('hex')+'"'};cache.set(key,cached);}
  const staticAsset=file.startsWith('assets/');res.setHeader('Cache-Control',staticAsset?'public, max-age=300':'no-cache');res.setHeader('ETag',cached.etag);res.setHeader('Content-Type',types[path.extname(file)]||'application/octet-stream');
  if(req.headers['if-none-match']===cached.etag){res.writeHead(304);res.end();return;}
  res.setHeader('Content-Length',cached.bytes.length);res.writeHead(200);res.end(req.method==='HEAD'?undefined:cached.bytes);
 }catch{if(!res.headersSent){res.writeHead(503,{'Cache-Control':'no-store'});res.end('The app assets are unavailable. Please retry.');}else res.end();}};
}

import http from 'node:http';
import {openDatabase} from './database.mjs';
import { randomBytes, createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateShipment, canTransition, publicShipment } from '../web/core.mjs';
import { operations } from './operations.mjs';
import { flowPublic } from '../web/lifecycle.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const hash = s => createHash('sha256').update(s).digest('hex');
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const publicToken = /^[a-f0-9]{64}$/;
export async function createApp({
  providers,
  env = process.env,
  dataDir = process.env.DATA_DIR || path.join(root, '.data'),
  origins = process.env.ALLOWED_ORIGINS || 'https://appassets.trackship.ng'
} = {}) {
  const db = await openDatabase({env,dataDir});
  try {await db.withRequest('POST', async()=>{
  await db.exec('CREATE TABLE IF NOT EXISTS workspaces (token_hash TEXT PRIMARY KEY, created_at TEXT NOT NULL); CREATE TABLE IF NOT EXISTS shipments (id TEXT PRIMARY KEY, owner TEXT NOT NULL, public_hash TEXT UNIQUE NOT NULL, payload TEXT NOT NULL)');
  if (!(await db.prepare('PRAGMA table_info(shipments)').all()).some(c => c.name === 'rider_hash')) await db.exec('ALTER TABLE shipments ADD COLUMN rider_hash TEXT');
  await db.exec('CREATE UNIQUE INDEX IF NOT EXISTS shipments_rider_hash ON shipments(rider_hash)');
  await db.exec('CREATE TABLE IF NOT EXISTS marketing_waitlist(email TEXT PRIMARY KEY,name TEXT,role TEXT,city TEXT,created_at TEXT NOT NULL)');
  });}catch(e){await db.close();throw e;}
  function riderView(s) {
    const {
      publicToken,
      riderToken,
      dirty,
      synced,
      ...details
    } = s;
    return details;
  }
  const limits = new Map();
  const allowed = new Set(origins.split(',').map(s => s.trim()));
  function rate(req, kind, max) {
    const key = `${req.socket.remoteAddress}:${kind}`;
    const now = Date.now();
    if (limits.size > 10000) for (const [k, v] of limits) if (v.until < now) limits.delete(k);
    const l = limits.get(key) || {
      count: 0,
      until: now + 60000
    };
    if (l.until < now) {
      l.count = 0;
      l.until = now + 60000;
    }
    l.count++;
    limits.set(key, l);
    return l.count <= max;
  }
  async function owner(req) {
    const t = req.headers.authorization?.match(/^Bearer ([a-f0-9]{64})$/)?.[1];
    if (!t) return null;
    const h = hash(t);
    return (await db.prepare('SELECT token_hash FROM workspaces WHERE token_hash=? AND disabled=0').get(h)) ? h : advanced.ownerSession?.(req) || null;
  }
  async function body(req, maxBytes = 65536) {
    let total = 0,
      parts = [];
    for await (const chunk of req) {
      total += chunk.length;
      if (total > maxBytes) {
        const e = new Error('Request is too large.');
        e.status = 413;
        throw e;
      }
      parts.push(chunk);
    }
    try {
      return JSON.parse(Buffer.concat(parts).toString());
    } catch {
      const e = new Error('Invalid JSON.');
      e.status = 400;
      throw e;
    }
  }
  function valid(s, id) {
    if (!s || s.riderToken !== undefined && !publicToken.test(s.riderToken) || s.id !== id || !uuid.test(id) || !publicToken.test(s.publicToken || '') || s.code !== `TS-${id.slice(0, 8).toUpperCase()}` || validateShipment(s).length) return false;
    if (typeof s.business !== 'string' || !s.business.trim() || s.business.length > 80 || !Array.isArray(s.events) || s.events.length < 1 || s.events.length > 6) return false;
    if (!Number.isFinite(Date.parse(s.createdAt)) || s.events[0].status !== 'Created' || s.createdAt !== s.events[0].at) return false;
    const ids = new Set();
    for (let i = 0; i < s.events.length; i++) {
      const e = s.events[i];
      if (!e || !uuid.test(e.id) || ids.has(e.id) || !Number.isFinite(Date.parse(e.at)) || typeof e.note !== 'string' || e.note.length > 240 || i && (!canTransition(s.events[i - 1].status, e.status) || Date.parse(e.at) < Date.parse(s.events[i - 1].at))) return false;
      ids.add(e.id);
    }
    return s.status === s.events.at(-1).status;
  }
  let advanced;try{advanced = await db.withRequest('POST',()=>operations(db, {
    owner,
    body,
    providers,
    env
  }));}catch(e){await db.close();throw e;}
  const server = http.createServer((req,res)=>db.withRequest(req.method,async()=>{
    const origin = req.headers.origin;
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https://tile.openstreetmap.org https://api.maptiler.com; connect-src 'self' https:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    if (origin && allowed.has(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, POST, OPTIONS');
    }
    const send = (status, value) => {
      res.writeHead(status, {
        'Content-Type': 'application/json; charset=utf-8'
      });
      res.end(JSON.stringify(value));
    };
    try {
      const url = new URL(req.url, 'http://localhost');
      const route = url.pathname;
      if (req.method === 'OPTIONS') {
        res.writeHead(allowed.has(origin) ? 204 : 403);
        res.end();
        return;
      }
      if (!rate(req, 'all', 300)) return send(429, {
        error: 'Too many requests. Try again in a minute.'
      });
      if(route==='/api/waitlist'&&req.method==='POST'){
        if(!rate(req,'waitlist',5))return send(429,{error:'Please try again in a minute.'});
        const p=await body(req,4096),email=typeof p.email==='string'?p.email.trim().toLowerCase():'';
        if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>254||!['vendor','rider'].includes(p.role)||typeof p.name!=='string'||!p.name.trim()||p.name.length>80||typeof p.city!=='string'||!p.city.trim()||p.city.length>80||p.consent!==true)return send(400,{error:'Enter your name, email, city, role and consent.'});
        await db.prepare('INSERT INTO marketing_waitlist(email,name,role,city,created_at) VALUES (?,?,?,?,?) ON CONFLICT(email) DO NOTHING').run(email,p.name.trim(),p.role,p.city.trim(),new Date().toISOString());
        return send(200,{message:'You’re on the list. We’ll email you with SendRack updates.'});
      }
      if (await advanced(req, res, url, send)) return;
      if (route === '/api/ready' && req.method === 'GET'){await db.prepare('SELECT 1 AS ready').get();return send(200,{ready:true,database:db.kind});}
      if(route==='/api/version'&&req.method==='GET')return send(200,{service:'sendrack',version:'0.7.1',commit:/^[a-f0-9]{40}$/.test(env.RENDER_GIT_COMMIT||env.SOURCE_COMMIT||'')?(env.RENDER_GIT_COMMIT||env.SOURCE_COMMIT):null,branch:env.RENDER_GIT_BRANCH||null,features:{adminLiveOperationsMap:true,emailSignup:true}});
      if (route === '/api/health' && req.method === 'GET') return send(200, {
        service: 'trackship-ng',
        version: '0.7.1'
      });
      if (route === '/api/workspaces' && req.method === 'POST') {
        if (!rate(req, 'register', 5)) return send(429, {
          error: 'Too many new connections. Try again in a minute.'
        });
        await body(req);
        const token = randomBytes(32).toString('hex');
        await db.prepare('INSERT INTO workspaces(token_hash,created_at) VALUES (?,?)').run(hash(token), new Date().toISOString());
        return send(201, {
          token
        });
      }
      if (route.startsWith('/api/shipments/') && req.method === 'GET') {
        const auth = await owner(req);
        if (!auth) return send(401, {
          error: 'Business access is required.'
        });
        const row = await db.prepare('SELECT payload FROM shipments WHERE id=? AND owner=?').get(route.slice('/api/shipments/'.length), auth);
        return row ? send(200, JSON.parse(row.payload)) : send(404, {
          error: 'Shipment not found.'
        });
      }
      const riderRoute = route.match(/^\/api\/rider\/([a-f0-9]{64})(\/events)?$/);
      if (riderRoute) {
        const row = await db.prepare('SELECT id,payload FROM shipments WHERE rider_hash=?').get(hash(riderRoute[1]));
        if (!row) return send(404, {
          error: 'Dispatch not found. Ask your vendor for a current link.'
        });
        const s = JSON.parse(row.payload);
        if (req.method === 'GET' && !riderRoute[2]) return send(200, riderView(s));
        if (req.method === 'POST' && riderRoute[2]) {
          const event = await body(req);
          if (!event || !uuid.test(event.id) || typeof event.note !== 'string' || event.note.length > 240 || !Number.isFinite(Date.parse(event.at))) return send(400, {
            error: 'Invalid delivery checkpoint.'
          });
          const existing = s.events.find(e => e.id === event.id);
          if (existing) return JSON.stringify(existing) === JSON.stringify(event) ? send(200, riderView(s)) : send(409, {
            error: 'Checkpoint already exists with different details.'
          });
          if (event.status === 'Cancelled' || !canTransition(s.status, event.status) || Date.parse(event.at) < Date.parse(s.events.at(-1).at)) return send(409, {
            error: 'This checkpoint no longer follows the latest delivery status. Refresh the delivery.'
          });
          const updated = {
            ...s,
            status: event.status,
            events: [...s.events, {
              id: event.id,
              status: event.status,
              note: event.note,
              at: event.at
            }]
          };
          await db.prepare('UPDATE shipments SET payload=? WHERE id=?').run(JSON.stringify(updated), s.id);
          return send(200, riderView(updated));
        }
        return send(405, {
          error: 'Method not allowed.'
        });
      }
      if (route.startsWith('/api/shipments/') && req.method === 'PUT') {
        const auth = await owner(req);
        if (!auth) return send(401, {
          error: 'Your tracking service access is invalid. Restore your connection backup.'
        });
        const id = route.slice('/api/shipments/'.length);
        const s = await body(req);
        const existing = await db.prepare('SELECT payload FROM shipments WHERE id=?').get(id);
        if(!existing&&!await advanced.legacyCreationAllowed())return send(409,{error:'New shipments must use a configured route and the current delivery workflow.'});
      if (s.workflowVersion === 3 || existing && JSON.parse(existing.payload).workflowVersion === 3) return send(409, {
          error: 'Funded deliveries must use authenticated handoff actions.'
        });
        if (!valid(s, id)) return send(400, {
          error: 'Invalid shipment or delivery history.'
        });
        const old = await db.prepare('SELECT owner,payload FROM shipments WHERE id=?').get(id);
        if (old && old.owner !== auth) return send(404, {
          error: 'Shipment not found.'
        });
        if (old) {
          const previous = JSON.parse(old.payload);
          const immutable = ['publicToken', 'business', 'sender', 'recipient', 'phone', 'origin', 'destination', 'address', 'description', 'rider', 'riderPhone', 'notes', 'createdAt'];
          if (previous.riderToken && previous.riderToken !== s.riderToken || immutable.some(k => previous[k] !== s[k]) || previous.events.length > s.events.length || previous.events.some((e, i) => JSON.stringify(e) !== JSON.stringify(s.events[i]))) return send(409, {
            error: 'This shipment has conflicting updates. Restore the most recent backup.'
          });
        }
        const payload = JSON.stringify({
          ...s,
          dirty: false,
          synced: true
        });
        try {
          await db.prepare('INSERT INTO shipments (id,owner,public_hash,payload,rider_hash) VALUES (?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload,rider_hash=excluded.rider_hash').run(id, auth, hash(s.publicToken), payload, s.riderToken ? hash(s.riderToken) : null);
        } catch (e) {
          if ((e.code?.startsWith('ERR_SQLITE')||e.code==='23505')) return send(409, {
            error: 'Tracking reference already exists.'
          });
          throw e;
        }
        return send(old ? 200 : 201, {
          id: s.id,
          status: s.status
        });
      }
      if (route.startsWith('/api/track/') && req.method === 'GET') {
        const token = route.slice('/api/track/'.length);
        if (!publicToken.test(token)) return send(404, {
          error: 'Delivery not found.'
        });
        const row = await db.prepare('SELECT payload FROM shipments WHERE public_hash=?').get(hash(token));
        if (!row) return send(404, {
          error: 'Delivery not found.'
        });
        const shipment = JSON.parse(row.payload);
        return send(200, shipment.workflowVersion === 3 ? flowPublic(shipment) : publicShipment(shipment));
      }
      if (route.startsWith('/api/')) return send(404, {
        error: 'Not found.'
      });
      if (!['GET', 'HEAD'].includes(req.method)) return send(405, {
        error: 'Method not allowed.'
      });
      const ownerFiles={'/admin':'index.html','/admin/':'index.html','/admin/app.js':'app.js','/admin/style.css':'style.css','/admin/live-map.js':'live-map.js','/admin/live-map-model.mjs':'live-map-model.mjs','/admin/live-map.css':'live-map.css'};
      if(ownerFiles[route]){const name=ownerFiles[route];res.writeHead(200,{'Content-Type':name.endsWith('.html')?'text/html; charset=utf-8':name.endsWith('.css')?'text/css; charset=utf-8':'text/javascript; charset=utf-8'});res.end(req.method==='HEAD'?undefined:readFileSync(path.join(root,'admin',name)));return;}
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
        '/lifecycle.mjs': 'lifecycle.mjs',
        '/features.mjs': 'features.mjs',
        '/config.mjs': 'config.mjs',
        '/accounts.mjs': 'accounts.mjs',
        '/identity.mjs': 'identity.mjs',
        '/assets/leaflet.js': 'assets/leaflet.js',
        '/assets/leaflet.css': 'assets/leaflet.css',
        '/style.css': 'style.css',
        '/assets/demo-vendor-dashboard.jpg':'assets/demo-vendor-dashboard.jpg',
        '/assets/sendrack-parcel.webp':'assets/sendrack-parcel.webp',
        '/assets/demo-vendor-create.jpg':'assets/demo-vendor-create.jpg',
        '/assets/demo-vendor-details.jpg':'assets/demo-vendor-details.jpg',
        '/assets/demo-vendor-tracking.jpg':'assets/demo-vendor-tracking.jpg',
        '/assets/demo-rider-jobs.jpg':'assets/demo-rider-jobs.jpg',
        '/assets/demo-rider-details.jpg':'assets/demo-rider-details.jpg',
        '/assets/demo-rider-tracking.jpg':'assets/demo-rider-tracking.jpg',
        '/assets/product-vendor.jpg':'assets/product-vendor.jpg',
        '/assets/product-rider.jpg':'assets/product-rider.jpg',
        '/assets/courier.svg': 'assets/courier.svg',
        '/assets/route.svg': 'assets/route.svg',
        '/assets/sendrack-mark.svg': 'assets/sendrack-mark.svg',
        '/assets/courier-photo.png': 'assets/courier-photo.png',
        '/assets/Inter.ttf': 'assets/Inter.ttf',
        '/assets/Poppins-Regular.ttf': 'assets/Poppins-Regular.ttf',
        '/assets/Poppins-Medium.ttf': 'assets/Poppins-Medium.ttf',
        '/assets/Poppins-SemiBold.ttf': 'assets/Poppins-SemiBold.ttf'
      };
      const filename = route.startsWith('/t/') || route.startsWith('/r/') || route === '/payment-return' ? 'index.html' : files[route];
      if (!filename) return send(404, {
        error: 'Not found.'
      });
      const types = {
        '.html': 'text/html',
        '.js': 'text/javascript',
        '.mjs': 'text/javascript',
        '.css': 'text/css',
        '.svg': 'image/svg+xml',
        '.png': 'image/png',
        '.webp': 'image/webp',
        '.jpg': 'image/jpeg',
        '.ttf': 'font/ttf'
      };
      res.writeHead(200, {
        'Content-Type': types[path.extname(filename)] + '; charset=utf-8'
      });
      res.end(req.method === 'HEAD' ? undefined : readFileSync(path.join(root, 'web', filename)));
    } catch (e) {
      if (!res.headersSent) send(e.status || 500, {
        error: e.status ? e.message : 'The tracking service could not complete this request.'
      });else res.end();
    }
  }).catch(()=>{if(!res.headersSent){res.writeHead(503,{'Content-Type':'application/json'});res.end(JSON.stringify({error:'Database unavailable. Please retry.'}));}else res.end();}));
  server.requestTimeout = 30000;
  server.headersTimeout = 15000;
  server.on('close',()=>{server.databaseClosed=db.close();});
  server.databaseKind=db.kind;
  server.database=db;
  return server;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const server = await createApp();
  const port = Number(process.env.PORT || 3000);
  server.listen(port, process.env.HOST || '127.0.0.1', () => console.log(`SendRack service listening on port ${port}`));
  for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => server.close(async()=>{try{await server.databaseClosed;process.exit(0);}catch{process.exit(1);}}));
}

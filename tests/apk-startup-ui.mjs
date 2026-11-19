import assert from 'node:assert/strict';import {execFileSync} from 'node:child_process';import {readFile,mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';import path from 'node:path';import {tmpdir} from 'node:os';import {chromium} from 'playwright-core';import {checkNativeAssets} from '../scripts/check-native-assets.mjs';
const apk=process.env.SENDRACK_TEST_APK||'artifacts/SendRack-0.7.37-fcm.apk',repro=process.env.SENDRACK_REPRO_BLANK==='1',dir=await mkdtemp(path.join(tmpdir(),'sendrack-native-startup-'));
const java=process.env.JAVA_HOME?path.join(process.env.JAVA_HOME,'bin/java'):'/workspace/toolchains/jdk-21.0.9+10/bin/java',javac=java.replace(/java$/,'javac');
let browser;
try{
 execFileSync('python3',['-c',`import sys,zipfile,pathlib
with zipfile.ZipFile(sys.argv[1]) as z:
 for n in z.namelist():
  if n.startswith('assets/web/') and not n.endswith('/'):
   p=pathlib.Path(sys.argv[2])/pathlib.PurePosixPath(n).relative_to('assets/web');p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(z.read(n))
 dex=b''.join(z.read(n) for n in z.namelist() if n.endswith('.dex'))
 pathlib.Path(sys.argv[2],'native.dex').write_bytes(dex)
`,apk,dir]);
 await writeFile(path.join(dir,'LocalAssetPolicy.java'),await readFile(process.env.SENDRACK_NATIVE_POLICY||'android/src/ng/trackship/app/LocalAssetPolicy.java'));
 await writeFile(path.join(dir,'Probe.java'),'import ng.trackship.app.LocalAssetPolicy; public class Probe { public static void main(String[] paths) { for(String p:paths)System.out.println(LocalAssetPolicy.allowed(p)?"yes":"no"); }}');execFileSync(javac,['-d',dir,path.join(dir,'LocalAssetPolicy.java'),path.join(dir,'Probe.java')]);
 const reads=new Map();const graph=checkNativeAssets({allowed:()=>true,readAsset:n=>{const data=execFileSync('cat',[path.join(dir,n.slice(1))],{encoding:'utf8'});reads.set(n,data);return data;}});assert.deepEqual(graph.missing,[]);
 const policy=await readFile(path.join(dir,'LocalAssetPolicy.java'),'utf8'),paths=[...new Set([...graph.files,...[...policy.matchAll(/"(\/[^"\n]+)"/g)].map(m=>m[1])])];const probe=execFileSync(java,['-cp',dir,'Probe',...paths],{encoding:'utf8'}).trim().split('\n'),allowed=new Set(paths.filter((_,i)=>probe[i].trim()==='yes'));const denied=graph.files.filter(n=>!allowed.has(n));
 if(repro)assert.deepEqual(denied,['/delivery-cards.mjs']);else{assert.deepEqual(denied,[],'All startup dependencies must pass the actual Java allowlist');const dex=await readFile(path.join(dir,'native.dex'));for(const file of graph.files)assert.ok(dex.includes(Buffer.from(file)),file+' must be present in the compiled native policy');}
 browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});const ctx=await browser.newContext({viewport:{width:390,height:844}}),blocked=[],errors=[];
 await ctx.addInitScript(()=>{window.TrackShip={setNightMode(){}};});
 await ctx.route('**/*',async route=>{const u=new URL(route.request().url());if(u.origin!=='https://appassets.trackship.ng')return route.abort('internetdisconnected');const file=u.pathname;
  if(!allowed.has(file)){blocked.push(file);return route.fulfill({status:404,contentType:'text/plain',body:'Not Found'});}try{const body=await readFile(path.join(dir,file.slice(1)));const ext=path.extname(file);return route.fulfill({status:200,headers:{'Content-Type':{'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.svg':'image/svg+xml'}[ext]||'application/octet-stream','Cache-Control':'no-store','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src https:; img-src 'self' data: https://tile.openstreetmap.org https://api.maptiler.com; frame-src 'none'; object-src 'none'; base-uri 'none'"},body});}catch{return route.fulfill({status:404,body:'Not Found'});}});
 const p=await ctx.newPage();p.on('pageerror',e=>errors.push(e.message));await p.goto('https://appassets.trackship.ng/sendrack-entry.html?native-test=1');await p.waitForLoadState('networkidle');
 if(repro){assert.ok(blocked.includes('/delivery-cards.mjs'));assert.equal(await p.locator('#app').innerHTML(),'');console.log('REPRODUCED 0.7.35 blank launch: Java allowlist blocks /delivery-cards.mjs before app startup.');}
 else{await p.locator('#cloud-login').waitFor();assert.deepEqual(blocked.filter(x=>/\.(?:mjs|js|html)$/.test(x)),[]);assert.deepEqual(errors,[]);await mkdir('artifacts/native-startup',{recursive:true});await p.screenshot({path:'artifacts/native-startup/offline-login.png',fullPage:true});console.log('PASS: signed APK starts offline under the compiled Java asset allowlist and Android CSP; renders login without any backend connection. This is browser/native-policy verification, not physical Android execution.');}
}finally{await browser?.close();await rm(dir,{recursive:true,force:true});}

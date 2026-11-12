import {execFileSync} from 'node:child_process';import {readFileSync} from 'node:fs';import {createHash} from 'node:crypto';import assert from 'node:assert/strict';
const apk=process.env.SENDRACK_TEST_APK||'artifacts/SendRack-0.7.13-fcm.apk';
const result=JSON.parse(execFileSync('python3',['-c',`import sys,zipfile,hashlib,json
with zipfile.ZipFile(sys.argv[1]) as z:
 names=['style.css','features.mjs','map-display.mjs','viewer-location.mjs','map-controls.css','vehicles.mjs','customer-wallet.mjs']
 dex=z.read('classes.dex')
 print(json.dumps({'files':{n:hashlib.sha256(z.read('assets/web/'+n)).hexdigest() for n in names},'backend':z.read('assets/web/config.mjs').decode(),'nativeViewerBridge':all(n in dex for n in [b'requestViewerLocation',b'cancelViewerLocation',b'getCurrentLocation',b'ViewerLocation']), 'main':z.read('assets/web/sendrack-main.js').decode()}))`,apk],{encoding:'utf8'}));
for(const [name,sha]of Object.entries(result.files))assert.equal(sha,createHash('sha256').update(readFileSync('web/'+name)).digest('hex'),name+' differs from tested source');assert.match(result.backend,/https:\/\/sendrack-api\.onrender\.com/);assert.equal(result.nativeViewerBridge,true);assert.equal(result.main,readFileSync('web/app.js','utf8').replaceAll('0.7.0','0.7.13-fcm'));
console.log('APK package check passed: exact tested viewer/map modules and CSS, current app source, compiled native bridge and unchanged Render backend URL. This is not Android OS execution.');

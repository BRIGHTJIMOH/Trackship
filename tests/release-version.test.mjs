import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createApp} from '../server/server.mjs';
import {testDatabase} from './database-fixture.mjs';
test('release version reports the runtime commit and map assets are served without preview flags',async()=>{const database=await testDatabase(),dir=mkdtempSync(path.join(tmpdir(),'sendrack-version-'));const sha='a'.repeat(40),server=await createApp({dataDir:dir,env:{...database.env,RENDER_GIT_COMMIT:sha,RENDER_GIT_BRANCH:'apk-test-v0.7.0'}});await new Promise(r=>server.listen(0,'127.0.0.1',r));try{const base='http://127.0.0.1:'+server.address().port;const version=await(await fetch(base+'/api/version')).json();assert.equal(version.commit,sha);assert.equal(version.branch,'apk-test-v0.7.0');assert.equal(version.features.adminLiveOperationsMap,true);for(const asset of ['/admin','/admin/live-map.js','/admin/live-map-model.mjs','/admin/live-map.css','/assets/leaflet.js','/assets/leaflet.css'])assert.equal((await fetch(base+asset)).status,200,asset);assert.equal((await fetch(base+'/api/admin/live-operations')).status,401);const html=await(await fetch(base+'/admin')).text();assert(!html.includes('/dispatch-link.js'),'no dangling preview-only asset');}finally{await new Promise(r=>server.close(r));await server.databaseClosed;await database.cleanup();rmSync(dir,{recursive:true,force:true});}});

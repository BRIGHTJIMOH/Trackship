import {test} from 'node:test';
import assert from 'node:assert/strict';
import {adminFixture,vendorProfile,OWNER_PASSWORD} from './admin-fixture.mjs';
import {privateLibraryStorage} from '../server/library/storage.mjs';
const prefix='/api/admin/library';
const fakeStorage=()=>{const objects=new Map();let rejectDelete=false;return {ready:true,objects,set rejectDelete(v){rejectDelete=v;},async upload(file){return {url:'https://storage.example/'+file.id,headers:{'Content-Type':'application/octet-stream'}};},async inspect(f){if(!objects.has(f.id))throw new Error('missing');return {bytes:objects.get(f.id)};},async download(f){return 'https://storage.example/download/'+f.id;},async remove(f){if(rejectDelete)throw new Error('provider unavailable');objects.delete(f.id);}};};
test('library requires owner session and CSRF, isolates regional/vendor access, keeps storage disabled when unconfigured',async()=>{
 const f=await adminFixture();try{const owner=await f.login();assert.equal((await f.api(prefix)).status,401);assert.equal((await f.api(prefix,undefined,{token:f.env.TRACKSHIP_ADMIN_TOKEN})).status,401);
 const vendor=await f.account('vendor',vendorProfile);assert.equal((await f.api(prefix,undefined,{token:vendor.token})).status,401);
 assert.equal((await f.api(prefix+'/folders',{name:'Test'},{cookie:owner.cookie})).status,403);
 assert.equal((await f.api(prefix+'/folders',{name:'Test'},{...owner,origin:'https://attacker.example'})).status,403);
 const managerPassword='Regional password 2026!';assert.equal((await f.api('/api/admin/regional-admins',{username:'library-regional',password:managerPassword,states:['Kaduna']},owner)).status,201);
 const response=await f.api('/api/admin/login',{username:'library-regional',password:managerPassword});const regional={...await response.json(),cookie:response.headers.get('set-cookie').split(';')[0]};assert.equal((await f.api(prefix,undefined,regional)).status,403);
 const root=await(await f.api(prefix,undefined,owner)).json();assert.equal(root.storage.ready,false);assert.equal(root.folders.length,6);assert.equal((await f.api(prefix+'/uploads',{name:'test.pdf',bytes:4},owner)).status,503);
 assert.equal((await f.api(prefix+'/folders',{name:'Invoices'},owner)).status,201);assert.equal((await f.api(prefix+'/folders',{name:'Invoices'},owner)).status,409);assert.equal((await f.api(prefix+'/folders',{name:'../bad'},owner)).status,400);
 const files=await(await f.api(prefix+'?folder=apks',undefined,owner)).json();assert.equal(files.files[0].source,'starter');assert.equal(files.files.find(f=>f.id==='starter-release-0737').bytes,0);assert.equal(files.files.find(f=>f.id==='starter-release-0738').bytes,4406489);assert.equal(JSON.stringify(files).includes('object_key'),false);
 const docs=await(await f.api(prefix+'?folder=documents',undefined,owner)).json();
 for(const name of ['SendRack-Admin-Installable-Update.zip','SendRack-Admin-Installation-Guide.txt']){
  const file=docs.files.find(file=>file.name===name);assert.ok(file);assert.ok(file.bytes>0);
  const result=await fetch(f.base+file.downloadUrl,{headers:{Cookie:owner.cookie},redirect:'manual'});assert.equal(result.status,302);assert.equal(result.headers.get('location'),'https://sendrack-downloads-0735.jimohbright300.chatgpt.site/files/'+name);
 }
 const download=await fetch(f.base+files.files[0].downloadUrl,{headers:{Cookie:owner.cookie},redirect:'manual'});assert.equal(download.status,302);assert.ok(download.headers.get('location').startsWith('https://sendrack-downloads-0735.'));
 }finally{await f.close();}
});
test('library only publishes confirmed uploads, enforces quota and retains files when provider deletion fails',async()=>{
 const storage=fakeStorage(),f=await adminFixture({libraryStorage:storage});try{const owner=await f.login();const folderResult=await f.api(prefix+'/folders',{name:'Personal files'},owner);const folder=await folderResult.json();
 assert.equal((await f.api(prefix+'/uploads',{name:'script.exe',bytes:4,folderId:folder.id},owner)).status,400);
 assert.equal((await f.api(prefix+'/uploads',{name:'test.pdf',bytes:0},owner)).status,400);
 assert.equal((await f.api(prefix+'/uploads',{name:'test.pdf',bytes:262144001},owner)).status,400);
 const reserve=await f.api(prefix+'/uploads',{name:'test.xlsx',bytes:120,folderId:folder.id},owner);assert.equal(reserve.status,201);const ticket=await reserve.json();assert.equal((await(await f.api(prefix+'?folder='+folder.id,undefined,owner)).json()).files.length,0);
 assert.equal((await f.api(prefix+'/files/'+ticket.id+'/complete',{},owner)).status,409);storage.objects.set(ticket.id,100);assert.equal((await f.api(prefix+'/files/'+ticket.id+'/complete',{},owner)).status,409);storage.objects.set(ticket.id,120);assert.equal((await f.api(prefix+'/files/'+ticket.id+'/complete',{},owner)).status,200);
 assert.equal((await f.api(prefix+'/files/'+ticket.id+'/complete',{},owner)).status,200);const list=await(await f.api(prefix+'?folder='+folder.id,undefined,owner)).json();assert.equal(list.files[0].bytes,120);assert.equal(list.storage.usedBytes,120);assert.deepEqual(list.breadcrumbs.map(v=>v.name),['My files','Personal files']);assert.equal(JSON.stringify(list).includes('sendrack-library/'),false);
 const dl=await fetch(f.base+list.files[0].downloadUrl,{headers:{Cookie:owner.cookie},redirect:'manual'});assert.equal(dl.status,302);
 storage.rejectDelete=true;assert.equal((await f.api(prefix+'/files/'+ticket.id+'/delete',{},owner)).status,502);assert.equal((await(await f.api(prefix+'?folder='+folder.id,undefined,owner)).json()).files.length,1);
 storage.rejectDelete=false;assert.equal((await f.api(prefix+'/files/'+ticket.id+'/delete',{},owner)).status,200);assert.equal(storage.objects.has(ticket.id),false);assert.equal((await(await f.api(prefix+'?folder='+folder.id,undefined,owner)).json()).files.length,0);
 const audit=await(await f.api('/api/admin/audit',undefined,owner)).json();assert.match(JSON.stringify(audit),/library.file.upload/);assert.match(JSON.stringify(audit),/library.file.delete/);
 }finally{await f.close();}
});
test('storage adapter uses private expiring HTTPS URLs and a non-overwriting signed PUT',async()=>{
 assert.equal(privateLibraryStorage({}).ready,false);
 assert.equal(privateLibraryStorage({LIBRARY_S3_BUCKET:'b',LIBRARY_S3_ACCESS_KEY_ID:'test-key',LIBRARY_S3_SECRET_ACCESS_KEY:'test-secret',LIBRARY_S3_REGION:'auto',LIBRARY_S3_ENDPOINT:'http://unsafe.example'}).ready,false);
 const storage=privateLibraryStorage({LIBRARY_S3_BUCKET:'private-test',LIBRARY_S3_ACCESS_KEY_ID:'synthetic-key',LIBRARY_S3_SECRET_ACCESS_KEY:'synthetic-secret',LIBRARY_S3_REGION:'auto',LIBRARY_S3_ENDPOINT:'https://account.r2.cloudflarestorage.com'});
 const ticket=await storage.upload({object_key:'sendrack-library/test',bytes:123,name:'test.pdf'}),url=new URL(ticket.url);assert.equal(url.protocol,'https:');assert.equal(url.searchParams.get('X-Amz-Expires'),'600');assert.match(url.searchParams.get('X-Amz-SignedHeaders'),/content-length/);assert.match(url.searchParams.get('X-Amz-SignedHeaders'),/if-none-match/);assert.equal(ticket.headers['If-None-Match'],'*');
 const download=new URL(await storage.download({object_key:'sendrack-library/test',name:'test.pdf'}));assert.equal(download.searchParams.get('X-Amz-Expires'),'60');assert.match(download.searchParams.get('response-content-disposition'),/^attachment;/);
});

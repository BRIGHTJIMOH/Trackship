import test from 'node:test';
import assert from 'node:assert/strict';
import {videoSource} from '../server/website-videos.mjs';
import {adminFixture} from './admin-fixture.mjs';
test('video links allow supported HTTPS providers and reject unsafe links',()=>{
 assert.deepEqual(videoSource('https://youtu.be/abcdefghijk'),{type:'youtube',src:'https://www.youtube-nocookie.com/embed/abcdefghijk'});
 assert.equal(videoSource('https://vimeo.com/123456').type,'vimeo');
 assert.equal(videoSource('https://media.example/story.mp4').type,'file');
 for(const url of ['javascript:alert(1)','http://example.com/a.mp4','https://evil.com/watch?v=abcdefghijk','https://user:password@example.com/a.mp4'])assert.throws(()=>videoSource(url));
});
test('website videos are owner managed, draft private, revision protected and publishable',async()=>{
 const f=await adminFixture();try{
 assert.equal((await f.api('/api/admin/website-videos')).status,401);
 const owner=await f.login(),config=await(await f.api('/api/admin/website-videos',undefined,owner)).json();
 assert.equal(config.videos.length,6);assert.deepEqual(await(await f.api('/api/website-videos')).json(),{videos:[]});
 config.videos[0]={id:'founder',title:'Why we are building',url:'https://youtu.be/abcdefghijk',published:true,description:'Why SendRack exists',speakerName:'Bright Jimoh',speakerRole:'Founder',quote:'Helping vendors reach further.'};
 config.videos[1].description='Private draft description';config.videos[1].title='Private draft';config.videos[1].url='https://vimeo.com/123456';
 assert.equal((await f.api('/api/admin/website-videos',config,{cookie:owner.cookie})).status,403);
 assert.equal((await f.api('/api/admin/website-videos',config,owner)).status,200);
 const publicData=await(await f.api('/api/website-videos')).json();assert.equal(publicData.videos.length,1);assert.equal(publicData.videos[0].title,'Why we are building');assert.equal(publicData.videos[0].url,undefined);assert.equal(publicData.videos[0].description,'Why SendRack exists');assert.equal(publicData.videos[0].speakerName,'Bright Jimoh');assert.equal(publicData.videos[0].speakerRole,'Founder');assert.equal(publicData.videos[0].quote,'Helping vendors reach further.');assert.equal(JSON.stringify(publicData).includes('Private draft description'),false);
 assert.equal((await f.api('/api/admin/website-videos',config,owner)).status,409);const saved=await(await f.api('/api/admin/website-videos',undefined,owner)).json();const invalid=structuredClone(saved);invalid.videos[0].description='x'.repeat(1201);assert.equal((await f.api('/api/admin/website-videos',invalid,owner)).status,400);for(const video of saved.videos)for(const key of ['description','speakerName','speakerRole','quote'])delete video[key];assert.equal((await f.api('/api/admin/website-videos',saved,owner)).status,200);assert.equal((await(await f.api('/api/website-videos')).json()).videos[0].speakerName,'Bright Jimoh');
 }finally{await f.close();}
});

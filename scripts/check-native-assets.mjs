// Every packaged local HTML/module dependency must also be permitted by Android.
import {readFileSync,existsSync} from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
export function checkNativeAssets({readAsset,allowed,entry='/sendrack-entry.html'}){
 const pending=[entry],seen=new Set(),missing=[],blocked=[];
 while(pending.length){const name=pending.pop();if(seen.has(name))continue;seen.add(name);if(!allowed(name))blocked.push(name);let data;try{data=readAsset(name);}catch{missing.push(name);continue;}
  if(name.endsWith('.html'))for(const match of data.matchAll(/(?:src|href)=["']([^"']+)["']/g)){if(!/^(?:https?:|data:|#)/.test(match[1]))pending.push(new URL(match[1],'https://appassets.trackship.ng'+name).pathname);}
  if(/\.(?:js|mjs)$/.test(name))for(const match of data.matchAll(/(?:\bfrom\s*|\bimport\s*(?:\(\s*)?)["'](\.[^"']+)["']/g))pending.push(new URL(match[1],'https://appassets.trackship.ng'+name).pathname);
 }return {files:[...seen].sort(),missing,blocked};
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
 const source=readFileSync(path.join(root,'android/src/ng/trackship/app/LocalAssetPolicy.java'),'utf8');const allowed=new Set([...source.matchAll(/"(\/[^"\n]+)"/g)].map(m=>m[1]));const aliases={'/sendrack-entry.html':'index.html','/sendrack-main.js':'app.js','/sendrack-ui.css':'style.css'};
 const result=checkNativeAssets({allowed:n=>allowed.has(n),readAsset:n=>readFileSync(path.join(root,'web',aliases[n]||n.slice(1)),'utf8')});
 if(result.missing.length||result.blocked.length){console.error(JSON.stringify(result,null,2));process.exitCode=1;}else console.log('Native startup asset check passed: '+result.files.length+' local entry/module dependencies are bundled and allowed.');
}

import {build} from 'esbuild';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const license=readFileSync(new URL('../node_modules/three/LICENSE',import.meta.url),'utf8');
await build({entryPoints:[fileURLToPath(new URL('./design/parcel-scene.mjs',import.meta.url))],outfile:fileURLToPath(new URL('../web/parcel-scene.js',import.meta.url)),bundle:true,format:'esm',minify:true,legalComments:'eof',banner:{js:'/*! Three.js license\n'+license+'\n*/'}});

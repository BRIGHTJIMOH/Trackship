// Render code-generated vector branding; no external fonts or network requests.
import {chromium} from 'playwright-core';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
const mark=await readFile('web/assets/sendrack-mark.svg','utf8'),wordmark=await readFile('web/assets/sendrack-wordmark.svg','utf8');
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
try{const page=await browser.newPage();await mkdir('artifacts/brand',{recursive:true});
 for(const size of [180,192,512]){const bytes=await page.evaluate(async({mark,size})=>{const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 512 512"><rect width="512" height="512" fill="#fff"/>${mark.replace('<svg ','<svg x="103" y="134" width="306" height="243" ')}</svg>`;const im=new Image();im.src='data:image/svg+xml;base64,'+btoa(svg);await im.decode();const c=document.createElement('canvas');c.width=c.height=size;c.getContext('2d').drawImage(im,0,0,size,size);return c.toDataURL().split(',')[1];},{mark,size});await writeFile(`admin/icons/${size===180?'apple-touch-icon':`icon-${size}`}.png`,Buffer.from(bytes,'base64'));}
 for(const [name,svg,width] of [['mark',mark,1024],['wordmark',wordmark,2400]]){const bytes=await page.evaluate(async({svg,width})=>{const im=new Image();im.src='data:image/svg+xml;base64,'+btoa(svg);await im.decode();const vb=svg.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/);const c=document.createElement('canvas');c.width=width;c.height=Math.round(width*Number(vb[2])/Number(vb[1]));c.getContext('2d').drawImage(im,0,0,c.width,c.height);return c.toDataURL().split(',')[1];},{svg,width});await writeFile(`artifacts/brand/SendRack-${name}.png`,Buffer.from(bytes,'base64'));}
 console.log('Brand PNGs and admin install icons generated.');
}finally{await browser.close();}

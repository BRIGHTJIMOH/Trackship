// Owner-published plain-text announcements. No scripts, HTML or external URLs.
export function createCommunicationCards({context,request,navigate,icon}){
 let accountKey='',lastRead=0,flight=null,dialog=null,shown=null,previousFocus=null;
 const remembered=new Set();
 const seenKey='sendrack-announcement-dismissals-v1';
 function entries(){try{const value=JSON.parse(localStorage.getItem(seenKey)||'[]');return Array.isArray(value)?value.filter(x=>typeof x==='string').slice(-100):[];}catch{return [];}}
 const key=(ctx,c)=>ctx.base+'|'+ctx.account+'|'+c.id;
 function seen(ctx,c){const k=key(ctx,c);return remembered.has(k)||entries().includes(k);}
 function mark(ctx,c){const k=key(ctx,c);remembered.add(k);try{localStorage.setItem(seenKey,JSON.stringify([...new Set([...entries(),k])].slice(-100)));}catch{/* Session memory still prevents repeated prompts. */}}
 function close(dismiss=false){if(!dialog)return;if(dismiss&&shown)mark(shown.context,shown.card);if(dialog.open)dialog.close();dialog.remove();dialog=null;shown=null;if(previousFocus?.isConnected)previousFocus.focus();previousFocus=null;}
 function show(card,ctx){
  if(seen(ctx,card)||dialog&&shown?.card.id===card.id)return;
  close();previousFocus=document.activeElement;
  dialog=document.createElement('dialog');dialog.className='communication-modal';dialog.setAttribute('aria-labelledby','communication-title');dialog.setAttribute('aria-describedby','communication-message');
  dialog.innerHTML='<button type="button" class="communication-close" aria-label="Dismiss announcement">×</button><div class="communication-tag">SENDRACK ANNOUNCEMENT</div><h2 id="communication-title"></h2><p id="communication-message"></p><div class="communication-art" aria-hidden="true"></div><button type="button" class="primary wide communication-action"></button>';
  dialog.querySelector('h2').textContent=card.title;dialog.querySelector('p').textContent=card.message;dialog.querySelector('.communication-art').innerHTML=icon('box');
  const action=dialog.querySelector('.communication-action');action.hidden=card.action==='none';action.textContent=card.buttonLabel;
  action.onclick=()=>{const destination=card.action==='create'&&ctx.role==='rider'?'alerts':card.action;close(true);navigate(destination);};
  dialog.querySelector('.communication-close').onclick=()=>close(true);dialog.addEventListener('cancel',e=>{e.preventDefault();close(true);});
  shown={card,context:ctx};document.body.append(dialog);dialog.showModal();dialog.querySelector('.communication-close').focus();
 }
 function sync(){const ctx=context();const current=ctx.active?ctx.base+'|'+ctx.account:'';if(current!==accountKey){close();lastRead=0;accountKey=current;}if(!ctx.active||document.hidden){close();return;}if(shown?.card.endsAt&&Date.parse(shown.card.endsAt)<=Date.now())close();}
 async function refresh(force=false){
  sync();const ctx=context();if(!ctx.active||!ctx.base||document.hidden||flight||!force&&Date.now()-lastRead<30000)return;
  const captured=accountKey,epoch=ctx.epoch;const task={};flight=task;
  try{const result=await request(ctx.base,'/api/communication-cards?role='+encodeURIComponent(ctx.role));const now=context();if(captured!==accountKey||now.epoch!==epoch||!now.active)return;lastRead=Date.now();const c=result.card;
   if(!c){close();return;}
   if(typeof c.id!=='string'||typeof c.title!=='string'||typeof c.message!=='string'||!['none','track','create','notifications','profile'].includes(c.action))return;
   if(document.querySelector('dialog[open]:not(.communication-modal)'))return;show(c,ctx);
  }catch{lastRead=Date.now();}finally{if(flight===task)flight=null;}
 }
 return {sync,refresh,close:()=>close(false)};
}

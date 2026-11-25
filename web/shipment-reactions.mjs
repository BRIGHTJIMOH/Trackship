import {REACTION_OPTIONS} from './reaction-options.mjs';
export const reactionHost=()=>'<section class="shipment-reactions" aria-label="Delivery reactions"></section>';
export function createShipmentReactions({request}){
 let current=null,cache=null,error='',busy=false,generation=0,lastRead=0,timer,opened=false,host=null,currentTrigger=null,receipts=null,receiptSignature='',readFlight=null;
 const optionFor=id=>REACTION_OPTIONS.find(o=>o.id===id);
 function clearFeedback(){currentTrigger?.remove();currentTrigger=null;receipts?.remove();receipts=null;receiptSignature='';}
 function paintReceipts(actions){
  const incoming=cache?.available?(cache.reactions||[]).filter(r=>!r.own&&optionFor(r.reaction)):[];
  if(!incoming.length&&!error){receipts?.remove();receipts=null;receiptSignature='';return;}
  if(!receipts?.isConnected){receipts=document.createElement('div');receipts.className='reaction-receipts';receipts.setAttribute('role','status');receipts.setAttribute('aria-live','polite');receipts.setAttribute('aria-atomic','true');receiptSignature='';}
  const person=actions?.closest('.contact-person');if(person){if(person.nextElementSibling!==receipts)person.after(receipts);}else if(host.nextElementSibling!==receipts)host.after(receipts);
  const signature=JSON.stringify({incoming:incoming.map(r=>[r.sender,r.reaction]),error});if(signature===receiptSignature)return;receiptSignature=signature;receipts.replaceChildren();
  for(const row of incoming){const option=optionFor(row.reaction),label=row.sender==='Current handler'?'Handler':row.sender,chip=document.createElement('span');chip.className='reaction-received';chip.textContent=label+' '+option.emoji;chip.setAttribute('aria-label',label+': '+option.label);chip.title=label+': '+option.label;receipts.append(chip);}
  if(error){const notice=document.createElement('span');notice.className='reaction-connection';notice.textContent='Reactions unavailable · ';const retry=document.createElement('button');retry.type='button';retry.textContent='Retry';retry.onclick=()=>void refresh(true);notice.append(retry);receipts.append(notice);}
 }
 function paint(){
  host=host?.isConnected?host:document.querySelector('.shipment-reactions');if(!host||!current)return;
  const row=document.querySelector('.delivery-contacts .contact-actions'),focusedTrigger=document.activeElement===currentTrigger,focused=host.contains(document.activeElement)?document.activeElement?.dataset?.reaction:null;
  currentTrigger?.remove();host.replaceChildren();const trigger=document.createElement('button');trigger.type='button';trigger.className='reaction-toggle';trigger.setAttribute('aria-label','Delivery reactions');trigger.setAttribute('aria-expanded',String(opened));trigger.setAttribute('aria-controls','delivery-reaction-picker');trigger.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M8 14s1 3 4 3 4-3 4-3M8 8h.01M16 8h.01"/></svg>';
  const own=optionFor(cache?.ownReaction);if(own){const badge=document.createElement('span');badge.className='reaction-sent';badge.textContent=own.emoji;badge.setAttribute('aria-hidden','true');trigger.append(badge);trigger.title='Your reaction: '+own.label;}
  trigger.onclick=()=>{opened=!opened;paint();if(opened)host.querySelector('[data-reaction]')?.focus({preventScroll:true});};currentTrigger=trigger;(row||host).append(trigger);
  const panel=document.createElement('div');panel.id='delivery-reaction-picker';panel.className='reaction-popover';panel.hidden=!opened;const title=document.createElement('strong');title.textContent='How do you feel?';panel.append(title);
  if(!cache?.available){const note=document.createElement('p');note.className='reaction-note';note.textContent=cache?.message||'Loading reactions…';panel.append(note);}
  if(cache?.available){const grid=document.createElement('div');grid.className='reaction-picker';grid.setAttribute('role','group');grid.setAttribute('aria-label','Choose a feeling');for(const option of REACTION_OPTIONS){const button=document.createElement('button');button.type='button';button.className='reaction-choice';button.dataset.reaction=option.id;button.setAttribute('aria-label',option.label);button.setAttribute('aria-pressed',String(cache.ownReaction===option.id));button.disabled=busy;const emoji=document.createElement('span');emoji.textContent=option.emoji;emoji.setAttribute('aria-hidden','true');const label=document.createElement('small');label.textContent=option.id==='love'?'Love':option.label;button.append(emoji,label);button.onclick=()=>send(option.id);grid.append(button);}panel.append(grid);
   const feed=document.createElement('div');feed.className='reaction-feed';for(const row of cache.reactions||[]){const option=optionFor(row.reaction);if(!option)continue;const line=document.createElement('p');line.textContent=option.emoji+' '+row.sender+(row.own?' (you)':'')+' · '+option.label;feed.append(line);}panel.append(feed);
  }
  const status=document.createElement('p');status.className='reaction-note';status.setAttribute('role','status');status.textContent=error||(busy?'Sending…':cache?.ownReaction?'Your reaction is shared. No reply needed.':'');panel.append(status);
  if(error){const retry=document.createElement('button');retry.type='button';retry.className='secondary';retry.textContent='Refresh reactions';retry.disabled=busy;retry.onclick=()=>void refresh(true);panel.append(retry);}host.append(panel);paintReceipts(row);
  if(opened){const anchor=trigger.getBoundingClientRect(),width=Math.min(280,innerWidth-32),height=Math.min(420,innerHeight-32);panel.style.width=width+'px';panel.style.maxHeight=height+'px';panel.style.left=Math.max(16,Math.min(anchor.right-width,innerWidth-width-16))+'px';const actual=Math.min(panel.scrollHeight,height);panel.style.top=Math.max(16,anchor.top>actual+20?anchor.top-actual-8:Math.min(anchor.bottom+8,innerHeight-actual-16))+'px';}
  if(focused&&opened)host.querySelector(`[data-reaction="${focused}"]`)?.focus({preventScroll:true});else if(focusedTrigger)trigger.focus({preventScroll:true});
 }
 async function refresh(force=false){
  if(!current||busy||document.hidden||(!force&&Date.now()-lastRead<5000))return;
  if(readFlight?.epoch===generation)return readFlight.promise;
  lastRead=Date.now();const epoch=generation,c=current,flight={epoch};readFlight=flight;
  flight.promise=(async()=>{try{const result=await request(c.base,c.path,{cache:'no-store',headers:c.token?{Authorization:'Bearer '+c.token}:{}});if(epoch!==generation)return;cache=result;error='';paint();}catch{if(epoch!==generation)return;error='Reactions are unavailable. Please try again.';paint();}finally{if(readFlight===flight)readFlight=null;}})();return flight.promise;
 }
 async function send(reaction){if(!current||busy)return;busy=true;error='';generation++;paint();const epoch=generation,c=current;try{const result=await request(c.base,c.path,{method:'POST',headers:{'Content-Type':'application/json',...(c.token?{Authorization:'Bearer '+c.token}:{})},body:JSON.stringify({reaction})});if(epoch!==generation)return;cache=result;lastRead=Date.now();opened=false;}catch(e){if(epoch===generation)error=e.message||'Could not share your reaction. Please try again.';}finally{if(epoch===generation){busy=false;paint();if(!opened)currentTrigger?.focus({preventScroll:true});}}}
 function mount(context){clearTimeout(timer);const key=context?JSON.stringify(context):'';if(key!==current?.key){generation++;clearFeedback();current=context?{...context,key}:null;cache=null;error='';busy=false;lastRead=0;opened=false;}if(!current){host?.replaceChildren();host=null;return;}paint();void refresh();timer=setTimeout(()=>mount(context),5000);}
 document.addEventListener('sendrack:contacts-updated',paint);
 document.addEventListener('pointerdown',e=>{if(opened&&host&&!host.contains(e.target)&&!currentTrigger?.contains(e.target)){opened=false;paint();}});
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&opened){opened=false;paint();currentTrigger?.focus({preventScroll:true});}});
 window.addEventListener('resize',()=>{if(opened)paint();});window.addEventListener('online',()=>void refresh(true));document.addEventListener('visibilitychange',()=>{if(!document.hidden)void refresh(true);});
 return {mount,closeIfOpen(){if(!opened)return false;opened=false;paint();currentTrigger?.focus({preventScroll:true});return true;}};
}

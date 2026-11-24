import {REACTION_OPTIONS} from './reaction-options.mjs';
export const reactionHost=()=>'<section class="shipment-reactions card" aria-label="Delivery reactions"></section>';
export function createShipmentReactions({request}){
 let current=null,cache=null,error='',busy=false,generation=0,lastRead=0,timer;
 function paint(){
  const host=document.querySelector('.shipment-reactions');if(!host||!current)return;
  const focused=host.contains(document.activeElement)?document.activeElement?.dataset?.reaction:null;
  host.replaceChildren();const title=document.createElement('h3');title.textContent='How’s the delivery going?';host.append(title);
  const note=document.createElement('p');note.className='reaction-note';note.textContent=cache?.message||'Loading reactions…';host.append(note);
  if(cache?.available){const grid=document.createElement('div');grid.className='reaction-picker';grid.setAttribute('role','group');grid.setAttribute('aria-label','Choose a feeling');for(const option of REACTION_OPTIONS){const button=document.createElement('button');button.type='button';button.className='reaction-choice';button.dataset.reaction=option.id;button.setAttribute('aria-label',option.label);button.setAttribute('aria-pressed',String(cache.ownReaction===option.id));button.disabled=busy;const emoji=document.createElement('span');emoji.textContent=option.emoji;emoji.setAttribute('aria-hidden','true');const label=document.createElement('small');label.textContent=option.label;button.append(emoji,label);button.onclick=()=>send(option.id);grid.append(button);}host.append(grid);
   const feed=document.createElement('div');feed.className='reaction-feed';for(const row of cache.reactions||[]){const option=REACTION_OPTIONS.find(o=>o.id===row.reaction);if(!option)continue;const line=document.createElement('p');line.textContent=option.emoji+' '+row.sender+(row.own?' (you)':'')+' · '+option.label;feed.append(line);}host.append(feed);
  }
  const status=document.createElement('p');status.className='reaction-note';status.setAttribute('role','status');status.textContent=error||(busy?'Sending…':cache?.ownReaction?'Your reaction is shared. No reply needed.':'');host.append(status);
  if(error){const retry=document.createElement('button');retry.type='button';retry.className='secondary';retry.textContent='Refresh reactions';retry.disabled=busy;retry.onclick=()=>refresh(true);host.append(retry);}
  if(focused)host.querySelector(`[data-reaction="${focused}"]`)?.focus({preventScroll:true});
 }
 async function refresh(force=false){if(!current||busy||(!force&&Date.now()-lastRead<5000))return;lastRead=Date.now();const epoch=generation,c=current;try{const result=await request(c.base,c.path,{headers:c.token?{Authorization:'Bearer '+c.token}:{}});if(epoch!==generation)return;cache=result;error='';paint();}catch{if(epoch!==generation)return;error='Reactions are unavailable. Please try again.';paint();}}
 async function send(reaction){if(!current||busy)return;busy=true;error='';generation++;paint();const epoch=generation,c=current;try{const result=await request(c.base,c.path,{method:'POST',headers:{'Content-Type':'application/json',...(c.token?{Authorization:'Bearer '+c.token}:{})},body:JSON.stringify({reaction})});if(epoch!==generation)return;cache=result;lastRead=Date.now();}catch(e){if(epoch===generation)error=e.message||'Could not share your reaction. Please try again.';}finally{if(epoch===generation){busy=false;paint();}}}
 function mount(context){clearTimeout(timer);const key=context?JSON.stringify(context):'';if(key!==current?.key){generation++;current=context?{...context,key}:null;cache=null;error='';busy=false;lastRead=0;}if(!current)return;paint();void refresh();timer=setTimeout(()=>mount(context),5000);}
 return {mount};
}

const form=document.querySelector('#waitlist-form'),status=document.querySelector('#form-status');
for(const link of document.querySelectorAll('[data-role]'))link.addEventListener('click',()=>{form.elements.role.value=link.dataset.role;});
form.addEventListener('submit',async event=>{event.preventDefault();const button=form.querySelector('button');if(button.disabled)return;button.disabled=true;status.textContent='Saving your place…';try{const f=new FormData(form);const response=await fetch('/api/waitlist',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:f.get('name'),email:f.get('email'),city:f.get('city'),role:f.get('role'),consent:f.has('consent')}),signal:AbortSignal.timeout(15000)});const data=await response.json();if(!response.ok)throw new Error(data.error||'We couldn’t save your details. Please try again.');status.textContent=data.message;form.reset();}catch(error){status.textContent=error.name==='TimeoutError'?'Your connection is taking longer than expected. Your details are still here; try again.':error.message||'Connection unavailable. Please try again.';}finally{button.disabled=false;}});
const reducedMotion=matchMedia('(prefers-reduced-motion: reduce)');
for(const demo of document.querySelectorAll('[data-demo]')){
 const images=[...demo.querySelectorAll('.demo-screen')],steps=[...demo.querySelectorAll('[data-step]')],toggle=demo.querySelector('.demo-toggle'),status=demo.querySelector('.demo-status'),full=demo.querySelector('.preview-full');
 let index=0,playing=!reducedMotion.matches,visible=false,timer=null;
 const schedule=()=>{clearTimeout(timer);timer=null;const active=playing&&visible&&!document.hidden&&!reducedMotion.matches;demo.dataset.playing=String(active);if(active)timer=setTimeout(()=>{select((index+1)%images.length);schedule();},6000);};
 const reflect=()=>{toggle.disabled=reducedMotion.matches;toggle.textContent=reducedMotion.matches?'Motion reduced':playing?'Pause':'Play';toggle.setAttribute('aria-label',(playing?'Pause ':'Play ')+demo.dataset.demo+' journey');schedule();};
 const select=(next,manual=false)=>{index=(next+images.length)%images.length;images.forEach((n,i)=>{n.classList.toggle('is-active',i===index);n.setAttribute('aria-hidden',String(i!==index));});steps.forEach((n,i)=>n.setAttribute('aria-pressed',String(i===index)));status.setAttribute('aria-live',manual?'polite':'off');status.textContent=(index+1)+' of '+images.length+' · '+steps[index].dataset.description;full.href=images[index].src;};
 const manual=next=>{playing=false;select(next,true);reflect();};
 steps.forEach((step,i)=>step.addEventListener('click',()=>manual(i)));
 demo.querySelectorAll('[data-direction]').forEach(button=>button.addEventListener('click',()=>manual(index+Number(button.dataset.direction))));
 toggle.addEventListener('click',()=>{if(reducedMotion.matches)return;playing=!playing;reflect();});
 reducedMotion.addEventListener('change',()=>{if(reducedMotion.matches)playing=false;reflect();});
 new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;reflect();},{threshold:.15}).observe(demo);
 document.addEventListener('visibilitychange',reflect);reflect();
}
for(const illustration of document.querySelectorAll('.scene,.journey-illustration')){
 let visible=false,playing=!reducedMotion.matches;const button=illustration.querySelector('.illustration-toggle');
 const reflect=()=>{illustration.dataset.playing=String(visible&&playing&&!document.hidden&&!reducedMotion.matches);button.disabled=reducedMotion.matches;button.textContent=reducedMotion.matches?'Motion reduced':playing?'Pause illustration':'Play illustration';button.setAttribute('aria-label',(playing?'Pause ':'Play ')+(illustration.classList.contains('scene')?'parcel':'route')+' illustration');};
 button.addEventListener('click',()=>{if(!reducedMotion.matches){playing=!playing;reflect();}});
 new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;reflect();},{threshold:.1}).observe(illustration);
 reducedMotion.addEventListener('change',()=>{if(reducedMotion.matches)playing=false;reflect();});document.addEventListener('visibilitychange',reflect);reflect();
}

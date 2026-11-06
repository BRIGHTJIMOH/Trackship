const form=document.querySelector('#waitlist-form'),status=document.querySelector('#form-status');
for(const link of document.querySelectorAll('[data-role]'))link.addEventListener('click',()=>{form.elements.role.value=link.dataset.role;});
form.addEventListener('submit',async event=>{event.preventDefault();const button=form.querySelector('button');button.disabled=true;status.textContent='Saving your place…';try{const f=new FormData(form);const response=await fetch('/api/waitlist',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:f.get('name'),email:f.get('email'),city:f.get('city'),role:f.get('role'),consent:f.has('consent')})});const data=await response.json();if(!response.ok)throw new Error(data.error||'We couldn’t save your details. Please try again.');status.textContent=data.message;form.reset();}catch(error){status.textContent=error.message||'Connection unavailable. Please try again.';}finally{button.disabled=false;}});

// Independent sample journeys: preserve controls/focus and never touch app accounts.
const reducedMotion=matchMedia('(prefers-reduced-motion: reduce)');
for(const demo of document.querySelectorAll('[data-demo]')){
 const images=[...demo.querySelectorAll('.demo-screen')],steps=[...demo.querySelectorAll('[data-step]')],toggle=demo.querySelector('.demo-toggle'),status=demo.querySelector('.demo-status'),full=demo.querySelector('.preview-full');
 let index=0,playing=!reducedMotion.matches,visible=false;
 const reflect=()=>{demo.dataset.playing=String(playing&&visible&&!document.hidden&&!reducedMotion.matches);toggle.disabled=reducedMotion.matches;toggle.textContent=reducedMotion.matches?'Motion reduced':playing?'Pause':'Play';toggle.setAttribute('aria-label',(playing?'Pause ':'Play ')+demo.dataset.demo+' journey');};
 const select=(next,manual=false)=>{index=next;images.forEach((n,i)=>{n.classList.toggle('is-active',i===index);n.setAttribute('aria-hidden',String(i!==index));});steps.forEach((n,i)=>n.setAttribute('aria-pressed',String(i===index)));status.setAttribute('aria-live',manual?'polite':'off');status.textContent=(index+1)+' of '+images.length+' · '+steps[index].dataset.description;full.href=images[index].src;};
 steps.forEach((step,i)=>step.addEventListener('click',()=>{playing=false;select(i,true);reflect();}));
 toggle.addEventListener('click',()=>{if(reducedMotion.matches)return;playing=!playing;reflect();});
 reducedMotion.addEventListener('change',()=>{if(reducedMotion.matches)playing=false;reflect();});
 new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;reflect();},{threshold:.15}).observe(demo);
 document.addEventListener('visibilitychange',reflect);
 setInterval(()=>{if(playing&&visible&&!document.hidden&&!reducedMotion.matches)select((index+1)%images.length);},6000);reflect();
}

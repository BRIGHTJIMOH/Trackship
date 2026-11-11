const form=document.querySelector('#waitlist-form'),status=document.querySelector('#form-status');
for(const link of document.querySelectorAll('[data-role]'))link.addEventListener('click',()=>{form.elements.role.value=link.dataset.role;});
form.addEventListener('submit',async event=>{event.preventDefault();const button=form.querySelector('button');if(button.disabled)return;button.disabled=true;status.textContent='Saving your place…';try{const f=new FormData(form);const response=await fetch('/api/waitlist',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:f.get('name'),email:f.get('email'),city:f.get('city'),role:f.get('role'),consent:f.has('consent')}),signal:AbortSignal.timeout(15000)});const data=await response.json();if(!response.ok)throw new Error(data.error||'We couldn’t save your details. Please try again.');status.textContent=data.message;form.reset();}catch(error){status.textContent=error.name==='TimeoutError'?'Your connection is taking longer than expected. Your details are still here; try again.':error.message||'Connection unavailable. Please try again.';}finally{button.disabled=false;}});
const reducedMotion=matchMedia('(prefers-reduced-motion: reduce)');
const world=document.querySelector('.parcel-world'),motionButton=document.querySelector('.motion-toggle');
let playing=!reducedMotion.matches,visible=true;
function reflectMotion(){document.body.dataset.motion=String(playing&&visible&&!document.hidden&&!reducedMotion.matches);motionButton.disabled=reducedMotion.matches;motionButton.textContent=reducedMotion.matches?'Motion reduced':playing?'Pause motion Ⅱ':'Play motion ▷';motionButton.setAttribute('aria-label',reducedMotion.matches?'Motion reduced':playing?'Pause animation':'Play animation');if(reducedMotion.matches||!playing){world.style.removeProperty('--tilt-x');world.style.removeProperty('--tilt-y');}}
motionButton.addEventListener('click',()=>{playing=!playing;reflectMotion();});
reducedMotion.addEventListener('change',()=>{playing=!reducedMotion.matches;reflectMotion();});
document.addEventListener('visibilitychange',reflectMotion);
new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;reflectMotion();},{threshold:.05}).observe(world);
world.addEventListener('pointermove',event=>{if(event.pointerType==='touch'||!playing||reducedMotion.matches)return;const rect=world.getBoundingClientRect();world.style.setProperty('--tilt-x',((event.clientX-rect.left)/rect.width-.5)*16+'deg');world.style.setProperty('--tilt-y',-((event.clientY-rect.top)/rect.height-.5)*8+'deg');});
world.addEventListener('pointerleave',()=>{world.style.removeProperty('--tilt-x');world.style.removeProperty('--tilt-y');});reflectMotion();
const workspaceData={vendor:{kicker:'MORE ROOM FOR YOUR BUSINESS',title:'You run the shop.\nKeep your sends together.',description:'One place for your packages, recipient details and delivery updates. A little less chasing, a little more time for what you sell.',image:'/assets/demo-vendor-dashboard.jpg',alt:'SendRack vendor workspace with fictional sample delivery data'},rider:{kicker:'MORE CLARITY ON THE ROAD',title:'Your next delivery.\nYour own workspace.',description:'See assigned parcels, review pickup details and record delivery progress. Keep each handoff clear, from the shop to the final stop.',image:'/assets/demo-rider-jobs.jpg',alt:'SendRack rider workspace with fictional sample delivery data'}};
for(const button of document.querySelectorAll('[data-workspace]'))button.addEventListener('click',()=>{const role=button.dataset.workspace,data=workspaceData[role];for(const choice of document.querySelectorAll('[data-workspace]'))choice.setAttribute('aria-pressed',String(choice===button));document.querySelector('#workspace-kicker').textContent=data.kicker;const title=document.querySelector('#workspace-title');title.replaceChildren();data.title.split('\n').forEach((line,i)=>{if(i)title.append(document.createElement('br'));title.append(document.createTextNode(line));});document.querySelector('#workspace-description').textContent=data.description;const image=document.querySelector('#workspace-image');image.src=data.image;image.alt=data.alt;const link=document.querySelector('#workspace-link');link.replaceChildren(document.createTextNode('Join the '+role+' waitlist '));const arrow=document.createElement('span');arrow.textContent='↗';arrow.setAttribute('aria-hidden','true');link.append(arrow);link.dataset.role=role;form.elements.role.value=role;});
const journey=document.querySelector('.journey-stage'),steps=[...document.querySelectorAll('.story-step')];
const route=journey.querySelector('.route-track'),travellingParcel=journey.querySelector('.route-parcel'),routeLength=route.getTotalLength();
let storyVisible=false,frame=null,travelFrame=null,currentProgress=0,targetProgress=0,lastTravelTime=null;
function drawJourney(progress){journey.style.setProperty('--progress',progress);const point=route.getPointAtLength(routeLength*progress);travellingParcel.setAttribute('transform','translate('+point.x+' '+point.y+')');steps.forEach((step,i)=>step.dataset.active=String(progress>=i/3));}
function animateJourney(time){travelFrame=null;const elapsed=lastTravelTime===null?16:Math.min(64,time-lastTravelTime);lastTravelTime=time;currentProgress+=(targetProgress-currentProgress)*(1-Math.exp(-elapsed/90));if(Math.abs(targetProgress-currentProgress)<.0005){currentProgress=targetProgress;lastTravelTime=null;}else travelFrame=requestAnimationFrame(animateJourney);drawJourney(currentProgress);}
function updateStory(){frame=null;const rect=document.querySelector('.story-steps').getBoundingClientRect();targetProgress=reducedMotion.matches?1:Math.max(0,Math.min(1,(innerHeight*.75-rect.top)/(rect.height*.85)));if(reducedMotion.matches){if(travelFrame)cancelAnimationFrame(travelFrame);travelFrame=null;lastTravelTime=null;currentProgress=1;drawJourney(1);}else if(!travelFrame)travelFrame=requestAnimationFrame(animateJourney);}
new IntersectionObserver(entries=>{storyVisible=entries[0].isIntersecting;if(storyVisible)updateStory();},{rootMargin:'150px'}).observe(document.querySelector('.journey-layout'));
function scheduleStory(){if(storyVisible&&!frame)frame=requestAnimationFrame(updateStory);}
addEventListener('scroll',scheduleStory,{passive:true});addEventListener('resize',scheduleStory);reducedMotion.addEventListener('change',updateStory);drawJourney(0);updateStory();

// Enhance the existing accessible illustration only after a complete first render.
// The poster and SVG journey remain usable when WebGL is unavailable or blocked.
async function startRealisticScenes(){
 if(navigator.connection?.saveData)return;
 try{
  const probe=document.createElement('canvas'),context=probe.getContext('webgl2',{failIfMajorPerformanceCaveat:false});
  if(!context)return;
  context.getExtension('WEBGL_lose_context')?.loseContext();
  await document.fonts.ready;
  const {mountParcelScene}=await import('/parcel-scene.js');
  mountParcelScene(world);
  new IntersectionObserver((entries,observer)=>{if(entries.some(entry=>entry.isIntersecting)){observer.disconnect();try{mountParcelScene(journey,{story:true});}catch{journey.dataset.scene='fallback';}}},{rootMargin:'300px'}).observe(journey);
 }catch{world.dataset.scene='fallback';}
}
if('requestIdleCallback' in window)requestIdleCallback(startRealisticScenes,{timeout:1200});else setTimeout(startRealisticScenes,100);

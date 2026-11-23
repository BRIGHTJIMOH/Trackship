const signup = document.querySelector('#launch-signup');
const status = document.querySelector('.signup-status');
const submit = signup.querySelector('button[type="submit"]');

function chooseRole(role) {
  signup.elements.role.value = role;
  document.querySelectorAll('.audience-card').forEach(card => {
    card.classList.toggle('is-selected', card.id === role + '-card');
  });
}

for (const link of document.querySelectorAll('[data-signup-role], [data-audience]')) {
  link.addEventListener('click', () => chooseRole(link.dataset.signupRole || link.dataset.audience));
}

signup.addEventListener('submit', async event => {
  event.preventDefault();
  if (submit.disabled) return;
  submit.disabled = true;
  status.textContent = 'Saving your place…';
  try {
    const values = new FormData(signup);
    const response = await fetch('/api/waitlist', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        name: values.get('name'), city: values.get('city'), email: values.get('email'),
        role: values.get('role'), consent: values.has('consent'),
        whatsapp: values.get('whatsapp') || '', whatsappConsent: values.has('whatsappConsent')
      }),
      signal: AbortSignal.timeout(15000)
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Please try again shortly.');
    status.textContent = result.message;
    signup.reset();
    document.querySelectorAll('.audience-card').forEach(card => card.classList.remove('is-selected'));
  } catch (error) {
    status.textContent = error.name === 'TimeoutError'
      ? 'Your connection is taking longer than expected. Your details are still here; please try again.'
      : error.message || 'We couldn’t connect. Please try again.';
  } finally {
    submit.disabled = false;
  }
});

const stage = document.querySelector('.product-stage');
const motion = document.querySelector('.motion-control');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
let motionEnabled = !reducedMotion.matches;

function resetArtwork() {
  stage.style.removeProperty('--art-x');
  stage.style.removeProperty('--art-y');
  stage.style.removeProperty('--art-angle');
}
function reflectMotion() {
  document.body.classList.toggle("motion-paused", !motionEnabled || reducedMotion.matches);
  motion.disabled = reducedMotion.matches;
  motion.innerHTML = reducedMotion.matches ? 'Motion reduced' : motionEnabled
    ? '<span aria-hidden="true">Ⅱ</span> Pause motion'
    : '<span aria-hidden="true">▷</span> Enable motion';
  motion.setAttribute('aria-label', reducedMotion.matches ? 'Motion reduced' : motionEnabled ? 'Pause visual motion' : 'Enable visual motion');
  if (!motionEnabled || reducedMotion.matches) resetArtwork();
}
stage.addEventListener('pointermove', event => {
  if (!motionEnabled || reducedMotion.matches || event.pointerType === 'touch') return;
  const bounds = stage.getBoundingClientRect();
  const x = (event.clientX - bounds.left) / bounds.width - .5;
  const y = (event.clientY - bounds.top) / bounds.height - .5;
  stage.style.setProperty('--art-x', x * 8 + 'px');
  stage.style.setProperty('--art-y', y * 5 + 'px');
  stage.style.setProperty('--art-angle', x * 2 + 'deg');
});
stage.addEventListener('pointerleave', resetArtwork);
motion.addEventListener('click', () => { motionEnabled = !motionEnabled; reflectMotion(); });
reducedMotion.addEventListener('change', () => { motionEnabled = !reducedMotion.matches; reflectMotion(); });
document.addEventListener('visibilitychange', () => { if (document.hidden) resetArtwork(); });
reflectMotion();

async function loadStories(){
 const host=document.querySelector('#website-videos');
 try{
  const response=await fetch('/api/website-videos',{signal:AbortSignal.timeout(10000)});
  if(!response.ok)return;
  const {videos}=await response.json();if(!videos.length)return;
  host.replaceChildren();host.className='stories-grid';
  document.querySelector('#stories').hidden=false;document.querySelector('[data-signup-index]').textContent='04 — GET IN EARLY';document.querySelectorAll('[data-video-nav]').forEach(link=>link.hidden=false);if(location.hash==='#stories')document.querySelector('#stories').scrollIntoView({behavior:'instant'});
  for(const item of videos){
   const card=document.createElement('article');card.className='story-card'+(item.id==='founder'?' founder-story':'');
   const label=document.createElement('p');label.className='small-label';label.textContent=item.id==='founder'?'FROM OUR FOUNDER':'THE DELIVERY EXPERIENCE';
   const heading=document.createElement('h3');heading.textContent=item.title;
   const screen=document.createElement('div');screen.className='story-screen';
   const play=document.createElement('button');play.type='button';play.className='story-play';play.textContent='▶';play.setAttribute('aria-label','Play '+item.title);
   play.onclick=()=>{
    const player=document.createElement(item.type==='file'?'video':'iframe');
    player.src=item.src;player.title=item.title;
    if(item.type==='file'){player.controls=true;player.playsInline=true;player.preload='metadata';}
    else{player.allow='fullscreen; picture-in-picture';player.allowFullscreen=true;player.referrerPolicy='strict-origin-when-cross-origin';}
    screen.replaceChildren(player);
    player.tabIndex=0;player.focus();
   };
   screen.append(play);card.append(screen,label,heading);host.append(card);
  }
 }catch{/* Keep unpublished stories off the public page. */}
}
loadStories();


// Reveal each chapter once. Content stays visible when scripting/motion is off.
if ('IntersectionObserver' in window) {
 const reveals=new IntersectionObserver(entries=>{
  for(const entry of entries)if(entry.isIntersecting){entry.target.classList.replace('reveal-pending','reveal-entered');reveals.unobserve(entry.target);}
 },{threshold:.08,rootMargin:'0px 0px -24px 0px'});
 document.querySelectorAll('.vision-section>div,.vision-section>.section-index,.section-intro,.audience-card,.stories-intro,.signup-intro,#launch-signup').forEach((element,index)=>{
  element.style.setProperty('--reveal-delay',Math.min(index%2,1)*100+'ms');
  element.classList.add('reveal-pending');reveals.observe(element);
 });
 document.addEventListener('focusin',event=>{const target=event.target.closest('.reveal-pending');if(target){target.classList.replace('reveal-pending','reveal-entered');reveals.unobserve(target);}});
}
document.body.classList.add('motion-ready');
let sceneFrame=0;
function updateScene(){
 sceneFrame=0;
 if(!motionEnabled||reducedMotion.matches||document.hidden){stage.style.removeProperty('--layer-shift');return;}
 const bounds=stage.getBoundingClientRect();
 if(bounds.bottom>0&&bounds.top<innerHeight)stage.style.setProperty('--layer-shift',Math.min(65,Math.max(-30,-bounds.top*.12))+'px');
}
function scheduleScene(){if(!sceneFrame)sceneFrame=requestAnimationFrame(updateScene);}
addEventListener('scroll',scheduleScene,{passive:true});
addEventListener('resize',scheduleScene,{passive:true});
motion.addEventListener('click',scheduleScene);
reducedMotion.addEventListener('change',scheduleScene);
document.addEventListener('visibilitychange',scheduleScene);
scheduleScene();

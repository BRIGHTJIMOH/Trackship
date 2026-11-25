const signup = document.querySelector('#launch-signup');
const status = document.querySelector('.signup-status');
const submit = signup.querySelector('button[type="submit"]');
const referralInput=signup.elements.referralCode;
const incomingReferral=new URLSearchParams(location.search).get('ref');
if(incomingReferral&&incomingReferral.length<=32)referralInput.value=incomingReferral.trim().toUpperCase();

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
        whatsapp: values.get('whatsapp') || '', whatsappConsent: values.has('whatsappConsent'), referralCode: values.get('referralCode') || ''
      }),
      signal: AbortSignal.timeout(15000)
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Please try again shortly.');
    status.textContent = result.message+(result.referralMessage?' '+result.referralMessage:'');
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
  let experienceStarted=false;
  for(const item of videos){
   if(item.id!=='founder'&&!experienceStarted){experienceStarted=true;if(videos.some(v=>v.id==='founder')){const divider=document.createElement('header');divider.className='story-group-divider';const title=document.createElement('h3');title.textContent='The delivery experience';divider.append(title);host.append(divider);}}

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
   screen.append(play);const copy=document.createElement('div');copy.className='story-copy';copy.append(label,heading);
   if(item.description){const description=document.createElement('p');description.className='story-description';description.textContent=item.description;copy.append(description);}
   if(item.quote){const quote=document.createElement('blockquote');quote.className='story-quote';quote.textContent=item.quote;copy.append(quote);}
   if(item.speakerName||item.speakerRole){const speaker=document.createElement('div');speaker.className='story-speaker';if(item.speakerName){const name=document.createElement('strong');name.textContent=item.speakerName;speaker.append(name);}if(item.speakerRole){const role=document.createElement('span');role.textContent=item.speakerRole;speaker.append(role);}copy.append(speaker);}
   card.append(screen,copy);host.append(card);
  }
 }catch{/* Keep unpublished stories off the public page. */}
}
loadStories();


// Keep every section readable immediately, including below the initial viewport.
document.body.classList.add('motion-ready');

// Show only real, published team profiles in the hero's people card.
async function loadHeroTeam(){
 const avatars=document.querySelectorAll('.hero-team-avatars'),names=document.querySelector('.hero-team-names');if(!avatars.length||!names)return;
 try{const response=await fetch('/api/website-team',{cache:'no-store',signal:AbortSignal.timeout(10000)});if(!response.ok)return;const result=await response.json();if(!Array.isArray(result.members)||!result.members.length)return;
  for(const group of avatars)for(const member of result.members.slice(0,3)){const holder=document.createElement('span');holder.className='hero-team-avatar';holder.textContent=member.name.trim().split(/\s+/).slice(0,2).map(n=>n[0]).join('');if(member.photo&&/^data:image\/(jpeg|png);base64,/.test(member.photo)){const image=new Image();image.alt='';image.onload=()=>holder.replaceChildren(image);image.src=member.photo;}group.append(holder);}
  names.textContent=result.members.length===1?result.members[0].name+' · '+result.members[0].role:result.members.slice(0,2).map(m=>m.name).join(' & ')+(result.members.length>2?' and the team':'');

 }catch{/* Keep the public team link useful when portraits cannot load. */}
}
void loadHeroTeam();

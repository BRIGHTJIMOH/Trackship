const host=document.querySelector('#team-members'),status=document.querySelector('#team-status'),retry=document.querySelector('#team-retry');
let members=[],dialog=null;
const node=(tag,className,text)=>{const el=document.createElement(tag);if(className)el.className=className;if(text!==undefined)el.textContent=text;return el;};
function portrait(member){
 const frame=node('span','team-photo-frame'),initial=node('span','team-initials',member.name.trim().split(/\s+/).slice(0,2).map(n=>n[0]).join(''));initial.setAttribute('aria-hidden','true');frame.append(initial);
 if(member.photo&&/^data:image\/(jpeg|png);base64,/.test(member.photo)){
  const image=new Image();image.alt='Portrait of '+member.name;image.className='team-portrait';image.decoding='async';image.onload=()=>initial.replaceWith(image);image.src=member.photo;
 }
 return frame;
}
function openProfile(index,trigger){
 dialog?.remove();const panel=node('dialog','team-profile-dialog');dialog=panel;panel.setAttribute('aria-labelledby','profile-name');
 const close=node('button','team-dialog-close','×');close.type='button';close.setAttribute('aria-label','Close profile');close.onclick=()=>panel.close();
 const content=node('div','team-detail-content'),switcher=node('div','team-profile-switcher');switcher.setAttribute('role','group');switcher.setAttribute('aria-label','Choose a team member');
 const draw=selected=>{
  const member=members[selected],photo=portrait(member),copy=node('div','team-detail-copy'),eyebrow=node('p','team-detail-eyebrow','GET TO KNOW'),heading=node('h2','',member.name);heading.id='profile-name';
  const role=node('p','team-detail-role',member.role),bio=node('p','team-detail-bio',member.bio),label=node('h3','','What I do'),responsibility=node('p','team-detail-responsibility',member.responsibility);
  copy.append(eyebrow,heading,role,bio,label,responsibility);content.replaceChildren(photo,copy);for(const [i,button] of [...switcher.children].entries())button.setAttribute('aria-pressed',String(i===selected));
 };
 members.forEach((member,i)=>{const button=node('button','team-profile-thumb');button.type='button';button.setAttribute('aria-label','View '+member.name+' profile');button.append(portrait(member),node('span','',member.name));button.onclick=()=>draw(i);switcher.append(button);});
 switcher.hidden=members.length<2;panel.append(close,content,switcher);draw(index);document.body.append(panel);
 panel.addEventListener('click',event=>{if(event.target!==panel)return;const r=panel.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)panel.close();});
 panel.addEventListener('close',()=>{panel.remove();if(trigger?.isConnected)trigger.focus({preventScroll:true});},{once:true});panel.showModal();close.focus({preventScroll:true});
}
async function loadTeam(){
 retry.hidden=true;status.textContent='Loading our team…';
 try{
  const response=await fetch('/api/website-team',{cache:'no-store',signal:AbortSignal.timeout(10000)});if(!response.ok)throw new Error();const result=await response.json();if(!Array.isArray(result.members))throw new Error();members=result.members;
  const cards=members.map((member,index)=>{const card=node('button','team-profile');card.type='button';card.setAttribute('aria-haspopup','dialog');card.setAttribute('aria-label','Read about '+member.name+', '+member.role);const tag=node('span','team-name-tag');tag.append(node('h2','',member.name),node('span','team-card-role',member.role));const affordance=node('span','team-card-open','View profile');card.append(portrait(member),tag,affordance);card.onclick=()=>openProfile(index,card);return card;});
  host.classList.toggle('team-single',cards.length===1);host.replaceChildren(...cards);status.textContent=cards.length?'':'Team profiles will be shared here as they become available.';
 }catch{status.textContent='We couldn’t load the team profiles. Please try again.';retry.hidden=false;}
}
retry.onclick=loadTeam;void loadTeam();

const host=document.querySelector('#team-members'),status=document.querySelector('#team-status'),retry=document.querySelector('#team-retry');
async function loadTeam(){
 retry.hidden=true;status.textContent='Loading our team…';
 try{
  const response=await fetch('/api/website-team',{cache:'no-store',signal:AbortSignal.timeout(10000)});if(!response.ok)throw new Error();const result=await response.json();if(!Array.isArray(result.members))throw new Error();
  const cards=result.members.map(member=>{const card=document.createElement('article');card.className='team-profile';const initial=document.createElement('span');initial.className='team-initials';initial.setAttribute('aria-hidden','true');initial.textContent=member.name.trim().split(/\s+/).slice(0,2).map(n=>n[0]).join('');if(member.photo&&/^data:image\/(jpeg|png);base64,/.test(member.photo)){const image=document.createElement('img');image.src=member.photo;image.alt='Portrait of '+member.name;image.className='team-portrait';image.width=144;image.height=144;image.decoding='async';image.onload=()=>initial.replaceWith(image);}const heading=document.createElement('h2');heading.textContent=member.name;const role=document.createElement('p');role.className='team-role';role.textContent=member.role;const label=document.createElement('h3');label.textContent='What I do';const responsibility=document.createElement('p');responsibility.textContent=member.responsibility;const bio=document.createElement('p');bio.className='team-bio';bio.textContent=member.bio;card.append(initial,heading,role,label,responsibility,bio);return card;});
  host.replaceChildren(...cards);status.textContent=cards.length?'':'Team profiles will be shared here as they become available.';
 }catch{status.textContent='We couldn’t load the team profiles. Please try again.';retry.hidden=false;}
}
retry.onclick=loadTeam;void loadTeam();

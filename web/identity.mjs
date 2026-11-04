import {normalizePhone} from './core.mjs';
export const ID_TYPES=['National ID card',"Voter's card",'International passport','Driving licence'];
export function validateIdentity(role,p){
 const errors=[];
 if(!ID_TYPES.includes(p.idType)||typeof p.idNumber!=='string'||!/^[A-Za-z0-9 /-]{5,40}$/.test(p.idNumber))errors.push('Choose a government ID and enter its document number.');
 if(p.idType==='National ID card'&&!/^\d{11}$/.test(p.idNumber||''))errors.push('Enter the 11-digit NIN on your national ID card.');
 if(typeof p.fullName!=='string'||p.fullName.trim().length<2||p.fullName.length>80)errors.push('Enter your full legal name.');
 if(typeof p.homeAddress!=='string'||p.homeAddress.trim().length<10||p.homeAddress.length>300)errors.push('Enter your full residential address.');
 if(role==='rider'){
  if(!/^\d{11}$/.test(p.nin||''))errors.push('Enter your 11-digit NIN.');
  if(p.idType==='National ID card'&&p.nin!==p.idNumber)errors.push('Your NIN and national ID number must match.');
  if(!['Bicycle','Motorcycle','Car','Van'].includes(p.vehicle))errors.push('Choose your delivery vehicle.');
  const licence=p.idType==='Driving licence'?p.idNumber:p.drivingLicence;
  if(p.vehicle!=='Bicycle'&&(typeof licence!=='string'||!/^[A-Za-z0-9 -]{5,30}$/.test(licence)))errors.push('Enter your driving licence number.');
  if(p.vehicle!=='Bicycle'&&(typeof p.vehicleRegistration!=='string'||!/^[A-Za-z0-9 -]{4,30}$/.test(p.vehicleRegistration)))errors.push('Enter your vehicle registration number.');
  if(!/^0[789]\d{9}$/.test(normalizePhone(p.emergencyPhone)))errors.push('Enter a valid emergency contact phone.');
 }
 if(typeof p.idPhoto!=='string'||!/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(p.idPhoto)||p.idPhoto.length>2666700)errors.push('Upload a JPG or PNG photo of your ID, up to 2 MB.');
 if(p.consent!==true)errors.push('Agree to secure identity storage and review.');
 return errors;
}
export function identityFields(role,p,esc){
 const input=(label,name,opts='',value='')=>`<div class="field"><label for="${name}">${label}</label><input id="${name}" name="${name}" value="${esc(value)}" ${opts}></div>`;
 const motor=role==='rider'&&p.vehicle!=='Bicycle';
 return `<h2>Verify your identity</h2><p class="form-help">${role==='rider'?'We need details that identify every delivery rider, including bicycle riders.':'Provide a government ID for the person responsible for your business.'}</p>${input('Full legal name','legalName','required maxlength="80" autocomplete="name"',p.fullName||p.ownerName||'')}<div class="field"><label for="idType">Government ID type</label><select id="idType" name="idType">${ID_TYPES.map(t=>`<option>${esc(t)}</option>`).join('')}</select></div>${input('ID document number','idNumber','required type="password" maxlength="40" autocomplete="off"')}${role==='rider'?input('NIN (11 digits)','nin','required type="password" inputmode="numeric" pattern="[0-9]{11}" maxlength="11" autocomplete="off"'):''}<div class="field"><label for="idPhoto">Photo of your ID</label><input id="idPhoto" name="idPhoto" type="file" accept="image/jpeg,image/png" required><p class="privacy">National ID card with NIN, voter’s card, international passport or driving licence. JPG/PNG, up to 2 MB.</p></div>${motor?input('Driving licence number','drivingLicence','required maxlength="30" autocomplete="off"')+input('Vehicle registration number','vehicleRegistration','required maxlength="30" autocomplete="off"'):''}${input('Full residential address','homeAddress','required minlength="10" maxlength="300" autocomplete="off"')}${role==='rider'?input('Emergency contact phone','emergencyPhone','required type="tel" maxlength="20"'):''}<label class="check-label"><input type="checkbox" name="identityConsent" required><span>I agree to secure storage and review of my identity details for delivery accountability.</span></label><p class="privacy">Documents are kept private and submitted for review. Saving does not mean they have been verified.</p>`;
}
export async function readIdentity(form,role,profile){
 const f=new FormData(form),file=form.querySelector('#idPhoto')?.files[0];
 if(!file||file.size>2000000)throw new Error('Choose a JPG or PNG ID photo under 2 MB.');
 const raw=new Uint8Array(await file.arrayBuffer());const png=[137,80,78,71,13,10,26,10].every((v,i)=>raw[i]===v),jpeg=raw[0]===255&&raw[1]===216;
 if(!png&&!jpeg)throw new Error('Choose a valid JPG or PNG ID photo.');
 const idPhoto=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=reject;r.readAsDataURL(new Blob([raw],{type:png?'image/png':'image/jpeg'}));});
 const p={fullName:f.get('legalName'),idType:f.get('idType'),idNumber:f.get('idNumber'),idPhoto,homeAddress:f.get('homeAddress'),consent:f.get('identityConsent')==='on',...(role==='rider'?{nin:f.get('nin'),vehicle:profile.vehicle,drivingLicence:f.get('drivingLicence')||'',vehicleRegistration:f.get('vehicleRegistration')||'',emergencyPhone:normalizePhone(f.get('emergencyPhone'))}:{})};
 if(p.idType==='Driving licence'&&role==='rider')p.drivingLicence=p.idNumber;
 const errors=validateIdentity(role,p);if(errors.length)throw new Error(errors[0]);return p;
}

export function bindIdentityFields(form){const type=form.querySelector('#idType'),licence=form.querySelector('#drivingLicence');if(!type||!licence)return;const update=()=>{const duplicate=type.value==='Driving licence';licence.required=!duplicate;licence.disabled=duplicate;licence.closest('.field').hidden=duplicate;};type.addEventListener('change',update);update();}

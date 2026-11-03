export class ProviderError extends Error{constructor(message,status=503){super(message);this.status=status;}}
export function providersFromEnv(env=process.env){
 const key=env.PAYSTACK_SECRET_KEY||'';const smsKey=env.TERMII_API_KEY||'';
 async function paystack(path,body){if(!/^sk_(test|live)_/.test(key))throw new ProviderError('Payments are not connected. Add your Paystack key on the hosted server.');let response;try{response=await fetch('https://api.paystack.co'+path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(20000)});}catch{throw new ProviderError('Payment provider is unavailable. Please retry or check the payment status.');}const result=await response.json().catch(()=>null);if(!response.ok||!result?.status)throw new ProviderError('The payment provider could not complete this request.');return result.data;}
 return {
 paymentReady:/^sk_(test|live)_/.test(key),smsReady:Boolean(smsKey&&env.TERMII_SENDER_ID),identityReady:typeof env.TRACKSHIP_IDENTITY_KEY==='string'&&env.TRACKSHIP_IDENTITY_KEY.length>=32,mode:key.startsWith('sk_live_')?'live':'test',webhookKey:key,
 initialize:body=>paystack('/transaction/initialize',body),verify:ref=>paystack('/transaction/verify/'+encodeURIComponent(ref)),
 resolveAccount:(number,bank)=>paystack('/bank/resolve?account_number='+encodeURIComponent(number)+'&bank_code='+encodeURIComponent(bank)),
 recipient:body=>paystack('/transferrecipient',body),transfer:body=>paystack('/transfer',body),verifyTransfer:ref=>paystack('/transfer/verify/'+encodeURIComponent(ref)),
 async sms(phone,message){if(!smsKey||!env.TERMII_SENDER_ID)throw new ProviderError('SMS is not connected. Your operator must connect the SMS service.');let result;try{const response=await fetch('https://v3.api.termii.com/api/sms/send',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({api_key:smsKey,to:phone.replace(/^0/,'234').replace(/^\+/,''),from:env.TERMII_SENDER_ID,sms:message,type:'plain',channel:'generic'}),signal:AbortSignal.timeout(20000)});result=await response.json();if(!response.ok||!['ok','success'].includes(String(result.code||result.message||'').toLowerCase())&&!result.message_id)throw new Error();}catch{throw new ProviderError('SMS could not be sent. Try again shortly.');}return true;}
 };
}

// Configuration and provider acknowledgements are not physical-device verification.
export async function deliveryReadiness(db,{env,push,providers,walletControlEnabled,now=Date.now()}){
 const devices=await db.prepare(`SELECT COUNT(*) AS total FROM push_installations i JOIN rider_sessions s ON s.token_hash=i.session_hash JOIN rider_profiles r ON r.id=i.rider_id WHERE i.enabled=1 AND s.expires>? AND COALESCE(r.suspended,0)=0`).get(now);
 const rows=await db.prepare('SELECT state,COUNT(*) AS total FROM push_deliveries GROUP BY state').all();
 const counts=Object.fromEntries(rows.map(r=>[r.state,Number(r.total)]));
 const blockers=[];
 if(!providers.emailReady)blockers.push('Email verification provider is not configured.');
 if(!push.ready)blockers.push('Firebase server push is not configured. Set FCM_ENABLED=true and FCM_SERVICE_ACCOUNT_FILE to a private Render Secret File.');
 if(!Number(devices.total))blockers.push('No active rider notification devices are registered. Install the Firebase APK, sign in and allow notifications.');
 blockers.push(walletControlEnabled?'Automatic wallet holds use the mock provider. These are sample funds, not a live bank balance.':'Automatic wallet funding is not enabled. Creating a shipment alone does not fund it.');
 return {
  emailConfigured:Boolean(providers.emailReady),
  push:{enabled:env.FCM_ENABLED==='true',configured:Boolean(push.ready),activeDevices:Number(devices.total),providerAccepted:counts.sent||0,pending:(counts.pending||0)+(counts.sending||0),failed:(counts.failed||0)+(counts.invalid||0)},
  funding:{automaticWalletEnabled:Boolean(walletControlEnabled),walletProvider:walletControlEnabled?'mock':null,checkoutConfigured:Boolean(providers.paymentReady),checkoutMode:providers.paymentReady?providers.mode:null,liveAutomaticBankFunding:false},
  blockers,
  verification:'Configuration and FCM acceptance do not establish device receipt. Complete a consenting two-phone test before treating dispatch as live.'
 };
}

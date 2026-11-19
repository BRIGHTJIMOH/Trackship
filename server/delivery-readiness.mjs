import {PUSH_ACCOUNTS_SQL} from './push/principals.mjs';
// Configuration and provider acknowledgements are not physical-device verification.
export async function deliveryReadiness(db,{env,push,providers,walletControlEnabled,now=Date.now()}){
 const devices=await db.prepare(`SELECT COUNT(*) AS total FROM push_installations i JOIN rider_sessions s ON s.token_hash=i.session_hash JOIN rider_profiles r ON r.id=i.rider_id WHERE i.enabled=1 AND i.account_role='rider' AND s.expires>? AND COALESCE(r.suspended,0)=0`).get(now);
 const vendorDevices=await db.prepare(`SELECT COUNT(*) AS total FROM push_installations i JOIN (${PUSH_ACCOUNTS_SQL}) s ON s.token_hash=i.session_hash AND s.account_role=i.account_role AND s.account_id=i.rider_id WHERE i.enabled=1 AND i.account_role='vendor' AND s.expires>? AND s.suspended=0`).get(now);
 const day=new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Lagos',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(now));
 const available=await db.prepare(`SELECT COUNT(DISTINCT p.rider_id) AS total FROM rider_route_preferences p JOIN rider_route_days d ON d.rider_id=p.rider_id JOIN admin_routes r ON r.id=p.route_id JOIN rider_profiles rider ON rider.id=p.rider_id WHERE d.day=? AND p.available=1 AND r.active=1 AND p.route_revision=r.revision AND COALESCE(rider.suspended,0)=0`).get(day);
 const notices=await db.prepare('SELECT COUNT(*) AS total FROM delivery_notifications WHERE created>?').get(now-86400000);
 const errors=await db.prepare("SELECT last_error AS code,COUNT(*) AS total FROM push_deliveries WHERE last_error IS NOT NULL AND state IN ('pending','failed','invalid') GROUP BY last_error").all();
 const rows=await db.prepare('SELECT state,COUNT(*) AS total FROM push_deliveries GROUP BY state').all();
 const counts=Object.fromEntries(rows.map(r=>[r.state,Number(r.total)]));
 const blockers=[];
 if(!providers.emailReady)blockers.push('Email verification provider is not configured.');
 if(providers.emailTestSender)blockers.push('Signup email uses the Resend test sender, which cannot deliver to general users. Verify a domain in Resend and update EMAIL_FROM to an address on that domain.');
 if(!push.ready)blockers.push('Firebase server push is not configured. Set FCM_ENABLED=true and FCM_SERVICE_ACCOUNT_FILE to a private Render Secret File.');
 if(!Number(devices.total))blockers.push('No active rider notification devices are registered. Install the Firebase APK, sign in and allow notifications.');
 if(!Number(available.total))blockers.push('No riders have confirmed a current working route today. Riders choose today’s routes on Home or in Profile.');
 blockers.push(walletControlEnabled?'Automatic wallet holds use the mock provider. These are sample funds, not a live bank balance.':'Automatic wallet funding is not enabled. Creating a shipment alone does not fund it.');
 return {
  emailConfigured:Boolean(providers.emailReady),emailTestSender:Boolean(providers.emailTestSender),
  push:{projectId:push.projectId||null,enabled:env.FCM_ENABLED==='true',configured:Boolean(push.ready),activeDevices:Number(devices.total),activeVendorDevices:Number(vendorDevices.total),availableRiders:Number(available.total),alertsLastDay:Number(notices.total),errors:errors.map(e=>({code:/^[A-Z0-9_]{1,80}$/.test(e.code)?e.code:'PROVIDER_ERROR',count:Number(e.total)})),providerAccepted:counts.sent||0,pending:(counts.pending||0)+(counts.sending||0),failed:(counts.failed||0)+(counts.invalid||0)},
  funding:{automaticWalletEnabled:Boolean(walletControlEnabled),walletProvider:walletControlEnabled?'mock':null,checkoutConfigured:Boolean(providers.paymentReady),checkoutMode:providers.paymentReady?providers.mode:null,liveAutomaticBankFunding:false},
  blockers,
  verification:'Configuration and FCM acceptance do not establish device receipt. Complete a consenting two-phone test before treating dispatch as live.'
 };
}

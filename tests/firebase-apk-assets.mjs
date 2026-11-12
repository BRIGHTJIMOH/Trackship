import {execFileSync} from 'node:child_process';
import {existsSync} from 'node:fs';
import assert from 'node:assert/strict';
const apk=process.env.SENDRACK_FIREBASE_APK||'artifacts/SendRack-0.7.13-fcm-unsigned.apk';
const aapt=process.env.SENDRACK_AAPT2||'/workspace/toolchains/build-tools/android-15/aapt2';
assert.ok(existsSync(apk),'Build the Firebase APK first');
const badging=execFileSync(aapt,['dump','badging',apk],{encoding:'utf8'});
assert.match(badging,/application-label:'SendRack'/);
assert.match(badging,/name='ng\.sendrack\.test' versionCode='13' versionName='0\.7\.13-fcm'/);
const manifest=execFileSync(aapt,['dump','xmltree',apk,'--file','AndroidManifest.xml'],{encoding:'utf8'});
for(const name of ['ng.trackship.app.SendrackMessagingService','com.google.firebase.provider.FirebaseInitProvider','com.google.firebase.MESSAGING_EVENT','android.permission.POST_NOTIFICATIONS'])assert.ok(manifest.includes(name),name);
execFileSync('python3',['-c',`
import zipfile,sys
with zipfile.ZipFile(sys.argv[1]) as z:
 names=z.namelist()
 dex=b''.join(z.read(n) for n in names if n.endswith('.dex'))
 for value in [b'FirebaseMessagingService',b'FirebaseDeliveryPush',b'PushRegistrationWorker',b'/api/v4/rider/push/register',b'getDeliveryPushStatus',b'retryDeliveryPush',b'registeredAt',b'token-request-failed']:
  assert value in dex,value
 main=z.read('assets/web/app.js');css=z.read('assets/web/style.css')
 assert b"input('Login PIN','loginPin'" in main, 'Modern login missing from Firebase APK'
 assert b'.onboard.access-screen' in css and b'max-width:440px' in css, 'Centred login CSS missing'
 assert b'sendrack-logo-spin' in css, 'Modern splash styling missing'
 assert b'appearance-card' in main and b'padding:22px 24px' in css, 'Appearance correction missing'
 assert b'.account-overview .customer-balance h2{font-size:18px' in css, 'Compact profile balance missing'
 assert b'verifyMapProvider' in z.read('assets/web/map-display.mjs') and b'useFallback' in z.read('assets/web/map-display.mjs'), 'Map authorization/fallback correction missing'
 assert b'features.contactsView(s,rider())' in main, 'Delivery call controls missing'
 assert b'/contacts' in z.read('assets/web/features.mjs'), 'Authenticated contact lookup missing'
 assert b'/api/v4/rider/dispatch/sync' in z.read('assets/web/features.mjs') and b'paintDispatch' in z.read('assets/web/features.mjs'), 'Automatic dispatch sync missing'
 assert b'pendingDeliveryAlert' in z.read('assets/web/app.js')
 assert b'pendingDeliveryAlert' in z.read('assets/web/sendrack-main.js')
 assert b'sendrack-fcbe5' in z.read('resources.arsc')
 assert not any(n.endswith('google-services.json') or n.endswith('service-account.json') for n in names)
`,apk],{stdio:'inherit'});
console.log('Firebase APK checked: matching package/project, SDK/service/worker, notification permission and lock-aware entry; no raw credential JSON files packaged.');

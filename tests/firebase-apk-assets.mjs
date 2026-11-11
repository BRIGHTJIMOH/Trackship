import {execFileSync} from 'node:child_process';
import {existsSync} from 'node:fs';
import assert from 'node:assert/strict';
const apk=process.env.SENDRACK_FIREBASE_APK||'artifacts/SendRack-Test-0.7.3-test.1-fcm-unsigned.apk';
const aapt=process.env.SENDRACK_AAPT2||'/workspace/toolchains/build-tools/android-15/aapt2';
assert.ok(existsSync(apk),'Build the Firebase APK first');
const badging=execFileSync(aapt,['dump','badging',apk],{encoding:'utf8'});
assert.match(badging,/name='ng\.sendrack\.test' versionCode='3' versionName='0\.7\.3-test\.1-fcm'/);
const manifest=execFileSync(aapt,['dump','xmltree',apk,'--file','AndroidManifest.xml'],{encoding:'utf8'});
for(const name of ['ng.trackship.app.SendrackMessagingService','com.google.firebase.provider.FirebaseInitProvider','com.google.firebase.MESSAGING_EVENT','android.permission.POST_NOTIFICATIONS'])assert.ok(manifest.includes(name),name);
execFileSync('python3',['-c',`
import zipfile,sys
with zipfile.ZipFile(sys.argv[1]) as z:
 names=z.namelist()
 dex=b''.join(z.read(n) for n in names if n.endswith('.dex'))
 for value in [b'FirebaseMessagingService',b'FirebaseDeliveryPush',b'PushRegistrationWorker',b'/api/v4/rider/push/register']:
  assert value in dex,value
 assert b'pendingDeliveryAlert' in z.read('assets/web/app.js')
 assert b'pendingDeliveryAlert' in z.read('assets/web/sendrack-main.js')
 assert b'sendrack-fcbe5' in z.read('resources.arsc')
 assert not any(n.endswith('google-services.json') or n.endswith('service-account.json') for n in names)
`,apk],{stdio:'inherit'});
console.log('Firebase APK checked: matching package/project, SDK/service/worker, notification permission and lock-aware entry; no raw credential JSON files packaged.');

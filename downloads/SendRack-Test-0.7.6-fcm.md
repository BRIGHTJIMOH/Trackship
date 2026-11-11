# Signed SendRack Firebase test APK

Source: BRIGHTJIMOH/Trackship branch firebase-delivery-notifications, commit f7a6e290c56b7582747052db20fc1ca465fc5ac0. Built with scripts/build-firebase-apk.sh and the locally supplied matching Android google-services.json. No committed application source was changed.

Version: 0.7.6-fcm, versionCode 6, application ID ng.sendrack.test. The commit hardcodes versionCode 3; this build overrides only its version metadata to permit installation over the previously published code-5 test APK. android.useAndroidX=true was also supplied as a build property because the commit omits it. Gradle 8.14.3, JDK 21 and existing Android SDK/Build Tools 35 were used, with the environment's trusted CA store and TLS verification enabled. The original signing identity was neither generated nor replaced.

APK SHA-256: f36fce409d62ba2b511fea839ad028e2cc7ee92f7c57a0f1931851a12dc274bf
Size: 4254696 bytes.
Signer SHA-256: d34b55d2982e55a2623157423ba2ad634ce2844c482144b53f53d88f0b8ecfa5.

The retained key, password file and certificate pin remain private under /workspace/sendrack-test-signing with directory 0700 and files 0600. This APK updates the same ng.sendrack.test installation without uninstalling. It does not replace the original ng.trackship.app identity or automatically transfer installation-only records between those packages.

Verification: assembleRelease and lintVitalRelease passed. APK archive CRC, package/version, v2/v3 signature, retained certificate, exact backend URL, matching compiled Firebase client resources, messaging service, registration worker, notification permission and lock-aware delivery entry passed inspection. The repository's Firebase APK asset test was run with its expected version metadata adjusted to this build's override. No raw google-services.json, server service-account JSON, signing key or password file is packaged; the public Firebase client values required by the SDK are compiled into Android resources.

Backend: https://sendrack-api.onrender.com. This artifact publication does not merge the Firebase server branch or deploy Render. Live push delivery, physical-device installation, permissions and notification receipt were not tested. The matching Firebase server implementation must be deployed and configured privately, using FCM_ENABLED=true and the matching service-account Render Secret File referenced by FCM_SERVICE_ACCOUNT_FILE. Preserve existing Render resources, plans, database and unrelated environment settings. Never put server credentials in the Android client config or send them through chat.

This build follows the requested f7a6e29 source. Separate unmerged UI/map/identity-review work in another workspace branch is not included.

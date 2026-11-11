# Firebase delivery notifications

## Android client

The supplied Android configuration matches Firebase project `sendrack-fcbe5` and package `ng.sendrack.test`. It is staged privately at `config/firebase/ng.sendrack.test/google-services.json` and copied to the ignored `android/firebase/google-services.json` for the Firebase-enabled build. Neither is a server service-account credential.

`android/firebase` is a new, standalone Gradle Android project. It uses the Google Services plugin 4.5.0, Firebase BoM 35.1.0 and `firebase-messaging`, matching the console's Gradle instructions while selecting the SDK needed for delivery alerts. WorkManager retries native device registration. Native token refresh, permission handling, logout cleanup and notification taps are connected to the existing rider workspace. Background inbox polling remains a fallback.

Run `bash scripts/build-firebase-apk.sh` with an Android SDK (`ANDROID_HOME`, API/Build Tools 35) and JDK 17+ installed. `SENDRACK_FIREBASE_JSON` can select another local copy of the downloaded Android configuration. The wrapper pins Gradle 8.11.1 and verifies the distribution checksum. `SENDRACK_GRADLE` can select an already installed matching Gradle binary.

The test APK uses package `ng.sendrack.test`, version code 3, version name `0.7.3-test.1-fcm`. The original manual build keeps working without Firebase and retains its own identity. The Firebase build is unsigned unless the retained test keystore, password file and certificate pin exist in `SENDRACK_TEST_KEY_DIR`. It refuses mismatched certificates and never generates a replacement signing identity. A signed APK must be installed on the phone; a Render website deployment cannot add the native Firebase SDK to an existing installation.

## Private sending credentials on Render

The Android client file does not authorize the server to send messages. Configure these separately:

1. In Firebase project `sendrack-fcbe5`, ensure the Cloud Messaging HTTP v1 API is enabled. Under Project settings → Service accounts, obtain the private service-account JSON with Cloud Messaging sending permission.
2. Put that private file in **Render → sendrack-api → Secret Files** as `firebase-service-account.json`. Do not upload it in chat or commit it to Git.
3. Set `FCM_SERVICE_ACCOUNT_FILE=/etc/secrets/firebase-service-account.json` and `FCM_ENABLED=true` in that service's private environment settings. Preserve all existing database, identity and payment settings.
4. Deploy the reviewed server changes. Install the correctly signed Firebase APK, log in as a rider and allow Android notifications. A real-device delivery test is required before calling push active.

As an alternative, the service accepts a private `FCM_SERVICE_ACCOUNT_JSON` environment value, or the existing `FCM_PROJECT_ID`, `FCM_CLIENT_EMAIL`, `FCM_PRIVATE_KEY_BASE64` fields. Use one credential mechanism, not the Android configuration file.

## Delivery behavior and checks

Authenticated rider sessions register device installations with a private installation secret. The inbox is the durable source for delivery offers. The worker runs inside the existing API service, claims jobs under database serialization, releases the database before contacting FCM and retries bounded transient failures. Successful sends are not re-enqueued. Invalid tokens are disabled and refreshed tokens can retry their unsent messages. Logged-out, expired or suspended sessions are excluded.

FCM messages contain an opaque inbox event ID and a hashed session binding, not shipment addresses, customer phone numbers or bearer tokens. Android rechecks that binding before showing a generic notification and deduplicates by event ID. Logging out clears delivery notifications and makes any late message ineffective. Tapping a notification retains the request through the app lock and opens the rider inbox after login.

FCM, Android background restrictions, device connectivity and the existing hosting plan affect timing. Force-stopping an Android app prevents receipt until it is reopened. This is not an SMS or iPhone push integration.

Local verification covers authenticated device registration/revocation, OAuth v1 signing/caching, durable retry/restart behavior, token rotation and the standard server regression suite. Native compilation and APK contents can verify the SDK is packaged; actual Firebase delivery requires private server credentials, the original signing identity and a consenting physical test device.

## Verification in this workspace

The Firebase-enabled unsigned release APK compiled successfully and was checked for the matching project/package, Messaging service, notification permission, registration worker and lock-aware app entry. The original manual Android sources also compiled successfully with the optional reflection bridge. The notification-tap browser test passed through PIN reauthentication. The server regression run passed 68 tests with four environment-dependent skips; focused push/migration checks also passed. The finance/app-corrections browser suite could not start because its separate PostgreSQL fixture is unavailable here. No real Firebase notification, production deployment or signed APK installation is claimed.

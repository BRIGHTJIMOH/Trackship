> Historical reference: the separate Android FCM build is now implemented in `android/firebase`. See [`config/firebase/README.md`](../firebase/README.md) for the active build and private Render setup. The Apple material below remains a future reference.

# Future push configuration references — not activated

The completed APK (`ng.sendrack.test`, 0.7.1-test.1) contains **no Firebase SDK** and there is **no native iPhone app**. Neither file here is consumed by the released manual ECJ/aapt2 build. Current alerts are the in-app REST inbox, foreground polling and Android JobScheduler/local notifications, not FCM/APNs. No Firebase/Apple file is needed to run that completed build.

These placeholder-only references accompany the unmerged PR #8 adapter variable inventory. They are not usable configuration or proof of native integration. Do not rename them into an active app and assume push works.

## Android / Firebase, when a separate integration is reviewed

Register the exact application ID in Firebase. The side-by-side test app is `ng.sendrack.test`; the original is `ng.trackship.app`. They need separate Firebase Android client entries/configuration; do not change the existing app's identity/signature to fit a sample file. Download the real generated `google-services.json` from your Firebase project privately. Its actual project/app/API identifiers and configuration version replace every placeholder in the reference. It is native-client configuration, not a server service-account private key.

A future build must explicitly integrate Firebase Messaging dependencies, the Google Services configuration/initialization, a messaging service, permission/channel flow, token refresh/registration/revocation and native notification handling. The existing manual build currently does none of this. An eventual Gradle project normally places its generated configuration in the Android application module; no such Gradle module exists here, so `android/app/google-services.json` is not a current supported build path.

The unmerged server adapter uses **FCM HTTP v1 OAuth service-account authentication** with `FCM_PROJECT_ID`, `FCM_CLIENT_EMAIL`, `FCM_PRIVATE_KEY_BASE64`. The last value is base64 of a real PEM private key and belongs only in server secret storage. No `FCM_SERVER_KEY`/legacy-key variable is implemented. Do not place service-account credentials in the APK, this reference JSON, screenshots or Git.

## Apple, when a native app exists

Create a native iOS application with its exact bundle ID and Apple push entitlement/capability and matching provisioning profile. `SendRackPush.entitlements.example` demonstrates the entitlement key only; a real signed application must get the appropriate development/production entitlement through Xcode/provisioning. It is not a complete Xcode project or provisioning profile. Alerts do not automatically provide background location, silent push or browser push.

The unmerged APNs adapter reads `APNS_TEAM_ID`, `APNS_KEY_ID`, `APNS_BUNDLE_ID`, `APNS_PRIVATE_KEY_BASE64`, `APNS_ENVIRONMENT`. The private value is base64 of the Apple .p8 PEM signing key, stored on the server only. Obtain the actual .p8 from Apple Developer privately; there is intentionally no fake .p8 or private-key template. In the draft, `production` selects production APNs; otherwise sandbox is selected. iPhone Safari/browser notifications are separate and are not enabled by these files.

An always-available worker, actual native clients, installation-token lifecycle, real providers and device tests are still required. Production v5 activation remains blocked by the draft. Do not enable a preview variable or change Render's production environment to work around that gate. No paid service has been provisioned.

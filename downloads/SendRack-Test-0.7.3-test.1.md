# SendRack Test 0.7.3-test.1

Signed APK: SendRack-Test-0.7.3-test.1.apk (Android 8+, min SDK 26, target 35).
Application ID ng.sendrack.test, version code 3. Backend is configured to
https://sendrack-api.onrender.com. App source is commit
67460faa592dc2a7713f05c1342e80c6ce59beb5, including the integrated wallet, minimal
vehicle home, single-ID onboarding and existing native location bridge.

This is the same SendRack product code, using the separately labelled SendRack Test
identity authorised earlier because the original app signing key is absent. It
installs alongside ng.trackship.app and updates previous ng.sendrack.test builds
in place. No uninstall is required. Records stored in the original app's private
installation do not automatically transfer to this separate test installation.
Existing cloud accounts can sign in through their normal verified login.

The signing certificate matches the retained previous SendRack Test identity:
d34b55d2982e55a2623157423ba2ad634ce2844c482144b53f53d88f0b8ecfa5
No new key was generated. Private keystore/password/backup remain outside Git.
The original app key and signing identity have not been replaced.

APK SHA-256:
58b1a233334607a768ffeefdd49836844f01d1cfa6c386e7cae8895ea15f5bc7
Size: 1,244,044 bytes.

Verification: Android build succeeded; APK Signature Scheme v2/v3 verified;
manifest/package/version/permissions verified; exact source and required wallet,
vehicle/map/viewer modules and compiled native viewer bridge verified. Actual
extracted APK screens passed in Chromium against isolated local PostgreSQL-backed
APIs: retained-account PIN login, minimal vehicle dashboard, wallet/Profile PIN,
withdrawal OTP, server-priced shipment review, Keke signup and retained ID/photo
selection. This is browser testing of packaged assets, not Android OS execution.
No attached device, adb or emulator/KVM was available for physical permission,
picker/lifecycle or installation tests. Java deprecation warnings did not fail build.

Live Render access is blocked from the build environment (CONNECT 403), and no
Render connection or deploy hook is configured. No live deployment verification or
live signup/GPS/tile/provider success is claimed. The source is merged into the
existing service's deployment branch; if Auto-Deploy is disabled, use Render ->
sendrack-api -> Manual Deploy -> Deploy latest commit. Do not recreate resources,
apply a new Blueprint, reset the database or change free plans/environment values.

Live banking remains disabled pending documented provider integration and setup.
No funds, real payment provider, bank KYC or verification code has been bypassed.

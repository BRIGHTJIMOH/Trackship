#!/usr/bin/env bash
# Build the separate test identity with Firebase; never create or replace a signing key.
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT="$PWD"
: "${ANDROID_HOME:=${ANDROID_SDK_ROOT:-}}"
if test -z "$ANDROID_HOME"; then echo 'Set ANDROID_HOME to an installed Android SDK (API 35 and Build Tools 35).' >&2; exit 1; fi
export ANDROID_HOME
export ANDROID_USER_HOME="${ANDROID_USER_HOME:-$ROOT/build/firebase-android-user}"
export GRADLE_USER_HOME="${GRADLE_USER_HOME:-$ROOT/build/firebase-gradle-home}"
mkdir -p "$ANDROID_USER_HOME" "$GRADLE_USER_HOME" artifacts
export SENDRACK_FIREBASE_JSON="${SENDRACK_FIREBASE_JSON:-$ROOT/config/firebase/ng.sendrack.test/google-services.json}"
python3 - <<'PY'
import os,json,pathlib,shutil
p=pathlib.Path(os.environ['SENDRACK_FIREBASE_JSON'])
if not p.is_file():raise SystemExit('Provide the Firebase Android google-services.json locally using SENDRACK_FIREBASE_JSON.')
d=json.loads(p.read_text())
if d.get('private_key') or d.get('type')=='service_account':raise SystemExit('A private service-account file must never be used in an APK.')
if not any(c.get('client_info',{}).get('android_client_info',{}).get('package_name')=='ng.sendrack.test' for c in d.get('client',[])):raise SystemExit('Firebase configuration must match ng.sendrack.test.')
target=pathlib.Path('android/firebase/google-services.json')
if p.resolve()!=target.resolve():shutil.copyfile(p,target)
PY
GRADLE="${SENDRACK_GRADLE:-$ROOT/android/firebase/gradlew}"
"$GRADLE" -p "$ROOT/android/firebase" assembleRelease --console=plain
UNSIGNED="$ROOT/artifacts/SendRack-0.7.15-fcm-unsigned.apk"
cp android/firebase/build/outputs/apk/release/SendRackFirebaseTest-release-unsigned.apk "$UNSIGNED"
KEY_DIR="${SENDRACK_TEST_KEY_DIR:-/workspace/sendrack-test-signing}"
if ! test -f "$KEY_DIR/sendrack-test.p12" || ! test -f "$KEY_DIR/password.txt" || ! test -f "$KEY_DIR/certificate-sha256.txt"; then
 echo "Unsigned APK built: $UNSIGNED"
 echo 'The retained test signing identity is needed for an installable update; no replacement key was generated.'
 exit 1
fi
BT="$ANDROID_HOME/build-tools/35.0.0"
ACTUAL=$(keytool -exportcert -keystore "$KEY_DIR/sendrack-test.p12" -storepass:file "$KEY_DIR/password.txt" -alias sendrack-test | sha256sum | cut -d ' ' -f 1)
if test "$ACTUAL" != "$(cat "$KEY_DIR/certificate-sha256.txt")"; then echo 'Test signing certificate mismatch; refusing to sign.' >&2; exit 1; fi
"$BT/zipalign" -P 16 -f 4 "$UNSIGNED" build/firebase-aligned.apk
SIGNED="$ROOT/artifacts/SendRack-0.7.15-fcm.apk"
"$BT/apksigner" sign --ks "$KEY_DIR/sendrack-test.p12" --ks-key-alias sendrack-test --ks-pass "file:$KEY_DIR/password.txt" --out "$SIGNED" build/firebase-aligned.apk
"$BT/apksigner" verify "$SIGNED"
sha256sum "$SIGNED" > "$SIGNED.sha256"
echo "Signed test update built: $SIGNED"

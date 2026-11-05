#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
TOOLS="${TRACKSHIP_TOOLS:-/workspace/toolchains}"
ANDROID_JAR="$TOOLS/platform/android-35/android.jar"
BT="$TOOLS/build-tools/android-15"
for file in "$ANDROID_JAR" "$BT/aapt2" "$BT/d8" "$BT/apksigner" "$TOOLS/ecj.jar"; do
  test -f "$file" || { echo "Missing build prerequisite: $file. Run bash scripts/setup-android.sh" >&2; exit 1; }
done
mkdir -p build/classes build/dex build/assets/web artifacts
cp web/index.html web/style.css web/app.js web/core.mjs web/lifecycle.mjs web/features.mjs web/config.mjs web/accounts.mjs web/identity.mjs build/assets/web/
cp -R web/assets build/assets/web/
# Distinct entry filenames avoid reusing screen files from older installed builds.
cp web/index.html build/assets/web/sendrack-entry.html
cp web/app.js build/assets/web/sendrack-main.js
cp web/style.css build/assets/web/sendrack-ui.css
if test -n "${TRACKSHIP_SERVICE_URL:-}"; then
 python3 - <<'PYCONFIG'
import os,json,urllib.parse
url=os.environ['TRACKSHIP_SERVICE_URL'].rstrip('/')
u=urllib.parse.urlparse(url)
if u.scheme!='https' or not u.hostname or u.username or u.password or u.path or u.query or u.fragment: raise SystemExit('TRACKSHIP_SERVICE_URL must be an HTTPS origin')
open('build/assets/web/config.mjs','w').write('export const SERVICE_URL = '+json.dumps(url)+';\n')
PYCONFIG
fi
"$BT/aapt2" compile --dir android/res -o build/resources.zip
"$BT/aapt2" link -o build/resources.apk -I "$ANDROID_JAR" --manifest android/AndroidManifest.xml --java build/generated -A build/assets build/resources.zip
java -jar "$TOOLS/ecj.jar" -source 1.8 -target 1.8 -classpath "$ANDROID_JAR" -d build/classes android/src/ng/trackship/app/*.java build/generated/ng/trackship/app/R.java
mapfile -t classes < <(find build/classes -name '*.class' -type f)
"$BT/d8" --lib "$ANDROID_JAR" --min-api 26 --output build/dex "${classes[@]}"
cp build/resources.apk build/unsigned.apk
python3 - <<'PY'
import zipfile
with zipfile.ZipFile('build/unsigned.apk','a',compression=zipfile.ZIP_DEFLATED) as z:
 z.write('build/dex/classes.dex','classes.dex')
PY
"$BT/zipalign" -f -p 4 build/unsigned.apk build/aligned.apk
# A local test signing identity, never a Play Store release key.
KEY_DIR="${TRACKSHIP_KEY_DIR:-/workspace/trackship-signing}"
if ! test -f "$KEY_DIR/test.keystore"; then
 echo "Original signing key missing: configure TRACKSHIP_KEY_DIR. Refusing to replace the app signing identity." >&2
 exit 1
fi
EXPECTED_CERT="46d13c6e672b351f992871414a5d2b63dda3a373acd35edfa99a452cdb0d6708"
ACTUAL_CERT=$(keytool -exportcert -keystore "$KEY_DIR/test.keystore" -storepass android -alias trackship-test | sha256sum | cut -d ' ' -f 1)
if test "$ACTUAL_CERT" != "$EXPECTED_CERT"; then
 echo "Signing certificate does not match the existing SendRack app. Refusing to sign." >&2
 exit 1
fi
"$BT/apksigner" sign --ks "$KEY_DIR/test.keystore" --ks-key-alias trackship-test --ks-pass pass:android --key-pass pass:android --out artifacts/SendRack-test.apk build/aligned.apk
"$BT/apksigner" verify --verbose artifacts/SendRack-test.apk
sha256sum artifacts/SendRack-test.apk > artifacts/SendRack-test.apk.sha256
printf 'Test APK: artifacts/SendRack-test.apk\n'

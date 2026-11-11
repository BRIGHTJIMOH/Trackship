#!/usr/bin/env bash
# Separate application identity only. The original build-apk.sh and its certificate pin stay intact.
set -euo pipefail
umask 077
cd "$(dirname "$0")/.."
TOOLS="${TRACKSHIP_TOOLS:-/workspace/toolchains}"
BT="$TOOLS/build-tools/android-15"
ANDROID_JAR="$TOOLS/platform/android-35/android.jar"
KEY_DIR="${SENDRACK_TEST_KEY_DIR:-/workspace/sendrack-test-signing}"
export SENDRACK_TEST_KEY_DIR="$KEY_DIR"
python3 - <<'PY'
import os
p=os.path.realpath(os.environ['SENDRACK_TEST_KEY_DIR'])
if p==os.path.realpath('/workspace/trackship-signing'):raise SystemExit('Refusing to use the original signing directory for a separate test app.')
os.makedirs(p,mode=0o700,exist_ok=True);os.chmod(p,0o700)
PY
KEY="$KEY_DIR/sendrack-test.p12"
PASSWORD="$KEY_DIR/password.txt"
CERT="$KEY_DIR/certificate-sha256.txt"
# This app already has an issued signing identity. Missing files must be restored,
# never regenerated, so updates remain compatible with the earlier SendRack Test.
test -f "$KEY" && test -f "$PASSWORD" && test -f "$CERT" || { echo 'Restore the retained SendRack Test signing key. Refusing to generate a replacement identity.' >&2; exit 1; }
chmod 600 "$KEY" "$PASSWORD" "$CERT"
actual_cert=$(keytool -exportcert -keystore "$KEY" -storepass:file "$PASSWORD" -alias sendrack-test | sha256sum | cut -d ' ' -f 1)
test "$actual_cert" = "d34b55d2982e55a2623157423ba2ad634ce2844c482144b53f53d88f0b8ecfa5" && test "$actual_cert" = "$(cat "$CERT")" || { echo 'Test certificate changed; refusing to sign.' >&2; exit 1; }
for prerequisite in "$ANDROID_JAR" "$BT/aapt2" "$BT/d8" "$BT/apksigner" "$BT/zipalign" "$TOOLS/ecj.jar"; do test -f "$prerequisite" || { echo "Missing build prerequisite: $prerequisite" >&2; exit 1; }; done
WORK=build/sendrack-test
mkdir -p "$WORK/classes" "$WORK/dex" "$WORK/assets/web" "$WORK/generated" "$WORK/src/ng/sendrack/test" artifacts
export SENDRACK_TEST_SERVICE_URL="${SENDRACK_TEST_SERVICE_URL:-https://sendrack-api.onrender.com}"
python3 - <<'PY'
import os,pathlib,shutil,json,urllib.parse
root=pathlib.Path('build/sendrack-test');assets=root/'assets/web'
url=os.environ['SENDRACK_TEST_SERVICE_URL'].rstrip('/');u=urllib.parse.urlparse(url)
if u.scheme!='https' or not u.hostname or u.username or u.password or u.path or u.query or u.fragment:raise SystemExit('Test backend must be an HTTPS origin.')
for name in ['index.html','style.css','app.js','core.mjs','lifecycle.mjs','features.mjs','map-display.mjs','viewer-location.mjs','map-controls.css','accounts.mjs','identity.mjs','vehicles.mjs','customer-wallet.mjs']:
 shutil.copy2(pathlib.Path('web')/name,assets/name)
shutil.copytree('web/assets',assets/'assets',dirs_exist_ok=True)
for name in ['index.html','app.js']:
 p=assets/name;s=p.read_text().replace('0.7.0','0.7.5');p.write_text(s)
(assets/'config.mjs').write_text('export const SERVICE_URL = '+json.dumps(url)+';\n')
for source,target in [('index.html','sendrack-entry.html'),('app.js','sendrack-main.js'),('style.css','sendrack-ui.css')]:shutil.copy2(assets/source,assets/target)
manifest=pathlib.Path('android/AndroidManifest.xml').read_text().replace('package="ng.trackship.app"','package="ng.sendrack.test"').replace('android:versionCode="13"','android:versionCode="5"').replace('android:versionName="0.7.0"','android:versionName="0.7.5"')
(root/'AndroidManifest.xml').write_text(manifest)
for p in pathlib.Path('android/src/ng/trackship/app').glob('*.java'):
 s=p.read_text().replace('ng.trackship.app','ng.sendrack.test')
 (root/'src/ng/sendrack/test'/p.name).write_text(s)
PY
"$BT/aapt2" compile --dir android/res -o "$WORK/resources.zip"
"$BT/aapt2" link -o "$WORK/resources.apk" -I "$ANDROID_JAR" --manifest "$WORK/AndroidManifest.xml" --java "$WORK/generated" -A "$WORK/assets" "$WORK/resources.zip"
java -jar "$TOOLS/ecj.jar" -source 1.8 -target 1.8 -classpath "$ANDROID_JAR" -d "$WORK/classes" "$WORK"/src/ng/sendrack/test/*.java "$WORK/generated/ng/sendrack/test/R.java"
mapfile -t classes < <(find "$WORK/classes" -name '*.class' -type f)
"$BT/d8" --lib "$ANDROID_JAR" --min-api 26 --output "$WORK/dex" "${classes[@]}"
cp "$WORK/resources.apk" "$WORK/unsigned.apk"
python3 - <<'PY'
import zipfile
with zipfile.ZipFile('build/sendrack-test/unsigned.apk','a',compression=zipfile.ZIP_DEFLATED) as z:z.write('build/sendrack-test/dex/classes.dex','classes.dex')
PY
"$BT/zipalign" -f -p 4 "$WORK/unsigned.apk" "$WORK/aligned.apk"
"$BT/apksigner" sign --ks "$KEY" --ks-key-alias sendrack-test --ks-pass "file:$PASSWORD" --out artifacts/SendRack-0.7.5.apk "$WORK/aligned.apk"
"$BT/apksigner" verify --verbose --print-certs artifacts/SendRack-0.7.5.apk
sha256sum artifacts/SendRack-0.7.5.apk > artifacts/SendRack-0.7.5.apk.sha256
"$BT/aapt2" dump badging artifacts/SendRack-0.7.5.apk | head -6
printf 'Separate SendRack Test APK built. Original package/key unchanged. Test key retained privately outside the repository.\n'

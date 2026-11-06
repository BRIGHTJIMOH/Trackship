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
if test -e "$KEY" || test -e "$PASSWORD" || test -e "$CERT"; then
 test -f "$KEY" && test -f "$PASSWORD" && test -f "$CERT" || { echo 'Incomplete test signing identity. Restore its private backup; refusing to replace it.' >&2; exit 1; }
else
 python3 - <<'PY'
import os,secrets
p=os.path.join(os.environ['SENDRACK_TEST_KEY_DIR'],'password.txt')
f=os.open(p,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
with os.fdopen(f,'w') as out:out.write(secrets.token_urlsafe(48)+'\n')
PY
 keytool -genkeypair -keystore "$KEY" -storetype PKCS12 -storepass:file "$PASSWORD" -keypass:file "$PASSWORD" -alias sendrack-test -keyalg RSA -keysize 3072 -validity 10000 -dname 'CN=SendRack Test, OU=Separate Test Application, O=SendRack'
 keytool -exportcert -keystore "$KEY" -storepass:file "$PASSWORD" -alias sendrack-test | sha256sum | cut -d ' ' -f 1 > "$CERT"
fi
chmod 600 "$KEY" "$PASSWORD" "$CERT"
actual_cert=$(keytool -exportcert -keystore "$KEY" -storepass:file "$PASSWORD" -alias sendrack-test | sha256sum | cut -d ' ' -f 1)
test "$actual_cert" = "$(cat "$CERT")" || { echo 'Test certificate changed; refusing to sign.' >&2; exit 1; }
for prerequisite in "$ANDROID_JAR" "$BT/aapt2" "$BT/d8" "$BT/apksigner" "$BT/zipalign" "$TOOLS/ecj.jar"; do test -f "$prerequisite" || { echo "Missing build prerequisite: $prerequisite" >&2; exit 1; }; done
WORK=build/sendrack-test
mkdir -p "$WORK/classes" "$WORK/dex" "$WORK/assets/web" "$WORK/generated" "$WORK/src/ng/sendrack/test" artifacts
export SENDRACK_TEST_SERVICE_URL="${SENDRACK_TEST_SERVICE_URL:-https://sendrack-api.onrender.com}"
python3 - <<'PY'
import os,pathlib,shutil,json,urllib.parse
root=pathlib.Path('build/sendrack-test');assets=root/'assets/web'
url=os.environ['SENDRACK_TEST_SERVICE_URL'].rstrip('/');u=urllib.parse.urlparse(url)
if u.scheme!='https' or not u.hostname or u.username or u.password or u.path or u.query or u.fragment:raise SystemExit('Test backend must be an HTTPS origin.')
for name in ['index.html','style.css','app.js','core.mjs','lifecycle.mjs','features.mjs','map-display.mjs','viewer-location.mjs','map-controls.css','accounts.mjs','identity.mjs']:
 shutil.copy2(pathlib.Path('web')/name,assets/name)
shutil.copytree('web/assets',assets/'assets',dirs_exist_ok=True)
for name in ['index.html','app.js']:
 p=assets/name;s=p.read_text().replace('SendRack','SendRack Test').replace('0.7.0','0.7.2-test.1');p.write_text(s)
(assets/'config.mjs').write_text('export const SERVICE_URL = '+json.dumps(url)+';\n')
for source,target in [('index.html','sendrack-entry.html'),('app.js','sendrack-main.js'),('style.css','sendrack-ui.css')]:shutil.copy2(assets/source,assets/target)
manifest=pathlib.Path('android/AndroidManifest.xml').read_text().replace('package="ng.trackship.app"','package="ng.sendrack.test"').replace('android:versionCode="13"','android:versionCode="2"').replace('android:versionName="0.7.0"','android:versionName="0.7.2-test.1"').replace('android:label="SendRack"','android:label="SendRack Test"')
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
"$BT/apksigner" sign --ks "$KEY" --ks-key-alias sendrack-test --ks-pass "file:$PASSWORD" --out artifacts/SendRack-Test-0.7.2-test.1.apk "$WORK/aligned.apk"
"$BT/apksigner" verify --verbose --print-certs artifacts/SendRack-Test-0.7.2-test.1.apk
sha256sum artifacts/SendRack-Test-0.7.2-test.1.apk > artifacts/SendRack-Test-0.7.2-test.1.apk.sha256
"$BT/aapt2" dump badging artifacts/SendRack-Test-0.7.2-test.1.apk | head -6
printf 'Separate SendRack Test APK built. Original package/key unchanged. Test key retained privately outside the repository.\n'

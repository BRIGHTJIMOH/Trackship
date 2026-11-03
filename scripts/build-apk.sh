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
cp web/index.html web/style.css web/app.js web/core.mjs build/assets/web/
cp -R web/assets build/assets/web/
"$BT/aapt2" compile --dir android/res -o build/resources.zip
"$BT/aapt2" link -o build/resources.apk -I "$ANDROID_JAR" --manifest android/AndroidManifest.xml --java build/generated -A build/assets build/resources.zip
java -jar "$TOOLS/ecj.jar" -source 1.8 -target 1.8 -classpath "$ANDROID_JAR" -d build/classes android/src/ng/trackship/app/MainActivity.java
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
mkdir -p "$KEY_DIR"
chmod 700 "$KEY_DIR"
if ! test -f "$KEY_DIR/test.keystore"; then
 keytool -genkeypair -keystore "$KEY_DIR/test.keystore" -storepass android -keypass android -alias trackship-test -keyalg RSA -keysize 2048 -validity 10000 -dname "CN=TrackShip NG Test, O=TrackShip NG, C=NG" -noprompt
 chmod 600 "$KEY_DIR/test.keystore"
fi
"$BT/apksigner" sign --ks "$KEY_DIR/test.keystore" --ks-key-alias trackship-test --ks-pass pass:android --key-pass pass:android --out artifacts/TrackShip-NG-test.apk build/aligned.apk
"$BT/apksigner" verify --verbose artifacts/TrackShip-NG-test.apk
sha256sum artifacts/TrackShip-NG-test.apk > artifacts/TrackShip-NG-test.apk.sha256
printf 'Test APK: artifacts/TrackShip-NG-test.apk\n'

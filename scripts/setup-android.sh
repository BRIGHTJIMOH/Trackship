#!/usr/bin/env bash
set -euo pipefail
TOOLS="${TRACKSHIP_TOOLS:-/workspace/toolchains}"
mkdir -p "$TOOLS"
fetch() { test -f "$2" || curl --fail --location --retry 2 "$1" -o "$2"; }
fetch https://dl.google.com/android/repository/platform-35_r02.zip "$TOOLS/platform.zip"
fetch https://dl.google.com/android/repository/build-tools_r35_linux.zip "$TOOLS/build-tools.zip"
fetch https://repo.maven.apache.org/maven2/org/eclipse/jdt/ecj/3.39.0/ecj-3.39.0.jar "$TOOLS/ecj.jar"
fetch https://repo.maven.apache.org/maven2/org/eclipse/jdt/ecj/3.39.0/ecj-3.39.0.jar.sha1 "$TOOLS/ecj.sha1"
export TRACKSHIP_TOOLS="$TOOLS"
python3 - <<'PY'
import os,pathlib,hashlib,zipfile
p=pathlib.Path(os.environ['TRACKSHIP_TOOLS'])
packages=[('platform.zip','0bb560a90a7a2cbd0dd8348224d518b638fe7949','platform'),('build-tools.zip','2cfaa0bbb2336e9ec18ed3ecea84fa2e2af607bc','build-tools'),('ecj.jar',(p/'ecj.sha1').read_text().strip(),None)]
for name,checksum,target in packages:
 if hashlib.sha1((p/name).read_bytes()).hexdigest()!=checksum: raise SystemExit('Checksum mismatch: '+name)
 if target:
  with zipfile.ZipFile(p/name) as z:
   z.extractall(p/target)
   for item in z.infolist():
    mode=item.external_attr>>16
    if mode:(p/target/item.filename).chmod(mode & 0o777)
 print(name+' verified')
PY

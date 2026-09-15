#!/usr/bin/env bash
# MIT integration recipe. Uses the pinned upstream ngspice/EEcircuit sources.
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y --no-install-recommends autoconf automake libtool bison flex
cd /workspace/.tmp/simulator-rebuild/native
chmod +x autogen.sh
./autogen.sh
mkdir -p release
cd release
emconfigure ../configure --disable-debug --disable-openmp --disable-xspice --disable-osdi --without-x --with-readline=no
python3 - <<'PY'
from pathlib import Path
p = Path('src/Makefile')
text = p.read_text()
before = '$(ngspice_LDADD) $(LIBS)'
assert before in text, 'ngspice link recipe changed'
flags = ' -O2 -s ASYNCIFY=1 -s ASYNCIFY_ADVISE=0 -s ASYNCIFY_IGNORE_INDIRECT=0 -s ENVIRONMENT="web,worker" -s ALLOW_MEMORY_GROWTH=1 -s MODULARIZE=1 -s EXPORT_ES6=1 -s EXPORTED_RUNTIME_METHODS=["FS","Asyncify","callMain"] --pre-js /workspace/.tmp/simulator-rebuild/pre.js -o spice.mjs'
p.write_text(text.replace(before, before + flags))
PY
emmake make -j2
cp src/spice.mjs ../../wrapper/src/spice.js
cp src/spice.wasm ../../wrapper/src/spice.wasm
emcc --version > ../../emscripten-version.txt
dpkg-query -W > ../../build-packages.txt
cp config.log ../../ngspice-config.log
printf '\nNative simulator build complete.\n'

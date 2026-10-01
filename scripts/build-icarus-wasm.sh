#!/usr/bin/env bash
# SPDX-License-Identifier: GPL-2.0-or-later
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y --no-install-recommends autoconf bison flex gperf
cd /workspace/.tmp/icarus-build/source
sh autoconf.sh
# Compression/readline/thread libraries are optional; the browser uses VCD,
# MEMFS and the ordinary single-threaded Icarus event scheduler.
export ac_cv_lib_readline_readline=no ac_cv_lib_readline_add_history=no
export ac_cv_lib_history_add_history=no ac_cv_lib_termcap_tputs=no
export ac_cv_lib_pthread_pthread_create=no ac_cv_lib_z_gzwrite=no
export ac_cv_lib_bz2_main=no ac_cv_lib_bz2_BZ2_bzdopen=no
emconfigure ./configure --build="$(gcc -dumpmachine)" --host=wasm32-unknown-emscripten --disable-libvvp CFLAGS=-O2 CXXFLAGS=-O2
# Repository archives have no .git metadata; record the exact source revision.
printf '#define VERSION_TAG "c7530dbcc186de2f21eacde14fd28061b885924c-anacode.1"\n' > version_tag.h
emmake make -j2 -C tgt-vvp anacode-target.a
emmake make -j2 -C vpi anacode-system.a
emmake make -j2 -C ivlpp anacode-ivlpp.js
emmake make -j2 anacode-ivl.js
emmake make -j2 -C vvp anacode-vvp.js
cd /workspace/.tmp/icarus-build
mkdir -p output
for module in ivlpp ivl vvp; do
  directory=source
  if [ "$module" != ivl ]; then directory="source/$module"; fi
  cp "$directory/anacode-$module.js" "output/$module.js"
  cp "$directory/anacode-$module.wasm" "output/$module.wasm"
  sed -i "s/anacode-$module.wasm/$module.wasm/g" "output/$module.js"
done
emcc --version > output/emscripten-version.txt
dpkg-query -W > output/build-packages.txt
cp source/config.log output/config.log
emscripten_dir="$(dirname "$(readlink -f "$(command -v emcc)")")"
cp "$emscripten_dir/LICENSE" output/EMSCRIPTEN-LICENSE.txt
license_archive="$PWD/output/emscripten-system-licenses.tar.gz"
(cd "$emscripten_dir"; find system -type f \( -iname '*license*' -o -iname '*copying*' -o -name COPYRIGHT \) -print0 | tar --null -T - -czf "$license_archive")
echo 'Icarus browser modules compiled from corresponding source.'

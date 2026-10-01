# Icarus browser engine source build

The reproducible build recipe uses official Icarus Verilog revision
`c7530dbcc186de2f21eacde14fd28061b885924c` (14.0 development) and the exact
source archive hash and Emscripten image digest in
[`scripts/icarus-build-inputs.json`](../scripts/icarus-build-inputs.json).
Icarus's compiler, preprocessor, scheduler and VCD writer remain upstream code.

The GPL patch replaces dynamic target loading with the upstream vvp code
generator linked into the compiler. It statically links the original system,
Verilog-2005 math, SystemVerilog-2009 and Verilog-A math registration tables into
both compiler and runtime. Compiler registration preserves system-function
return types; registration is not skipped. The browser port deliberately
rejects external VPI modules. Optional compressed trace formats, VHDL and
other synthesis targets are omitted; plain VCD uses the upstream writer.

Run the **Build Icarus Verilog from source** GitHub workflow or, from the
repository root with Node, Docker and the normal development dependencies:

```sh
node scripts/prepare-icarus-source.mjs
image=$(node -p "require('./scripts/icarus-build-inputs.json').buildImage")
docker run --rm --platform linux/amd64 --user root --mount "type=bind,source=$PWD,target=/workspace" --workdir /workspace "$image" bash scripts/build-icarus-wasm.sh
node scripts/package-icarus-source.mjs
```

The output is `.tmp/icarus-release/icarus/`, containing the three JS/WASM pairs,
original source archive, exact local patch, rebuild scripts, GPL text,
Emscripten/system-library notices, build package versions and SHA-256 inventory.
Build-time package versions are recorded; the source and Emscripten compiler are
digest-pinned. Bit-identical output is not assumed without a second comparison.

Before promotion, the workflow installs only its freshly built JS/WASM into the
test checkout and runs every project HDL solution, compile-error and wrong-logic
regression plus real math and 64-bit system-function return-type coverage.
Browser integration tests must also pass against the promoted artifact. The
source archive, patches, scripts and notices must be shipped alongside runtime
files; do not replace only the WASM.

The earlier VeriSim binaries identify the same Icarus revision in their README,
but their repository contains no corresponding static-loader patches or build
scripts. The source rebuild replaces those artifacts; merely attaching upstream
source to those modified binaries does not establish correspondence.

Current build verification: pending the first completed workflow run and local
artifact/browser validation. Do not represent this recipe alone as a verified
runtime build.

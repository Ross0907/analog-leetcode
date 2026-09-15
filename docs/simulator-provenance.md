# Browser simulator provenance and release verification

## Current build

AnaCode now carries a source-built `eecircuit-engine@1.8.0+anacode.1` package under `vendor/eecircuit-engine`. It retains the upstream EEcircuit public API and ngspice 45.2 numerical engine. The build removes unused model libraries and retains the exact CMOS90 benchmark data already used by the application.

**Status: source build, corresponding-source distribution and release checks verified on 2026-09-16.** The artifact manifest records `source-built-with-corresponding-source` with no pending checks. The deploy-only command `node scripts/audit-simulator-provenance.mjs --release` verifies this record and the exact installed runtime/source artifacts.

The source-build workflow completed successfully at [run 35021236427](https://github.com/Ross0907/analog-leetcode/actions/runs/35021236427), using workflow commit `4486962ffd3ce1b0fbda5db9d04a58c95709d3f8`. Its 18 numerical/pipeline tests passed, and the downloaded artifact passed the same tests locally. All 19 runtime and source-material files were checked against their recorded hashes before adoption.

During adoption, the local package version was changed from a prerelease suffix to build metadata, `1.8.0+anacode.1`, to preserve compatibility with the structural parser's `^1.7.0` optional peer range. The package metadata and corresponding packaging recipe hashes were refreshed; the compiled runtime, WebAssembly and model bytes are unchanged. This version identifies a local build of the existing upstream 1.8.0 API.

The installed-package audit passed after adoption: the lockfile selects the local package, all 19 runtime/source hashes match, the embedded WASM is valid and reports the expected banner, the complete mounted model inventory contains only CMOS90, and the engine runs the operating-point audit fixture. The complete npm dependency tree is valid with this build metadata version.

Final verification used a clean npm installation and passed the production build, 81 unit tests, 7 rendered tests and all 3 asset audits. The complete managed-browser suite passed 24 tests with a fresh local D1 database, including native and ngspice captures with more than four probes, actual AC/DC analysis, arbitrary node probes and all 24 native starter circuits. All 13 simulator source and notice files are present in `dist/client/simulator/` and match their manifest hashes. The dependency audit reported zero findings at this check.

## Exact inputs and output

| Item | Evidence |
|---|---|
| EEcircuit wrapper | Official upstream commit `f4dab6458d3865a1db9766008480690d23410c3a`; original source archive SHA-256 `d7f6929395845d2d5872e9211c3c488e40d27bb01c7d180d602bd1ba23a7d076`. |
| ngspice | Release 45.2 at source commit `724dc77b9153dc75eaec474b1f7a44f1fcf5f362`; exact source archive SHA-256 `c8ac1253c5812902d93cea421dbc0774007d631fa8762e626e056ee0da4af711`. |
| Compiler | Emscripten 5.0.4, official Linux/amd64 image digest `sha256:61aa4ca6e3dcdf0cfce9c3018767a0698bdc0f7ff72ca5982a0536c5caff93f7`; actual compiler, installed build-package inventory and configuration log accompany the release. |
| Compiled WASM | 6,132,643 bytes; SHA-256 `f4e0476e15eac8f03cbfd0a3278f71824720eb5b352f869a6d96959117c8dcf6`; banner `ngspice-45.2`, built `Tue Sep 15 20:43:49 UTC 2026`. |
| CMOS90 | 13,040 bytes; SHA-256 `c959237c2f549bc46912743226a2489d397a6cd89602c9511c309dd9680d817a`; only mounted model payload. |

The build uses the upstream HICUM2 removal and asynchronous command-loop integration, represented by checked-in patch/build scripts. It does not replace ngspice equations or device algorithms. Archive hashes are checked before extraction, and the final embedded WASM is compared with the compiled output. Current exact files and hashes are in [simulator-artifact-manifest.json](simulator-artifact-manifest.json); build instructions are in [simulator-source-build.md](simulator-source-build.md).

## Model correspondence

The official [BSIM4 4.8.1 benchmark archive](https://www.bsim.berkeley.edu/BSIM4/BSIM4_4.8.1_20170215.tar.gz), SHA-256 `1c76daa1edbcf9d929dc2a8c1c0597a42a6a4b2cb42e3a43c0c219b87846c607`, contains the original NMOS and PMOS benchmark cards. Preparation compares every normalized line with the application's model after applying only the original EEcircuit adaptations: N1/P1 renamed to N90/P90, whitespace normalization, and omission of the PMOS VERSION line. Those adaptations are documented in the corresponding wrapper source. The model parameters are unchanged from the previously tested package.

The [University of California BSIM use agreement](https://www.bsim.berkeley.edu/agreement-for-bsim-use/) permits modification and redistribution subject to its attribution, notice and charging conditions. The release preserves the source's copyright, author credits, conditions and disclaimer, and credits the University of California in its user-accessible notice. These are benchmark models, not a foundry PDK.

Unused PTM, FreePDK, SkyWater and GF180 imports, model mounts and model data are omitted from both the runtime and its corresponding wrapper source. In particular, the earlier unresolved redistribution evidence for the unused ASU PTM data no longer applies to the bytes in this source-built bundle.

## Source and notices delivered with the runtime

`public/simulator/NOTICE.html` accompanies the runtime and links to:

- The exact ngspice source archive, corresponding modified wrapper/model source and original BSIM benchmark archive.
- The checked-in preparation, patch, build and relinking scripts with locked npm inputs.
- Ngspice's complete license inventory and license texts, the EEcircuit MIT license, the BSIM conditions, and Emscripten/system-library notices.
- The actual compiler version, build-package inventory and ngspice configuration log.

Ngspice includes BSD code and LGPL components, including KLU and numparam. The source and scripts are supplied alongside the binary so recipients can modify and rebuild/relink the simulator. The root AnaCode MIT license does not supersede these component licenses. The release does not impose an additional restriction on modification for personal use or reverse engineering to debug such modifications.

These materials address the source and notice omissions in the earlier registry-only artifact. Bit-identical rebuilds and immutable compiler-image references are engineering assurances; they are not independent obligations imposed by BSD/MIT licenses. License conditions still apply to their respective components.

## Release checks

Ordinary artifact verification accepts a source-built candidate and checks the exact local-package installation, all runtime/source file hashes, embedded WASM validity and banner, and the complete model inventory. The deploy-only `--release` check additionally requires `source-built-with-corresponding-source` and an empty `sourceTrace.pendingChecks` array.

Each new runtime candidate must pass the installed artifact audit, production build, complete unit checks, and actual browser-worker/multi-probe tests before its verified state is recorded. Keep the source/notice assets with every hosted release. A successful numeric comparison alone is insufficient to complete this verification. The current record verifies this simulator distribution; it does not establish that a hosted environment has been configured or deployed.

The previous registry artifacts and their timestamp-derived source candidates are retained only as historical investigation in [simulator-registry-history.md](simulator-registry-history.md); they are not used to establish correspondence for the new source build.

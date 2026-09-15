# Source-built browser simulator

The `Build simulator from pinned source` workflow builds the existing EEcircuit wrapper and ngspice solver. It does not deploy. Its inputs are pinned in `scripts/simulator-build-inputs.json`: wrapper commit, ngspice release commit, original Berkeley BSIM benchmark archive, archive hashes, and an Emscripten image digest.

The preparation script verifies every source archive before extraction, applies EEcircuit's native HICUM2 removal and asynchronous command-loop integration, and removes unused model imports and mounts. It retains the application's exact CMOS90 bytes. Those bytes are checked against the official BSIM4 4.8.1 NMOS/PMOS benchmarks with the original wrapper's documented changes: whitespace normalization, N1/P1 renamed N90/P90, and the PMOS VERSION line omitted. Numerical models and wiring are provided by the upstream projects.

The source-build workflow runs on relevant pushes to `main` and supports manual dispatch. It uploads `simulator-source-build` containing:

- `vendor/eecircuit-engine`: the ESM runtime and public API declarations, packaged as `1.8.0+anacode.1`.
- `public/simulator`: ngspice and BSIM source archives, corresponding modified wrapper source, patch/build/relinking scripts, license notices, compiler/package inventory and configuration log.
- `docs/simulator-artifact-manifest.json`: exact output, model and source-material hashes, initially marked `source-built-pending-release-verification`.

The workflow runs the existing numerical fixtures against the rebuilt module through isolated module resolution. Installed-package audit, a production build, and browser-worker/multi-probe checks must then pass against the downloaded artifact before its release status changes. Only after those checks can the installed manifest use `source-built-with-corresponding-source` with an empty `sourceTrace.pendingChecks` array. `node scripts/audit-simulator-provenance.mjs --release` enforces that state and verifies the required files; ordinary artifact verification also accepts the pending state so the candidate can be tested.

The adopted `1.8.0+anacode.1` candidate completed these checks on 2026-09-16. The manifest records the successful clean installation, production build, 81 unit tests, 7 rendered tests, 3 asset audits and 24 managed-browser tests. All 13 corresponding-source and notice assets in the production client output match the recorded hashes. See [the provenance record](simulator-provenance.md) for exact evidence; every newly built candidate starts pending again.

To adopt a verified candidate, copy its three directory trees into the repository, install `eecircuit-engine` from `file:vendor/eecircuit-engine`, and commit the lockfile plus complete runtime/source files. Do not substitute a registry tarball for that local source build. The app's user-accessible simulator notice must link to `/simulator/NOTICE.html`.

For a local build, use Node 24, the locked npm dependencies and a Linux-capable Docker engine:

```sh
npm ci
node scripts/prepare-simulator-source.mjs
image=$(node -p "require('./scripts/simulator-build-inputs.json').buildImage")
docker run --rm --platform linux/amd64 --user root \
  --mount "type=bind,source=$PWD,target=/workspace" --workdir /workspace \
  "$image" bash scripts/build-ngspice-wasm.sh
node scripts/package-simulator-source.mjs
node --import tsx --import ./.tmp/simulator-rebuild/register.mjs --test \
  tests/circuit-pipeline.test.mts tests/practice-challenges.test.mts tests/simulator-results.test.mts
```

Recipients can change the prepared ngspice source after preparation and rerun compilation and packaging to rebuild/relink it. The BSD, LGPL, MIT and BSIM notices apply to their respective components. Source is supplied with the release; byte-for-byte reproduction and a particular container digest are build assurances, not substitutes for those license conditions. The source-built runtime and corresponding wrapper source omit the unused PTM, FreePDK, SkyWater and GF180 data.

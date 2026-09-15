# Browser simulator provenance and release gate

## Decision

**Status: STOP-SHIP for any external hosted deployment—public or access-controlled—or other redistribution of the current browser bundle.**

AnaCode currently imports `eecircuit-engine@1.7.0`. The package's JavaScript wrapper carries an MIT license, but its compiled distribution also contains an ngspice WebAssembly artifact and embedded model-card text. AnaCode now records and automatically verifies the exact installed wrapper and WebAssembly hashes, npm integrity, runtime banner, and narrowed source candidates in [`simulator-artifact-manifest.json`](simulator-artifact-manifest.json). The remaining gap is an immutable upstream record that maps those bytes to the exact corresponding ngspice source revision, patch set, complete toolchain/container inputs, and complete model source/license inventory.

Do not interpret this document as a finding that redistribution is impossible. It records that AnaCode does not yet have enough release-specific evidence to make a responsible hosted-deployment or redistribution decision. A private or access-controlled URL is not an exception because it still delivers the bundle to another browser. No hosted deployment was created for this snapshot. Local development does not satisfy or waive third-party obligations, and this document is not legal advice.

## Current evidence

| Item | What is known | What is missing |
|---|---|---|
| npm wrapper | `eecircuit-engine` is pinned to `1.7.0`; its installed top-level license identifies the wrapper as MIT. | A wrapper license does not establish the license or source provenance of every embedded binary/model artifact. |
| Numerical engine | Both installed JavaScript distributions contain the same 6,160,938-byte WebAssembly payload with SHA-256 `0cf0c69ff4428a5fbb4ada25b4fb35ec1e35c9d1bc00a2fa5e082ad18fa6a6fa`. Its runtime banner reports `ngspice-45.2+`, built `Tue Mar 24 02:02:56 UTC 2026`. | A cryptographically bound exact ngspice commit, complete applied patch set, configuration, compiler/toolchain digests, and reproducible source-to-byte mapping. |
| Upstream build process | npm records wrapper Git head `0ef17a488b2540efe5b48f7dd4c45b8ae6f1b910`. Timestamp correlation narrows the likely ngspice tree to `2d3e032a3f0ad0fde15bdec1836a8b9072c75df5` (`ngspice-45.2-149-g2d3e032a3`) and emsdk to `56a2c6e3681497b04edfd0a7972e6d435b266114` / Emscripten `5.0.4`. | The upstream recipe cloned mutable default branches, used `emsdk install latest`, and started from `ubuntu:latest`; timestamp correlation is not proof that those candidates produced the shipped bytes, and the container/apt inputs are not pinned. |
| ngspice licensing | The official ngspice `COPYING` file documents multiple code origins and license families within the distribution. | A component-by-component inventory for the exact configuration embedded here, plus confirmation of the notices, source availability, and any relinking or other obligations that apply to this release. |
| CMOS model | AnaCode allowlists only `modelcard.CMOS90`, whose `N90`/`P90` entries are described as generic BSIM4 test models rather than a real process design kit. | Immutable source, authorship/provenance, modification history, and the applicable redistribution terms for the exact embedded text. |
| Other embedded models | The package bundle contains model-card strings beyond the single name AnaCode allows at runtime. | A complete inventory and terms for all bytes shipped to the browser; runtime allowlisting does not remove unused material from the distributed bundle. |

Primary upstream references:

- [EEcircuit engine repository](https://github.com/eelab-dev/EEcircuit-engine)
- [EEcircuit browser-engine build recipe](https://github.com/eelab-dev/EEcircuit-engine/blob/main/Docker/run.sh)
- [Official ngspice `COPYING`](https://github.com/ngspice/ngspice/blob/master/COPYING)
- [ngspice developer licensing summary](https://ngspice.sourceforge.io/devel.html)

These links are discovery evidence only. Mutable pages must not replace archived source, hashes, and license texts for the exact release artifact.

`npm run audit:simulator` verifies the local package version/integrity, installed file sizes and hashes, identical embedded WebAssembly hashes, module validity, and the live version/build banner. It deliberately prints that this is drift detection rather than redistribution clearance.

## Acceptable ways to clear the gate

Choose one of these paths and retain the completed evidence with the release:

### 1. Establish provenance for the existing artifact

Obtain and independently verify an upstream release record that identifies the exact ngspice source commit, every patch, build configuration, toolchain/container digest, and every embedded model source used for `eecircuit-engine@1.7.0`. Rebuild where practical and compare deterministic artifact hashes, or document and explain every reproducibility difference. Complete a release-specific license inventory and satisfy all required notices, source-access, offer, relinking, attribution, and model terms after qualified review.

### 2. Replace or rebuild the browser engine

Build from an explicitly selected immutable ngspice source commit with a repository-owned patch set and pinned toolchain, or adopt another simulator distribution that already provides complete verifiable provenance. Include only audited models with explicit terms. Record source and output hashes, preserve all applicable notices, provide corresponding source or other materials where required, generate an SBOM, and rerun functional, numerical, performance, and security tests before changing the stop-ship decision.

Merely copying a generic ngspice license file, pointing to a mutable upstream branch, reporting a runtime version string, or adding a source URL without proving correspondence to the shipped bytes does not clear the gate.

## Release evidence checklist

All boxes must be supported by reviewable artifacts for the exact production build:

- [ ] Hash and archive the exact npm tarball or replacement simulator input.
- [ ] Hash the emitted WebAssembly, JavaScript glue, worker bundle, and every embedded model payload.
- [ ] Record the exact simulator source commit and archive its complete corresponding source tree.
- [ ] Record every local/upstream patch and the order in which it was applied.
- [ ] Pin the build image, Emscripten/compiler, linker, flags, configuration, and dependency versions by digest.
- [ ] Inventory every compiled-in subsystem and determine its applicable license from the exact source tree.
- [ ] Inventory every distributed model card, including material that AnaCode does not expose through its runtime allowlist.
- [ ] Preserve required copyright notices and license texts in both the release artifact and a durable source location.
- [ ] Provide source, build scripts, object/relinking material, or an offer where the reviewed obligations require them.
- [ ] Generate and retain an SBOM tying the dependency, simulator, and model hashes to the AnaCode release.
- [ ] Complete qualified license/compliance review and record the approver, date, scope, and decision.
- [ ] Rerun AnaCode's circuit fixtures, numerical comparisons, malicious-input tests, worker timeout tests, production build, and browser QA against the final artifact.
- [ ] Add a user-accessible third-party notice/source location and verify it is present in the deployed output.
- [ ] Change this document's status only in a reviewed release commit that references the evidence above.

No generic notice or source offer is currently placed under `public/licenses/`: without the exact corresponding source and complete model inventory, such a file could falsely imply compliance. `THIRD_PARTY_NOTICES.md` and this gate must ship with any internal release review materials until the gate is resolved.

## Separate concerns

- The future authoritative native ngspice service needs its own source, binary, model, sandbox, and license record. It does not automatically resolve the browser artifact.
- Security isolation and license compliance are independent. A sandboxed artifact can still have incomplete provenance; a properly licensed artifact can still be unsafe to run on hostile input.
- Analog Canvas is an aesthetic and interaction reference only. AnaCode does not bundle, frame, or execute its code or assets, so it is not part of this simulator provenance decision.

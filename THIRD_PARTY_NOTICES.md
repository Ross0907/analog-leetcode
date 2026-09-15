# Third-party notices

This document summarizes direct runtime packages and externally referenced projects in the AnaCode snapshot. It is not a substitute for the complete license texts shipped by each dependency. `package-lock.json` is the authoritative inventory of installed npm packages; a redistribution should generate an SBOM, preserve applicable copyright/license files, and review all transitive dependencies for the exact release artifact.

## Bundled runtime dependencies

| Component | Pinned version | License | Upstream |
|---|---:|---|---|
| `@xyflow/react` | 12.11.6 | MIT | [xyflow/xyflow](https://github.com/xyflow/xyflow) |
| `@tisoap/react-flow-smart-edge` | 5.0.0 | MIT | [Tisoap/react-flow-smart-edge](https://github.com/Tisoap/react-flow-smart-edge) |
| `@spice-ts/core` | 0.3.0 | MIT | [mfiumara/spice-ts](https://github.com/mfiumara/spice-ts) |
| `eecircuit-engine` | 1.7.0 | MIT package wrapper; embedded artifacts require the review below | [eelab-dev/EEcircuit-engine](https://github.com/eelab-dev/EEcircuit-engine) |
| `react` / `react-dom` | 19.2.8 | MIT | [facebook/react](https://github.com/facebook/react) |
| `drizzle-orm` | 0.45.2 | Apache-2.0 | [drizzle-team/drizzle-orm](https://github.com/drizzle-team/drizzle-orm) |
| `lucide-react` | 1.34.0 | ISC | [lucide-icons/lucide](https://github.com/lucide-icons/lucide) |
| `zod` | 4.4.3 | MIT | [colinhacks/zod](https://github.com/colinhacks/zod) |
| `vinext` | 1.0.0-beta.8 | MIT | [cloudflare/vinext](https://github.com/cloudflare/vinext) |

The UI uses Geist and Geist Mono through framework font tooling. Geist is distributed under the SIL Open Font License 1.1; see [vercel/geist-font](https://github.com/vercel/geist-font).

Build, lint, test, TypeScript, Vite, Drizzle Kit, Wrangler, Cloudflare type/plugin, Tailwind, and ESLint packages are development dependencies. Their licenses and transitive dependencies are recorded in the lockfile and installed package metadata; they still require review when build tooling is redistributed.

## Analog Canvas — reference only

AnaCode's About page attributes the hosted [Analog Canvas editor](https://analog-canvas.tokenzhang.com/editor) as a visual reference. The reviewed source was [commit `e34a33904549840ba054fd739df03ce352aa9643`](https://github.com/cascode-ai/analog-canvas/tree/e34a33904549840ba054fd739df03ce352aa9643), licensed [AGPL-3.0-only](https://github.com/cascode-ai/analog-canvas/blob/e34a33904549840ba054fd739df03ce352aa9643/LICENSE.md).

No Analog Canvas JavaScript, source, schema, SVG, or other asset is copied, bundled, framed, or executed by AnaCode. The external link does not turn Analog Canvas into a dependency of this repository. If a fork is incorporated later, its AGPL license—including the network Corresponding Source requirement for a modified hosted version—must be satisfied, or a separate license must be obtained. This notice is not legal advice.

## Browser ngspice and bundled model cards

`eecircuit-engine@1.7.0` is the numerical browser-preview engine. Its installed npm distribution contains a top-level MIT `LICENSE` for the EEcircuit engine package, and its compiled distribution bundle embeds an ngspice WebAssembly build plus several model-card strings. AnaCode currently permits only the package's `modelcard.CMOS90` include. That card defines generic `N90` and `P90` BSIM4 benchmark models and explicitly states that it was not extracted from a real technology; it must not be presented as a foundry PDK or silicon-signoff model.

**Hosted-deployment status: STOP-SHIP.** The installed npm tarball does not expose a complete separate license/provenance inventory for every embedded ngspice and model-card artifact. The wrapper's MIT license must not be assumed to relicense those materials. The exact corresponding ngspice source revision, upstream/local patches, compiler/toolchain inputs, and each embedded model's source and license have not been tied immutably to the installed WebAssembly artifact. AnaCode therefore must not deploy the current bundle to an external hosted environment, whether public or access-controlled, or otherwise redistribute it until that evidence and all applicable notice/source obligations are complete, or until the artifact is replaced by a reproducibly built alternative with complete provenance. No hosted deployment was created for this snapshot.

The exact installed wrapper and embedded WebAssembly hashes, npm integrity, runtime version/build banner, and timestamp-correlated source candidates are recorded in [docs/simulator-artifact-manifest.json](docs/simulator-artifact-manifest.json) and verified by `npm run audit:simulator`. The upstream EEcircuit build recipe still cloned mutable `ngspice-sf-mirror` and emsdk default branches, installed the mutable `latest` toolchain alias, and used `ubuntu:latest`; the recorded candidates therefore narrow the investigation but do not prove source correspondence. ngspice is not covered by a single simple license label, and model libraries may have independent terms. See the upstream [EEcircuit build recipe](https://github.com/eelab-dev/EEcircuit-engine/blob/main/Docker/run.sh), official ngspice [`COPYING`](https://github.com/ngspice/ngspice/blob/master/COPYING), and [ngspice developer licensing summary](https://ngspice.sourceforge.io/devel.html). Release-specific obligations must be determined from the exact source tree and build actually used, not from mutable default branches.

The evidence checklist and acceptable resolution paths are maintained in [docs/simulator-provenance.md](docs/simulator-provenance.md). No generic ngspice license file or source offer is placed in `public/` yet because doing so without the exact corresponding source and full model inventory could falsely imply that the gate was satisfied. This notice is an engineering release control, not legal advice.

The planned authoritative simulator is a separately sandboxed, pinned **native ngspice 47** service. That service, its native binary, queue, and sandbox are roadmap items and are not included here. It must receive its own release-specific binary/model license inventory before deployment. Building it later does not cure incomplete provenance for a browser artifact that is still publicly shipped.

## AnaCode project code

There is currently no root `LICENSE` file. Accordingly, this notice does not grant permission to copy, modify, or redistribute AnaCode's own source. A repository-wide license should be selected explicitly before outside distribution or contribution.

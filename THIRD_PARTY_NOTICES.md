# Third-party notices

AnaCode includes or references open-source software from multiple projects. The root [MIT License](LICENSE) covers AnaCode-authored material for which the project owns the necessary rights; it does not relicense third-party software, embedded simulator artifacts, fonts, models, or externally referenced projects.

`package-lock.json` is the versioned inventory of installed npm packages for this snapshot.

## Direct runtime dependencies

The primary schematic editor and live solver are the self-hosted [CircuitJS1](https://github.com/pfalstad/circuitjs1) build pinned at `5bdb1296ce6a82f79515f4f1dd1b9a86e03236f7`, licensed GPL-2.0-or-later. Its complete upstream source, GPL integration patch, build script, license texts and compiled-asset inventory are distributed in `public/circuitjs/` and linked from its `NOTICE.html`. The root MIT license does not apply to that distribution. The JavaScript adapter exposes existing native solver and editor state; it does not replace the upstream electrical implementation.

| Component | Pinned version | License / status | Upstream |
|---|---:|---|---|
| `@xyflow/react` | 12.11.6 | MIT | [xyflow/xyflow](https://github.com/xyflow/xyflow) |
| `@tisoap/react-flow-smart-edge` | 5.0.0 | MIT | [Tisoap/react-flow-smart-edge](https://github.com/Tisoap/react-flow-smart-edge) |
| `@spice-ts/core` | 0.3.0 | MIT | [mfiumara/spice-ts](https://github.com/mfiumara/spice-ts) |
| `eecircuit-engine` | 1.7.0 | MIT package wrapper; embedded artifacts have separate provenance considerations | [eelab-dev/EEcircuit-engine](https://github.com/eelab-dev/EEcircuit-engine) |
| `react` / `react-dom` | 19.2.8 | MIT | [facebook/react](https://github.com/facebook/react) |
| `drizzle-orm` | 0.45.2 | Apache-2.0 | [drizzle-team/drizzle-orm](https://github.com/drizzle-team/drizzle-orm) |
| `lucide-react` | 1.34.0 | ISC | [lucide-icons/lucide](https://github.com/lucide-icons/lucide) |
| `zod` | 4.4.3 | MIT | [colinhacks/zod](https://github.com/colinhacks/zod) |
| `vinext` | 1.0.0-beta.8 | MIT | [cloudflare/vinext](https://github.com/cloudflare/vinext) |
| `@supabase/ssr` | 0.12.7 | MIT | [supabase/ssr](https://github.com/supabase/ssr) |
| `@supabase/supabase-js` | 2.116.0 | MIT | [supabase/supabase-js](https://github.com/supabase/supabase-js) |
| `fft.js` | 4.0.4 | MIT | [indutny/fft.js](https://github.com/indutny/fft.js) |

The UI uses Geist and Geist Mono through framework font tooling. Geist is distributed under the SIL Open Font License 1.1; upstream information is available from [vercel/geist-font](https://github.com/vercel/geist-font).

Build, test, lint, TypeScript, Vite, Wrangler, Cloudflare, Drizzle Kit, Tailwind, and related packages are development dependencies. Their exact versions and transitive dependency graph are recorded in `package-lock.json`.

## EEcircuit Engine and ngspice

AnaCode uses `eecircuit-engine@1.7.0` as the browser numerical simulator wrapper. Its installed npm distribution contains a top-level MIT license for the EEcircuit Engine package and also contains a compiled ngspice WebAssembly payload plus bundled model-card text.

AnaCode currently exposes only the package's `modelcard.CMOS90` include. Its `N90` and `P90` BSIM4 entries are generic benchmark models rather than a foundry PDK or silicon-signoff model.

The exact installed wrapper and WebAssembly hashes, npm integrity, runtime banner, and source-candidate investigation are recorded in [docs/simulator-artifact-manifest.json](docs/simulator-artifact-manifest.json). The corresponding release-provenance analysis is maintained in [docs/simulator-provenance.md](docs/simulator-provenance.md).

The wrapper's MIT license does not by itself establish the license or exact-source correspondence of every embedded ngspice/model artifact. The current provenance record therefore remains separate from the root AnaCode MIT license.

Relevant upstream references include:

- [EEcircuit Engine](https://github.com/eelab-dev/EEcircuit-engine)
- [EEcircuit browser-engine build recipe](https://github.com/eelab-dev/EEcircuit-engine/blob/main/Docker/run.sh)
- [ngspice project](https://ngspice.sourceforge.io/)
- [ngspice COPYING](https://github.com/ngspice/ngspice/blob/master/COPYING)
- [ngspice developer licensing summary](https://ngspice.sourceforge.io/devel.html)

## Analog Canvas reference

AnaCode acknowledges [Analog Canvas](https://analog-canvas.tokenzhang.com/editor) as a visual and interaction reference. The reviewed source snapshot was commit [`e34a33904549840ba054fd739df03ce352aa9643`](https://github.com/cascode-ai/analog-canvas/tree/e34a33904549840ba054fd739df03ce352aa9643), licensed AGPL-3.0-only.

AnaCode does not copy, bundle, frame, or execute Analog Canvas JavaScript, source code, schema, SVG assets, or hosted application. The external reference does not make Analog Canvas a runtime dependency of this repository.

## AnaCode project code

AnaCode-authored source code is licensed under the repository's root [MIT License](LICENSE), subject to the exclusions described there for third-party material.

Copyright and license notices associated with third-party dependencies remain the property and responsibility of their respective authors and licensors.

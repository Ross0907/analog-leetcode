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
| `eecircuit-engine` | 1.8.0+anacode.1 | MIT wrapper; ngspice BSD/LGPL and Berkeley BSIM conditions apply to embedded components | [eelab-dev/EEcircuit-engine](https://github.com/eelab-dev/EEcircuit-engine) |
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

AnaCode installs `eecircuit-engine@1.8.0+anacode.1` from `vendor/eecircuit-engine`. This local package retains the upstream 1.8.0 API and builds ngspice 45.2 from pinned source with the upstream browser integration. The version's build metadata identifies this local build; it is not a separately published upstream release.

The sole bundled model library is `modelcard.CMOS90`. Its `N90` and `P90` entries correspond to the University of California BSIM4 4.8.1 benchmark cards, with the original wrapper's documented naming and formatting adaptations. They are generic benchmark models rather than a foundry PDK or silicon-signoff model. Unused model libraries from the registry package are omitted.

Exact runtime, WebAssembly, model and corresponding-source hashes are recorded in [docs/simulator-artifact-manifest.json](docs/simulator-artifact-manifest.json). The source-build evidence and release checks are maintained in [docs/simulator-provenance.md](docs/simulator-provenance.md).

The wrapper's MIT license is separate from ngspice's BSD and LGPL components, including KLU and numparam, and the Berkeley BSIM conditions. Complete license texts, source archives, modifications, build/relinking instructions and compiler records are distributed in [public/simulator/NOTICE.html](public/simulator/NOTICE.html), served at `/simulator/NOTICE.html`. Keep those materials with every hosted runtime. The root AnaCode MIT license does not supersede their conditions or restrict modification and debugging of the LGPL components.

Relevant upstream references include:

- [EEcircuit Engine](https://github.com/eelab-dev/EEcircuit-engine)
- [EEcircuit browser-engine build recipe](https://github.com/eelab-dev/EEcircuit-engine/blob/main/Docker/run.sh)
- [ngspice project](https://ngspice.sourceforge.io/)
- [ngspice COPYING](https://github.com/ngspice/ngspice/blob/master/COPYING)
- [ngspice developer licensing summary](https://ngspice.sourceforge.io/devel.html)

## KiCad symbol artwork

AnaCode includes 21 symbol graphics exported with the official KiCad 9.0.9 CLI from [KiCad Libraries](https://gitlab.com/kicad/libraries/kicad-symbols), release 9.0.9, commit `ad36cd14bcd1b1cd0484f629ccdd3481366f74f3`. Attribution belongs to the KiCad community. The redistributed source collection and derived SVGs retain **CC-BY-SA 4.0 with the KiCad library exception**; see [public/kicad/LICENSE.md](public/kicad/LICENSE.md). The root MIT license does not relicense these assets.

The display variants hide reference/value fields and non-semantic pin labels; a temporary coordinate marker is removed after native export and SVG title timestamps are normalized. Original exports, unmodified library inputs, per-file hashes and pin coordinates accompany the collection. [KiCad credits](public/kicad/NOTICE.html), served at `/kicad/NOTICE.html`, links all 21 symbols and their sources. [docs/kicad-symbols.md](docs/kicad-symbols.md) records the reproducible export and verification evidence.

These assets supply presentation only. The `Amplifier_Operational:LM2904` unit-1 graphic does not make the simulated amplifier an LM2904 model, and the symbol artwork does not replace CircuitJS's solver or component models.

## Analog Canvas reference

AnaCode acknowledges [Analog Canvas](https://analog-canvas.tokenzhang.com/editor) as a visual and interaction reference. The reviewed source snapshot was commit [`e34a33904549840ba054fd739df03ce352aa9643`](https://github.com/cascode-ai/analog-canvas/tree/e34a33904549840ba054fd739df03ce352aa9643), licensed AGPL-3.0-only.

AnaCode does not copy, bundle, frame, or execute Analog Canvas JavaScript, source code, schema, SVG assets, or hosted application. The external reference does not make Analog Canvas a runtime dependency of this repository.

## AnaCode project code

AnaCode-authored source code is licensed under the repository's root [MIT License](LICENSE), subject to the exclusions described there for third-party material.

Copyright and license notices associated with third-party dependencies remain the property and responsibility of their respective authors and licensors.

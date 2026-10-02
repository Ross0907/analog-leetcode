# AnaCode

[Open the application](https://anacode.ross0907.workers.dev) · [Project showcase](https://ross0907.github.io/analog-leetcode/)

AnaCode is a browser circuit workbench and electronics practice library. Draw circuits, probe their nodes, compare waveforms, and write Verilog or SystemVerilog in the HDL workspace.

## Circuit workbench

The primary editor and live solver are **CircuitJS1**, built from pinned upstream source and served with the application. CircuitJS provides the components, wiring, electrical graph, undo, viewport and file format. Common symbols and the quick palette use pinned **Analog Canvas** definitions from the supplied reference project, with official **KiCad** artwork for the remaining supported symbols. Both map to the native terminals. AnaCode connects its instruments through the native JavaScript API.

- Voltage probes on every electrical node, including ground and unlabeled junctions.
- Current probes on supported two-terminal components; up to 32 simultaneous probes.
- Names, colors, visibility, removal, schematic markers, local save and native import/export.
- Continuous live capture and one-shot acquisition, with up to 131,072 samples and a bounded ring buffer.
- One workspace for the schematic, SPICE, grading, scope, FFT and logic traces; use tabs, side-by-side or stacked scrolling layouts.
- Connected component movement, one-click wire junctions, W crosshair wiring and inline numeric value editing.
- Independent schematic paper/light mode, matching instrument light/dark themes, and uniformly scaled source-derived symbols.
- Adjustable description, schematic, instrument and probe panes; waveform displays stay beside the drawing.
- Short component leads in bundled starters, probe-shaped markers that scale with the native viewport, and outside-click dismissal of editors.
- Oscilloscope scaling, horizontal zoom/pan, triggering, X/Y cursors and measurements.
- FFT channel/window selection, linear/log frequency, linear/dB magnitude, DC removal, span and markers.
- Distortion metrics only when sample quality and coherent capture support them.
- Neutral schematic drawings by default, without voltage colouring or moving current dots.
- Normal scrolling over the editor; Ctrl/Cmd + scroll zooms the circuit. Mobile pages keep descriptions and instruments reachable.

The integrated **ngspice WebAssembly** panel provides operating point, DC sweep, AC magnitude/phase and transient analysis in a Web Worker. Probe expressions select any voltage node or current vector actually exported by ngspice.

CircuitJS and ngspice use different device models. Current-schematic SPICE supports passive networks, bounded ideal op-amps, selectable LM741 and transistor/diode models, and DC, sine, PWL and bitstream sources. AC sweeps select the excitation, spacing, point count and phase. Native source edits remain the source of truth. Graded exercises convert the current graph through the validated grading document. Unsupported native devices produce an explicit explanation.

## Practice and accounts

The analog library contains **38 problems**, including converter foundations, two parts-only wiring exercises, and six new expert designs covering residue amplification, DAC settling, SAR timing, reconstruction filtering, TIA compensation and flash threshold calibration. Prerequisite exercises can supply reusable native circuit blocks for later designs. Expert targets are measured from real ngspice results as local practice feedback; supported fixed-topology exercises use the separate server judge.

Problem descriptions support expanded, compact and hidden modes. Search, difficulty/domain/progress filters, adjacent navigation and random selection help navigate the library. Worked-answer completion is stored on the current device. Five supported fixed-topology exercises save verified progress to Cloudflare D1 when signed in.

**Supabase Auth** provides email/password signup, email confirmation, sign-in, sign-out, password recovery and persistent server-verified sessions. Without a configured project, sign-in is clearly unavailable; simulation remains usable.

## HDL workspace

The separate `/hdl` section includes six original coding exercises and an editable playground: multiplexing, saturating arithmetic, enabled counters, flash ADC encoding, PWM DACs and SAR control. **Icarus Verilog** compiles and simulates Verilog 2005 and its supported SystemVerilog 2012 subset in a terminable Web Worker. **CodeMirror** provides source editing and **VCDrom** displays the real VCD output, including multi-bit signals. Console and waveforms support tabs, split and stacked layouts.

Drafts stay in the browser. Run uses the editable testbench; Check solution uses the supplied exercise checks. HDL practice checks are local feedback, not server-verified scores. Download the source/testbench project to continue with Icarus, Yosys and GTKWave in **OSS CAD Suite**. See [HDL integration](docs/hdl-workspace.md) for runtime limits, provenance and supported language features.

## Development and checks

Requires Node 24.15.0 or newer in the Node 24 release line and npm 12.0.2. CI uses Node 24 and the pinned npm version. Node 22.22.2 or newer in the Node 22 release line and Node 26+ are also accepted by the package engine constraint.

```sh
npm ci
npm run dev
```

Open [localhost:3000](http://localhost:3000). Configure login using [the Supabase guide](docs/supabase.md). Never configure the app with a service-role key.

```sh
npm run lint
npm run typecheck
npm ls --all
npm audit --audit-level=high
npm run test:unit
npm test
npx playwright install chromium
npm run test:e2e
npm run build
```

The test suite covers actual ngspice calculations, native CircuitJS imports/editing, probe acquisition, waveform analysis, grading, problem navigation and authentication. SDK tests emulate Supabase HTTP responses; validating real account creation and mail delivery requires a configured project and inbox.

Browser tests start an isolated local server, initialize its own D1 database with the checked-in migrations, and generate a temporary test rate-limit key. They do not need production credentials. When testing an existing preview, set `ANACODE_E2E_EXTERNAL_SERVER=1` to prevent another server from starting; that preview must have its own local database and rate-limit configuration.

## Hosting

Cloudflare Workers serves the complete application; GitHub Pages publishes the static showcase. Vite emits `dist/server/wrangler.json` and client assets, including same-origin CircuitJS files. See [deployment setup and release checks](docs/deployment.md) for GitHub settings, Worker secrets, database initialization and rollback.

D1 uses the `DB` binding. Supply `D1_DATABASE_ID` and `D1_DATABASE_NAME` at build time. Initialize a **new** database using the SQL migrations in `drizzle/`; existing databases retain their schema and data. Configure Worker secrets `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` and `RATE_LIMIT_HMAC_SECRET` (at least 32 bytes). Supabase redirect URLs and email setup are documented in [docs/supabase.md](docs/supabase.md).

Build output, caches, local credentials and test captures are excluded from source control.

## Documentation

- [Architecture and file formats](docs/architecture.md)
- [CircuitJS integration and reproducible build](docs/circuitjs-integration.md)
- [Official KiCad symbols, pins and provenance](docs/kicad-symbols.md)
- [Analog Canvas reference symbols and provenance](docs/analog-canvas-symbols.md)
- [Waveform measurements and FFT](docs/waveform-instruments.md)
- [HDL tools, exercises and waveform viewer](docs/hdl-workspace.md)
- [Supabase authentication](docs/supabase.md)
- [Challenge audit and authoring](docs/challenge-audit.md)
- [Simulator provenance](docs/simulator-provenance.md)
- [Security](SECURITY.md) and [third-party notices](THIRD_PARTY_NOTICES.md)

## Licensing and credits

The root [MIT license](LICENSE) covers AnaCode-authored material for which the project owns the necessary rights. Third-party software, artwork, simulator artifacts, fonts and device models retain their own terms. CircuitJS1 and its integration patches are GPL-2.0-or-later; complete pinned source and build scripts are distributed under `public/circuitjs/`. The 15 redistributed Analog Canvas definitions and their presentation adapter retain AGPL-3.0-only, with source and license in `public/analog-canvas/`. KiCad fallback artwork retains CC-BY-SA 4.0 with the KiCad library exception. Published SPICE models retain their original notices in `public/spice-models/`, including the National Semiconductor LM741 distribution terms. The root MIT license does not relicense any of these materials.

Thanks to Paul Falstad, Iain Sharp and the CircuitJS community; the Analog Canvas and KiCad contributors; ngspice and its model collection; National Semiconductor and Texas Instruments; EEcircuit Engine; spice-ts; Supabase; fft.js; React; Vinext; Vite; Drizzle; and contributors to the retained legacy schematic importer. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for source links, model adaptations and attribution.

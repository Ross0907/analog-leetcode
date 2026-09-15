# AnaCode

[Open the application](https://anacode.ross0907.workers.dev) · [Project showcase](https://ross0907.github.io/analog-leetcode/)

AnaCode is a browser circuit workbench and analog electronics practice library. Draw a circuit, probe its nodes, compare waveforms, and check your calculations.

## Circuit workbench

The primary editor and live solver are **CircuitJS1**, built from pinned upstream source and served with the application. CircuitJS provides the components, symbols, wiring, electrical graph, undo, viewport and file format. AnaCode connects a probe panel and waveform viewer through its native JavaScript API.

- Voltage probes on every electrical node, including ground and unlabeled junctions.
- Current probes on supported two-terminal components; up to 32 simultaneous probes.
- Names, colors, visibility, removal, schematic markers, local save and native import/export.
- Transient capture with adjustable duration and sample target.
- Oscilloscope scaling, horizontal zoom/pan, triggering, X/Y cursors and measurements.
- FFT channel/window selection, linear/log frequency, linear/dB magnitude, DC removal, span and markers.
- Distortion metrics only when sample quality and coherent capture support them.

The separate **ngspice WebAssembly** workspace provides operating point, DC sweep, AC magnitude/phase and transient analysis in a Web Worker. Probe expressions select any voltage node or current vector actually exported by ngspice.

CircuitJS and ngspice use different device models. Advanced transistor exercises identify the SPICE deck specifying their model. For the three graded exercises, **Prepare SPICE & grading** converts the current native circuit into the existing validated grading document and generates a matching deck.

## Practice and accounts

The library contains **24 problems**: nine original exercises and 15 new worked problems covering loading, current division, Thevenin sources, RC/RL transients, filters, feedback, summing, differential amplifiers, capacitive division, buffering and a passive DAC. Every new numerical answer is checked against actual ngspice output.

Problem descriptions support expanded, compact and hidden modes. Search, difficulty/domain/progress filters, adjacent navigation and random selection help navigate the library. Worked-answer completion is stored on the current device. The three fixed-topology design graders save verified progress to Cloudflare D1 when signed in.

**Supabase Auth** provides email/password signup, email confirmation, sign-in, sign-out, password recovery and persistent server-verified sessions. Without a configured project, sign-in is clearly unavailable; simulation remains usable.

## Development and checks

Requires Node 24 and npm. CI uses npm 12.0.2.

```sh
npm ci
npm run dev
```

Open [localhost:3000](http://localhost:3000). Configure login using [the Supabase guide](docs/supabase.md). Never configure the app with a service-role key.

```sh
npm run lint
npm run typecheck
npm run test:unit
npm test
npx playwright install chromium
npm run test:e2e
npm run build
```

The test suite covers actual ngspice calculations, native CircuitJS imports/editing, probe acquisition, waveform analysis, grading, problem navigation and authentication. SDK tests emulate Supabase HTTP responses; validating real account creation and mail delivery requires a configured project and inbox.

When testing an existing preview, set `ANACODE_E2E_EXTERNAL_SERVER=1` to prevent another server from starting. CI starts its own server.

## Hosting

The existing GitHub workflows remain in place: Cloudflare Workers serves the complete application; GitHub Pages publishes the static showcase. Vite emits `dist/server/wrangler.json` and client assets, including same-origin CircuitJS files.

D1 uses the `DB` binding. Supply `D1_DATABASE_ID` and `D1_DATABASE_NAME` at build time. Initialize a **new** database using the SQL migrations in `drizzle/`; existing databases retain their schema and data. Configure Worker secrets `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` and `RATE_LIMIT_HMAC_SECRET` (at least 32 bytes). Supabase redirect URLs and email setup are documented in [docs/supabase.md](docs/supabase.md).

Build output, caches, local credentials and test captures are excluded from source control.

## Documentation

- [Architecture and file formats](docs/architecture.md)
- [CircuitJS integration and reproducible build](docs/circuitjs-integration.md)
- [Waveform measurements and FFT](docs/waveform-instruments.md)
- [Supabase authentication](docs/supabase.md)
- [Challenge audit and authoring](docs/challenge-audit.md)
- [Simulator provenance](docs/simulator-provenance.md)
- [Security](SECURITY.md) and [third-party notices](THIRD_PARTY_NOTICES.md)

## Licensing and credits

AnaCode application code uses the [MIT license](LICENSE). CircuitJS1 is GPL-2.0-or-later and retains its own license. The complete pinned source, GPL integration patch and build script are distributed under `public/circuitjs/` and linked from the workbench.

Thanks to Paul Falstad, Iain Sharp and the CircuitJS community; ngspice; EEcircuit Engine; spice-ts; Supabase; fft.js; React; Vinext; Vite; Drizzle; and contributors to the retained legacy schematic importer. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for attribution.

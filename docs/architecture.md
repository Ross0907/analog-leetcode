# Architecture

## Editor and simulation

The primary editor is a pinned, self-hosted build of [CircuitJS1](https://github.com/pfalstad/circuitjs1). Its native components, wires, junctions, coordinate grid, hit testing, symbol renderer, undo history and solver remain upstream implementations. AnaCode does not implement a replacement schematic backend.

`CircuitJsWorkbench` loads `/circuitjs/circuitjs.html` in a same-origin iframe. The native JavaScript API exposes circuit import/export, elements and accepted solver timesteps. A small GPL patch exposes existing native node IDs, terminal coordinates, element serialization, hovered element and viewport projection. The source archive, patch and build script are downloadable from the editor's license page.

```text
CircuitJS native document → native editor and solver → accepted timestep samples
                                      ↓                         ↓
                              native node/element probes → ScopeResult → FFT/measurements
                                      ↓
                    narrow adapter for three graded circuits
                                      ↓
                       existing CircuitDocument / CircuitIR
                                      ↓
                          generated ngspice deck + grade API
```

The separate SPICE workspace uses `eecircuit-engine` with the existing ngspice-WASM artifact and `@spice-ts/core` structural preflight. It runs in a fresh bounded Web Worker for each execution. The worker validates the input and probe list, inserts a required SPICE title line, runs the solver, and normalizes real or complex vectors. Unsupported or missing requested vectors produce errors instead of substituted traces.

Supported SPICE analyses are operating point, DC sweep, AC sweep and transient. Results are actual ngspice vectors. Source-branch current is supported when present in the solver output. AC magnitude is 20 log10 of the complex voltage magnitude; it is not automatically a transfer-function ratio unless the input is a unit AC source. The TIA exercise explicitly divides output by its specified current amplitude.

CircuitJS and ngspice have different device models. Educational native transistor models do not claim equivalence to the ngspice CMOS90 BSIM models. Expert SPICE decks are independent unless explicitly generated from a supported grading snapshot.

## Native documents and probe identity

CircuitJS owns its native XML and legacy text formats. Exported circuit files are usable in the upstream editor. AnaCode accepts either format with a byte/line limit and rejects unrelated files. Native local saves also retain app probe metadata. Existing legacy AnaCode documents and graph utilities remain covered by compatibility unit tests; the custom canvas is no longer the primary editor.

A voltage probe references an actual native element terminal and its solver node ID. It therefore measures the entire connected net regardless of whether that net has a visible label. A current probe references a supported native two-terminal element. Native node IDs determine association; SVG line overlap is never used by the adapter.

Each probe has an identity, name, color and enabled state. Up to 32 probes may be present. Deleted native elements invalidate their probes. Schematic markers use the native viewport projection, and matching trace colors pass through to the shared viewer.

Capture subscribes to accepted native timesteps, preserves adaptive sample times, stops at the requested duration or bounded sample limit, and pauses the circuit. Graph changes or reset during capture cancel the record. FFT resamples only according to the documented quality checks; it does not fabricate missing oscillations.

## Waveform analysis

`SimulationPayload` carries the engine, analysis, x axis, traces, units, operating-point entries and warnings. `ScopeResult` separates incompatible units into distinct plots and displays the same data from both real engines. `BrowserOscilloscope` owns only presentation and measurement interaction.

`lib/waveform-analysis.ts` contains time-aware statistics and sample preparation. `fft.js` performs the transform. Window normalization, DC/Nyquist handling, adaptive sampling and coherent-record checks have analytic regression tests. Detailed controls and limitations are in [waveform-instruments.md](waveform-instruments.md).

## Grading boundary

Only the precision divider, RC filter and inverting amplifier have authoritative fixed-topology graders. **Prepare SPICE & grading** reads the current CircuitJS circuit, translates supported native elements and solved connectivity into the existing strict `CircuitDocument`, and generates its SPICE deck. It never submits a cached starter in place of the edited circuit.

The adapter uses numeric native serialization rather than rounded UI labels. Unsupported components, source changes and model settings are rejected. The server independently validates every submitted document using Zod, compiles coordinate-independent `CircuitIR`, checks exact topology and stimulus, then recomputes its versioned analytical grade. Client vectors and verdicts are never grading evidence.

The retained version-1 document describes IDs, references, component kinds and parameters, placements/orientations, typed pin/junction endpoints, wires, labels, probes and analyses. `lib/circuit-document.ts` owns its schema and compiler. `lib/circuit-spice.ts` owns generated decks. No arbitrary SPICE can enter the authoritative grader.

## Accounts and persistence

Supabase Auth manages passwords, email confirmation and recovery. `app/auth.ts` verifies identities through `supabase.auth.getUser()`; request-supplied identity headers and unverified local session data have no authority. Server-only forms use PKCE callbacks, same-origin POST validation and HttpOnly cookies. Middleware rotates expired tokens and propagates the replacement cookies to the route and response. See [supabase.md](supabase.md).

D1 uses parameterized Drizzle queries:

- `users`: verified Supabase UUID, display name and email.
- `submissions`: canonical document, result, grader version and idempotency key.
- `user_problem_progress`: attempts, best score and solve state.
- `api_rate_limits`: expiring shared buckets keyed by a secret-derived client pseudonym.

A submission transaction upserts the user, submission and progress together. Replayed idempotency keys do not increment attempts. Anonymous simulation and practice grading remain available; persistence failures are reported honestly. `/api/progress` returns only the verified user's solved slugs and uses private, no-store responses.

The 15 worked numerical exercises use local calculation checks and device-local completion, separately from authoritative design grading. Their solutions are public learning content. Search and progress filters merge that local completion with server-verified solved slugs.

## Hosting and response policy

The full React/Vinext app runs on Cloudflare Workers, using the existing GitHub CI/deploy workflow. GitHub Pages continues to publish the separate static showcase. Vite emits the Worker, client assets and generated Wrangler config. The `ASSETS` binding serves the pinned native editor with a dedicated route policy.

Application HTML uses per-response CSP nonces, prohibits inline script handlers and permits only same-origin frames. Only the `/circuitjs/` runtime permits the inline/eval behavior required by its GWT loader. That exception does not apply to account or application pages. Supabase cookies are HttpOnly; the iframe receives no direct Auth client or credentials.

The static `public/_headers` policy mirrors the native runtime restrictions when assets are served directly. Source and license downloads remain available offline with the project. Native runtime files have a checked SHA-256 manifest.

D1 schema SQL lives in `drizzle/`. For a new database, configure the actual database binding and apply these migrations before expecting saved progress. Existing schema data is preserved by this feature. Worker authentication settings are runtime secrets; no Supabase project credentials are committed.

## Validation

`npm run typecheck`, `npm run lint`, `npm test` and `npm run test:e2e` are the primary checks. Both simulator distributions have artifact audits. Unit/integration tests run real ngspice calculations, compare every new numerical solution, test auth through the official SDK, and reject grading tampering. Browser tests load actual native circuits and exercise editor, probe, capture, FFT, grading, saved progress and auth UI flows.

Playwright compares native RC, CMOS and Sallen–Key canvas screenshots against reviewed baselines in `tests/e2e/visual-baselines/`. The tolerance accommodates minor Chromium font rasterization differences; it is not a proof that every arbitrary user layout avoids overlap. Review changed baselines visually before accepting an update. Representative application captures are documented in [screenshots/README.md](screenshots/README.md).

A live Supabase project, redirect configuration and inbox are still needed to validate actual signup and email delivery. The local tests never report mocked network responses as live account verification.

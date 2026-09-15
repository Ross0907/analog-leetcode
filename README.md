# AnaCode

AnaCode is an analog-first circuit-design practice platform. A learner receives an engineering specification, builds a schematic, inspects simulated behavior, and submits a constrained design for server-side verification. The product direction is deliberately closer to a circuit-design workbench than a multiple-choice quiz.

This repository is an early, working vertical slice—not a claim of production certification or market exclusivity. Related circuit-learning products exist, and no software can honestly be described as “unexploitable.” The current implementation establishes the practice loop and its trust boundaries; the authoritative native-SPICE judge described in the roadmap still has to be built and independently reviewed.

## What works today

- Nine curated analog/digital challenge briefs with visual starter schematics and DC operating-point, AC, transient, or DC-sweep instrument setups.
- Browser-side simulation through `eecircuit-engine@1.7.0`, which runs its bundled ngspice WebAssembly engine in a dedicated Web Worker.
- A schematic-first, publication-style editor with a searchable symbol palette, click or drag placement, exact 90-degree wire segments that can be dragged or keyboard-nudged without detaching their endpoints, drag-box and additive multi-selection, connected group movement, automatically created and cleaned branch junctions, global VCC/VDD power ports, local ground symbols, net labels, side-positioned vertical labels, pointer-centered Ctrl/Cmd-wheel zoom, wheel pan, keyboard shortcuts, undo/redo, source-waveform controls, voltage probes, and bounded project JSON import/export.
- A strict electrical boundary: the editor's presentation document is converted to a versioned Zod-validated `CircuitDocument`, normalized to `CircuitIR`, and only then rendered as a generated solver deck.
- Up to four voltage channels with oscilloscope, curve-tracer, and separate Bode magnitude/phase views. The oscilloscope includes scaling, coupling, triggering, cursors, automatic measurements, and an accessible data table.
- Three fixed-topology server judges: precision divider, 1 kHz RC low-pass, and inverting gain stage. Each judge parses and compiles the submitted `CircuitDocument`, verifies the exact component set, connectivity, and fixed stimulus, and only then extracts the permitted values for its versioned equation checks.
- Strict structured submissions: each live judge receives the bounded canonical schematic document, never a user-supplied SPICE deck, client-extracted answer, or browser-computed result.
- A versioned challenge-authoring JSON template at `/problems/new`, backed by a strict 64 KiB schema and cross-reference validation. It can select only a registered server-owned fixed-topology grader and cannot contain executable code, equations, model text, netlists, directives, URLs, or arbitrary grader configuration.
- Optional platform-managed ChatGPT sign-in, D1-backed submissions/progress, replay-safe idempotency keys, stored verdicts, and an authenticated profile. Authenticated user/submission/progress writes are committed as one transactional D1 batch.
- Multi-route product UI, security headers, build tests, and packaged D1 migrations for Sites hosting.

The symbol library is broader than the simulated-device set. Resistors, capacitors, inductors, independent voltage/current sources, grounds, diodes, BJTs, 90 nm-model MOSFETs, and ideal op-amps currently have typed visual-to-electrical adapters. Other publication symbols, including the current digital-gate symbols, can be used in diagrams but produce a clear error until a typed simulator model is implemented. Raw solver source is an optional collapsed expert view, not the primary learning interface.

The remaining six challenges are simulation practice only. Their displayed specifications are product content, not an assertion that an authoritative judge already exists for them.

## Architecture at a glance

```text
visual schematic ──> presentation document ──> strict CircuitDocument
                                                └──> CircuitIR ──> generated deck
                                                                      └──> browser Web Worker
                                                                           ├──> spice-ts structural preflight
                                                                           └──> ngspice-WASM ──> instruments

same strict CircuitDocument ──> /api/grade ──> parse + compile to CircuitIR
                                                  └──> exact topology/stimulus check
                                                        └──> versioned equations
                                                              └──> transactional D1 batch, if signed in
```

The browser is untrusted. A user can change the client, forge a preview, or call the API directly without affecting the grading rules: the API revalidates and recompiles the submitted electrical document, checks its graph against a server-owned fixed topology, and recomputes its own metrics. The three current judges use deterministic engineering equations after topology verification; they do **not** invoke ngspice on the server.

See [docs/architecture.md](docs/architecture.md) for the full design, [docs/product-landscape.md](docs/product-landscape.md) for the dated competitive scan, and [SECURITY.md](SECURITY.md) for the threat model, current controls, and launch blockers.

## Local development on Windows

Prerequisites:

- Windows 10/11 with PowerShell
- Node.js `>=22.13.0` and npm
- Git, if cloning the repository

From PowerShell:

```powershell
cd C:\path\to\anacode
node --version
npm ci
npm run dev
```

Open the URL printed by the development server (normally `http://localhost:3000`). The local server is a development environment; do not expose it directly to the public internet or treat locally supplied identity headers as trustworthy.

Useful commands:

```powershell
npm run dev                 # local vinext/Cloudflare development server
npm run build               # production build into dist/
npm test                    # build, simulator-integrity gate, then server/unit tests
npm run lint                # ESLint
npm run test:e2e            # Chromium editor/simulator/browser regressions
npm run audit:simulator     # verify the exact installed JS/WASM artifact hashes and banner
npx tsc --noEmit            # strict TypeScript check
npm audit --omit=dev        # production dependency audit
npm run db:generate         # generate a new Drizzle migration
```

Dependency versions are exact in `package.json` and reproducible through `package-lock.json`; use `npm ci` for clean installs. Review lockfile changes and audit output before merging an upgrade.

## Database and identity

`.openai/hosting.json` declares a Cloudflare D1 binding named `DB`. The schema in `db/schema.ts` contains:

- `users`, keyed by the platform-provided opaque user ID;
- `submissions`, including the canonical submitted document, stored grade result, problem/grader versions, and a per-user idempotency key;
- `user_problem_progress`, containing best score, attempts, and first solve time.
- `api_rate_limits`, containing short-lived HMAC-pseudonymized edge-address buckets for the shared grading-write throttle.

Forward SQL migrations are kept in `drizzle/`. After changing `db/schema.ts`:

1. Run `npm run db:generate`.
2. Inspect the generated SQL; migrations are executable deployment input.
3. Add a new forward migration instead of editing one that has already shipped.
4. Run `npm run build`. The Sites build plugin copies hosting metadata and `drizzle/` into `dist/.openai/` so the hosting platform can apply migrations to the provisioned D1 database.

Anonymous visitors can simulate and receive an unsaved practice grade. Persistence is attempted only when the hosting layer supplies authenticated `oai-authenticated-user-*` headers. Those headers are a trusted input only behind the platform boundary; a different deployment must strip caller-supplied copies and inject verified identity itself.

For an authenticated submission, the API first looks up `(user_id, idempotency_key)`. A retry of the same problem version and canonically serialized schematic replays the stored verdict without incrementing progress; reuse of the key for a different request returns `409`. A new user upsert, submission row, and progress update are issued in one D1 transactional batch, so the aggregate cannot advance without its submission. A persistence failure leaves the returned grade explicitly unsaved.

## Simulator policy

The browser preview calls `eecircuit-engine` directly to run ngspice-WASM. `@spice-ts/core@0.3.0` is used only for bounded structural parsing before execution; it is not the numerical simulator. The independently tested policy in `lib/simulator-netlist-policy.ts` accepts at most 12,000 bytes, 180 lines, 80 parsed components, 5,000 requested or returned points, 2,000 periodic-source events, four requested voltage probes, and exactly one `.op`, `.ac`, `.tran`, or `.dc` analysis. Directives are allowlisted, and the only permitted include is the exact bundled `modelcard.CMOS90` name.

Worker startup and circuit execution have separate budgets: WebAssembly initialization may take up to 30 seconds, while the four-second run timeout starts only after the worker reports a matching ready-protocol version and the request is dispatched. The page prewarms one worker, permits one run in that worker, terminates it after the result, and then prewarms a replacement; cancellation, unmount, stale messages, and initialization failures all dispose their worker.

The generated CMOS starter circuits select the bundled `N90`/`P90` BSIM4 benchmark model rather than a level-1 MOS model. This is an educational generic model, not a foundry PDK or silicon-signoff claim. An advanced user may expand the collapsed solver-source panel and edit the preview deck. The raw deck and its simulated results are never accepted as grading evidence. A supported challenge submits the canonical circuit document; the server recompiles it, verifies the fixed graph and stimulus, and extracts only the allowed values before recomputing the grade.

The roadmap target for authoritative free-topology grading is a separately pinned native ngspice 47 service. It is **not implemented in this repository**. AnaCode will generate its decks from the typed circuit representation; it will not forward raw user netlists. Each job must run without network access or credentials, as a non-root process, in a disposable filesystem with strict CPU, memory, process, wall-time, and output limits. See [docs/architecture.md](docs/architecture.md).

## Schematic editor and Analog Canvas

[Analog Canvas](https://analog-canvas.tokenzhang.com/editor) is a strong visual reference, but its hosted editor is not embedded and its code is not vendored here. The reviewed project is AGPL-3.0-only and did not present a stable, security-reviewed embedding/export contract suitable for trusted verification. AnaCode therefore renders an original set of conventional IEC/IEEE-style schematic symbols while delegating canvas interaction, pin hit-testing, click/drag connection state, selection, pan/zoom, and viewport transforms to pinned `@xyflow/react@12.11.6`. Pinned `@tisoap/react-flow-smart-edge@5.0.0` supplies worker-backed obstacle routing. A small custom React Flow `BaseEdge` renderer resolves routed results onto the exact electrical pin coordinates, preserves authored orthogonal waypoints, and makes each selected wire segment itself a drag or keyboard grip; it deliberately exposes no free-form circular control points or diagonal crossing decorations. Branching onto an existing wire creates the topology junction automatically; deletion prunes or collapses obsolete automatic junctions, and only a true three-or-more-way connection renders a dot. A junction is not a palette item or learner-movable component. AnaCode owns the typed `CircuitDocument`/`CircuitIR` adapter, symbol presentation, and product-specific orthogonal-editing policy rather than a home-grown graph-canvas or pathfinding engine.

A future Analog Canvas integration would require a pinned, audited, self-hosted build on a separate origin, strict schema/SVG sanitization, an independent typed circuit IR, and full AGPL network-source compliance (or a separate license). Its exported SPICE would still never enter an authoritative simulator verbatim.

## Challenge authoring

`/problems/new` includes a guided local form with live validation, validation diagnostics, JSON inspection, clipboard copy, and safe file export; `/api/challenge-template` also downloads the complete `anacode.challenge-template` version 1 starter. The contract covers public content, a built-in starter preset, exact allowed/required components, editable references, one matching analysis, named probes, public checks, and the public description of server-only corner dimensions. The validator binds the preset, component references, probe IDs, analysis, grader ID, and implementation version to code-owned registries.

This is deliberately a local, source-controlled authoring workflow. There is no upload, registration, or publishing endpoint. A template remains `draft` and cannot define or execute a grader; publishing a new topology still requires a reviewed server implementation, adversarial tests, content review, and explicit registry integration.

## Repository map

```text
app/                    routes, pages, client simulator, schematic editor
app/api/grade/          constrained grading endpoint
app/workers/            browser simulation worker
db/                     Drizzle D1 access and schema
drizzle/                reviewed, deployable SQL migrations
lib/                    challenge data, engineering parser, grader
scripts/                release-integrity and provenance checks
worker/                 Cloudflare Worker entry and response headers
tests/                  built-worker integration tests
docs/architecture.md    trust boundaries and roadmap
docs/product-landscape.md dated adjacent-product scan and defensible positioning
docs/simulator-artifact-manifest.json exact installed wrapper/WASM hashes and source-trace evidence
docs/simulator-provenance.md simulator artifact provenance and release gate
SECURITY.md             security policy and known limitations
```

## Project status and licensing

**Hosted-deployment gate:** do not deploy the current browser bundle to any external hosted environment—public or access-controlled—or otherwise redistribute it while it contains the installed `eecircuit-engine@1.7.0` simulator artifact. Its npm wrapper is MIT-licensed, but the exact corresponding ngspice source revision, build patches/toolchain, and complete model-card license/provenance set for the embedded WebAssembly bundle are not yet pinned. A wrapper license does not resolve the embedded artifacts' independent obligations. No hosted deployment was created for this snapshot. The stop-ship criteria and two acceptable resolution paths—obtain complete immutable provenance or replace/rebuild the artifact—are recorded in [docs/simulator-provenance.md](docs/simulator-provenance.md) and [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

The grading API now combines a bounded per-isolate burst guard with an atomic D1 fixed-window bucket keyed by an HMAC-SHA256 pseudonym of the trusted edge client address. External edge traffic requires a secret `RATE_LIMIT_HMAC_SECRET` of at least 32 bytes and fails closed with `503` if that secret, D1, or the shared limiter is unavailable. This is distributed enforcement for the current write route, but it is not a substitute for platform WAF/bot controls, authenticated daily quotas, monitoring, or circuit breakers. Those controls, a privacy/retention policy, a monitored security-reporting channel, formal trademark review, and an independent penetration test remain public-launch work. Free-topology authoritative grading additionally needs the separately isolated native simulator service described in the roadmap.

No repository-wide software license is granted by this snapshot because no root `LICENSE` file is present. Third-party packages retain their own licenses; see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

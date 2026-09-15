# AnaCode security policy

AnaCode is being designed for hostile input, but this development snapshot is not security-certified and is not guaranteed to be vulnerability-free. “Unexploitable” is not a defensible property of a real web service. Security here means explicit trust boundaries, constrained inputs, layered isolation, reproducible builds, testing, monitoring, and a process for fixing what is found.

## Reporting a vulnerability

Do not disclose a suspected vulnerability, hidden test, personal record, or credential in a public issue.

This snapshot does not yet publish a monitored security mailbox. That is a blocker for a public launch. Until one is configured, use the repository host's private vulnerability-reporting feature (for example, a private security advisory) or a private channel supplied by the deployment owner. Include:

- the affected route, commit, and deployment URL;
- a minimal reproduction with destructive steps removed;
- expected and observed impact;
- whether authentication or special configuration is required;
- any logs with tokens, email addresses, and user IDs redacted.

The deployment owner should acknowledge a valid report privately, preserve evidence, assess affected versions, prepare a fix and regression test, rotate exposed credentials where needed, and coordinate disclosure. Do not promise a response SLA until a monitored channel and incident rota exist.

## Supported versions

There is no deployed or stable public release line yet. During this pre-release phase, only the current repository snapshot is intended to receive security fixes.

## Security boundaries

The assets in scope are grading integrity, challenge test data, service availability, Supabase sessions, and D1 records containing email addresses, submissions, and progress.

The primary rule is that the browser is always untrusted:

- Browser simulation is learning feedback, not proof of correctness.
- Canvas state, submitted circuit documents, exported netlists, plotted waveforms, and client-extracted values can all be forged.
- Identity comes from server-verified Supabase `getUser()` results, never injected identity headers or a user ID in the request body. Sessions use HttpOnly cookies and PKCE; auth writes require a same-origin POST. See [authentication setup and lifecycle](docs/supabase.md).
- The server strictly parses and compiles the submitted canonical `CircuitDocument`, verifies its component graph and fixed stimulus against code-owned rules, extracts only allowed values from the verified graph, and independently recomputes a grade.
- D1 writes occur only for an authenticated identity and use a per-user idempotency key.

The current server grader uses exact fixed-topology checks followed by versioned deterministic equations for three challenges. It does not execute native code or accept raw SPICE. “Hidden” currently means absent from the normal browser bundle; it should not be treated as a cryptographic secret, especially when source code is available.

## Implemented controls

### Native editor distribution

The pinned CircuitJS1 runtime is served from `/circuitjs/`, with source, build patch and license available alongside it. Its GWT loader requires inline/eval scripting; that permission is restricted to the native runtime path. Application and authentication HTML retain nonce-based scripting policy. Same-origin framing permits the native JavaScript measurement API. The iframe runs trusted vendored code and has no direct access to HttpOnly Supabase session cookies; imported files are still treated as untrusted input to the upstream parser. Byte limits, explicit parse checks, a pinned asset hash manifest and source review reduce this exposure. This is not an origin-isolated sandbox, and changes to native code require security review.

### Grading API

`POST /api/grade` currently enforces:

- `application/json` only;
- an 8 KiB limit checked against `Content-Length` and enforced while streaming the body;
- a required same-origin `Origin`, plus `Sec-Fetch-Site` validation when present;
- an exact discriminated Zod envelope per supported problem with no unknown fields, containing a UUID idempotency key, fixed problem version, and versioned `CircuitDocument`;
- strict document and semantic limits for identifiers, components, wires, junctions, analyses, connectivity, and finite bounded parameters;
- server-side compilation to coordinate-independent `CircuitIR`, exact component/reference/connectivity/fixed-stimulus verification, and only then value extraction and versioned equation grading;
- rejection of extra components, disconnected or rewired topologies, stimulus changes, raw solver text, legacy client-value fields, and unknown keys;
- `Cache-Control: no-store` and `X-Content-Type-Options: nosniff`;
- persistence logs containing only a bounded error class name and no request body or identity data;
- a bounded per-isolate burst guard plus an atomic D1 fixed-window limit keyed by an HMAC-SHA256 pseudonym of the trusted edge client address; raw addresses are not stored, the HMAC secret must contain at least 32 bytes, and trusted edge traffic fails closed if the secret or shared limiter is unavailable;
- direct regression tests of the shared fixed-window state machine against in-memory SQLite, including exact-budget denial, window reset, subject isolation, cleanup, and invalid state.

These checks reduce attack surface; the D1 bucket provides shared enforcement for this write route, but it does not replace edge WAF/bot controls, account quotas, request budgets, or monitoring.

### Browser simulator

The numerical preview runs the local source-built `eecircuit-engine@1.8.0+anacode.1` and its ngspice 45.2 WebAssembly build in a dedicated Web Worker. `@spice-ts/core@0.3.0` is used only for a bounded structural parse before the engine runs. The pure, independently tested policy in `lib/simulator-netlist-policy.ts` limits input to 12,000 bytes, 180 lines, 80 parsed components, 5,000 requested or returned analysis points, 2,000 periodic-source events, 32 voltage/current probes, and exactly one `.op`, `.ac`, `.tran`, or `.dc` analysis. It uses a small directive allowlist; file/library/control/execution directives, parameter sweeps, and subcircuits are rejected. The sole include exception is the exact bundled `modelcard.CMOS90` identifier.

The lifecycle distinguishes slow engine startup from circuit execution. A typed ready/result protocol grants initialization up to 30 seconds; the four-second execution timer starts only after the ready version is validated and a request is posted. The page prewarms a worker, accepts one run per worker, disposes it after completion or cancellation, and prewarms a replacement. Initialization errors, message errors, timeouts, stale run IDs, and unmounts terminate the affected worker. These measures bound normal UI work but cannot make a compromised browser authoritative.

The SPICE workspace accepts expert edits to preview decks, so the worker treats every received string as hostile. This containment protects responsiveness and the server boundary, not grading integrity or the visitor's browser. Worker code can be modified, and parser complexity, WebAssembly memory pressure, and simulator or browser-engine defects remain in scope. Raw preview decks and outputs never enter a trusted server execution path; the three supported submissions send a bounded canonical circuit document, which the server independently compiles, verifies, and grades.

The source-built simulator's release verification completed on 2026-09-16. Pinned ngspice and wrapper source, documented modifications, build/relinking scripts, Berkeley model correspondence and complete component notices accompany the runtime. The clean installed-package audit, production build and full browser suite passed; all 13 source and notice files in the production output match the manifest hashes. The deploy-only `node scripts/audit-simulator-provenance.mjs --release` check verifies the completed record and artifacts. Every hosted release must retain `/simulator/` source and notice assets. See [the simulator provenance record](docs/simulator-provenance.md).

### Visual editor

CircuitJS1 owns the primary editor's native component, wire, node and model semantics. Imports are limited to 2 MB and validated as native XML or legacy CircuitJS text before passing to the upstream parser. Captures permit 32 probes and a bounded sample count, and abort on editing, reset, cancellation or solver errors. Native simulation runs within the upstream browser runtime; the separate ngspice workspace uses a Worker.

Only the three supported grading topologies can be converted through the narrow native-to-`CircuitDocument` adapter. It reads actual serialized elements, source properties and native node IDs, then checks the existing strict schema. The server independently verifies connectivity and fixed stimuli. Unsupported native components and models fail conversion explicitly. The retained legacy document importer and its renderer are compatibility code, not the default editor. Native CircuitJS transistor models differ from the bundled ngspice BSIM4 benchmark models; neither is a real-process PDK or signoff model.

### Challenge authoring

The versioned `anacode.challenge-template` contract is declarative local tooling, not a plugin or execution format. Validation is strict, capped at 64 KiB, and cross-checks the selected built-in preset, analysis, probe IDs, exact component counts/references, editable parameters, registered grader ID, and grader implementation version. It deliberately has no fields for JavaScript, expressions, netlists, simulator directives, model text, SQL, URLs, or arbitrary grader configuration.

`/api/challenge-template` only downloads the code-owned example. There is no template upload, persistence, publication, or dynamic grader-registration endpoint. A new challenge or topology must still be implemented and reviewed in code; adding an upload path would create a new trust boundary requiring a separate threat model.

### Persistence and authentication

Drizzle parameterizes D1 operations. Foreign keys bind submissions/progress to the platform user ID, and `(user_id, idempotency_key)` is unique. The stored submission contains the canonical circuit document and the server verdict. For the same authenticated user, an identical retry with the same key replays that stored verdict without incrementing attempts; the same key attached to a different problem, version, or serialized document returns `409`.

A new authenticated result uses one D1 transactional batch for the user upsert, submission insert, and progress upsert. Thus a failed batch cannot leave progress advanced without its matching submission. A unique-key race is resolved by re-reading and replaying only an identical stored request. A persistence failure after rate admission can still return an explicitly unpersisted practice result and logs only the error class name. If the shared limiter itself is unavailable on trusted edge traffic, the route fails closed with `503`.

Supabase owns password verification and email delivery. The application uses the official SDK for server-verified identity, PKCE callback exchange, HttpOnly session cookies, refresh, sign-out and recovery. Redirect destinations are restricted to local paths. Signup and recovery use generic responses to limit account enumeration. No service-role key is needed or accepted. Live account and email verification requires a configured Supabase project; tests emulate upstream HTTP responses and exercise the actual SDK and routes.

### Response policy

Application responses receive HSTS on HTTPS, `nosniff`, strict-origin referrer policy (preserving stricter auth callback `no-referrer`), frame-ancestor denial, COOP, origin isolation and a restrictive permissions policy. Their CSP denies objects and permits only same-origin child frames for the vendored editor. Each application HTML response receives a fresh nonce on script and stylesheet elements through Cloudflare `HTMLRewriter`, with a bounded full-body fallback for the Node build harness. Application scripting excludes `'unsafe-inline'`; inline event handlers are denied. The separate native asset policy is described above.

`style-src-attr 'unsafe-inline'` remains because the current React UI emits bounded code-owned style attributes; stylesheet elements require the nonce on non-local origins. The localhost-only development response permits inline stylesheet elements because Vite injects CSS-module updates dynamically and cannot attach the per-response nonce; production and preview hostnames do not receive that exception. `script-src` also permits `'wasm-unsafe-eval'` because the local ngspice preview requires WebAssembly compilation. Neither allowance grants network or grading authority to the worker, but both remain browser attack surfaces that must stay narrowly scoped and reviewed.

## Known gaps and launch blockers

- The current D1 fixed-window limiter is shared and fail-closed for trusted edge traffic, but there are no account-level daily quotas, platform WAF/bot rules, job queue, or circuit-breaker policy. The local-preview fallback remains per isolate by design.
- No isolated native ngspice 47 grading service or independent simulator oracle yet; the three current judges are equation-based. The ngspice-WASM browser preview is not that service.
- Twenty-one problems are practice-only and cannot produce an authoritative accepted result; fifteen of those offer locally checked worked numerical answers.
- No formal penetration test, threat-model review by an independent party, SAST/DAST gate, SBOM/signing pipeline, or disaster-recovery exercise.
- No published retention/deletion policy for stored email addresses and submissions.
- No monitored vulnerability mailbox or incident-response SLA.
- CSP retains the style-attribute and WebAssembly compatibility allowances described above.
- `vinext@1.0.0-beta.8` remains pre-release. Cloudflare runtime semantics are pinned to compatibility date `2026-08-29`, but upgrades still require a tested canary and rollback path.
- Server-only test cases are not secret if an attacker can access deployed source or repository history.
- Same-origin header checks are useful CSRF defense-in-depth but must be supplemented by the hosting platform's cookie and origin protections; non-browser clients can set headers.

As of 2026-09-16, a clean installation with npm 12.0.2 reports zero known vulnerabilities across production and development dependencies. The coordinated Cloudflare toolchain upgrade includes the patched `sharp@0.35.4` dependency and removes the previous four high findings (GHSA-rgj7-g3m4-5g8c). CI checks the complete dependency graph and fails on high or critical npm audit findings. Do not expose development tooling to untrusted networks. Audit results are time-sensitive and are not proof of safety.

## Native ngspice 47 acceptance criteria

The planned authoritative target is a separately pinned native ngspice 47 service. It is roadmap work, not a capability of this snapshot, and must not be added to the edge Worker. Before it can verify free-topology submissions:

1. Accept a versioned typed circuit IR, never a user-authored deck, model card, path, directive, or command.
2. Validate topology, counts, numeric ranges, sweep sizes, model identifiers, and total serialized size.
3. Generate a canonical deck from trusted templates and a pinned model allowlist.
4. Run one job per disposable sandbox as a non-root UID, with no network, no credentials, no host mounts, a read-only root, and a fresh bounded temporary filesystem.
5. Drop capabilities, enable `no_new_privs`, apply an allowlist seccomp/AppArmor policy, and prefer a stronger isolation boundary such as gVisor or a microVM for internet-facing work.
6. Enforce independent wall-clock, CPU, memory, process, file, input, log, and result-size limits; kill the complete process tree on timeout.
7. Parse only bounded machine-readable output. Never return filesystem paths, simulator internals, model IP, or hidden vectors to the client.
8. Pin the simulator binary, build inputs, flags, models, and grader version; record hashes sufficient to reproduce a verdict.
9. Differential-test representative cases against a second trusted simulator or analytical oracle and include malicious decks in regression testing.
10. Review ngspice and model-library redistribution licenses before shipping binaries or models. The top-level MIT license in the installed `eecircuit-engine` package is not by itself a complete notice/provenance inventory for the ngspice WebAssembly and model-card artifacts embedded in its distribution bundle.

The same provenance requirement applies to the current browser-preview artifact. Its pinned source build and corresponding-source distribution are documented in [docs/simulator-provenance.md](docs/simulator-provenance.md), together with the release verification record. Future native-service work must preserve its own component license and source obligations.

## Analog Canvas policy

Analog Canvas was reviewed as a visual reference at commit [`e34a33904549840ba054fd739df03ce352aa9643`](https://github.com/cascode-ai/analog-canvas/tree/e34a33904549840ba054fd739df03ce352aa9643). The mutable hosted editor is not framed, its JavaScript is not trusted, and its project/SVG/SPICE exports do not enter AnaCode's verification boundary. No Analog Canvas code or assets are bundled here.

Any future integration must use a pinned and reviewed build on a credentialless separate origin, validate project data against an explicit schema, sanitize SVG without `dangerouslySetInnerHTML`, convert connectivity into an independent AnaCode circuit IR, and ignore user-provided SPICE directives. Because Analog Canvas is AGPL-3.0-only, a modified network deployment must also satisfy the license's Corresponding Source obligations or obtain another license. Security review and license compliance are separate requirements.

## Maintainer verification checklist

For every release candidate:

```powershell
npm ci
npx tsc --noEmit
npm run lint
npm test
npm ls --all
npm audit --audit-level=high
npm run test:e2e
```

Also review dependency/lockfile diffs, generated migrations, CSP changes, authentication-boundary changes, grader-version changes, logs for accidental personal data, and the hosting/WAF configuration outside this repository. Use OWASP ASVS as a verification baseline; do not describe the deployment as ASVS-compliant without an actual assessment.

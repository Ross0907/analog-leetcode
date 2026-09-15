# CircuitJS1 schematic editor and solver

AnaCode's primary schematic editor is the actual CircuitJS1 application, compiled from the official Paul Falstad repository at `5bdb1296ce6a82f79515f4f1dd1b9a86e03236f7`. The Java/GWT editor owns symbols, terminal hit testing, wiring, routing, electrical connectivity, component models, simulation, undo/redo, zoom, import/export and native scopes. AnaCode does not implement a replacement schematic backend.

The application is self-hosted under `public/circuitjs/`, framed from the same origin, and works without loading a third-party hosted editor. The native `CircuitJS1` JavaScript API provides timestep callbacks, node voltages, supported branch currents and native circuit serialization. The GPL patch exposes native terminal coordinates, node IDs, hit testing, element XML attributes, stop messages and viewport projection for probe placement and existing-grader interoperability. It also removes a redundant post-drag undo checkpoint so one native Undo reverses one edit.

The presentation adapter draws supported components using actual SVG geometry exported by the pinned official KiCad CLI. Native draw still maintains its original hit boxes, labels and terminal interaction; the adapter preserves pin identity, orientation and polarity. Native wiring, electrical nodes, device models, routing and simulation are unchanged. Unsupported components, non-DC source waveforms, four-terminal MOS variants and failed symbol loads retain native artwork. Symbol assets and their source/license inventory live in `public/kicad/`; see [KiCad symbols](kicad-symbols.md). Import/export remains CircuitJS format, and the native SVG export uses the upstream exporter.

Presentation flags disable voltage colouring, current dots and power colouring on initial load, restore and import. Native zoom commands are exposed directly so Ctrl/Cmd + wheel zooms while plain wheel scrolls the containing application. The quick component palette invokes the upstream Draw command; it does not create or maintain a second circuit graph.

## Probes and captures

The voltage tool uses CircuitJS's own hovered element and native terminal positions. All wires and terminals can be probed, including unlabeled nodes. The node selector is generated from the solver's node IDs, so a graphical crossing cannot accidentally become a connection in the adapter. Up to 32 probes can be named, colored, enabled, removed and captured together. The current tool supports native two-terminal component current. Schematic markers and plot colors agree.

Capture sets the native maximum timestep from the requested duration and target samples and records real accepted timestep callbacks. Adaptive steps are retained, with a bounded sample count and timeout. No fake waveform fallback exists. A circuit edit/reset, solver error or cancellation aborts capture; results feed the shared scope/FFT viewer. Native editing, capture state and saved circuit data stay local unless a user submits a grade.

Save restores the native exported XML document and probe associations; Open also accepts legacy CircuitJS text files. The complete upstream example library is included. The nine original challenges and fifteen additional problems have native documents. Analog model differences are labeled; exact supplied SPICE models remain available in the ngspice workspace.

## Existing grading compatibility

The three fixed-topology challenges have a “Prepare SPICE & grading” button. The adapter reads the current native element values via upstream XML serialization, native terminal node IDs, and allowed source/model properties. It converts these into the existing bounded CircuitDocument schema, validates it, and generates the SPICE preview through the existing compiler. The server independently verifies that submitted graph and stimulus. Unsupported components/model changes are rejected. Renaming or moving a symbol never substitutes a cached starter circuit. The prepared snapshot is identified as a snapshot; editing the native circuit requires preparing it again.

CircuitJS and ngspice remain distinct numerical engines. The native editor does not claim to import arbitrary SPICE decks or to reproduce ngspice BSIM model behavior.

## Source, license and rebuilding

`public/circuitjs/NOTICE.html` is linked from the editor and provides the exact complete source archive, GPL text, dependency notices, local patch, build script and artifact inventory. The native source and patch retain GPL-2.0-or-later licensing. The existing project MIT license does not supersede that license.

Run `pwsh -File scripts/build-circuitjs.ps1` from the repository root with Node.js and JDK 21 installed. The script checks SHA-256 hashes for the upstream archive and GWT 2.12.2 SDK before extraction, applies the reviewed API patch, compiles the generator and two browser permutations, copies resources, and records the artifact manifest. Normal frontend builds consume committed assets and require no Java/GWT installation or runtime external network access. The full original upstream archive plus exact patch and build script accompany every deployment.

Run `node scripts/audit-circuitjs.mjs` for drift detection, and the native engine/browser tests for numerical/interaction validation. Source rebuilds may change GWT permutation hashes when generator class iteration order differs; the recorded artifact inventory identifies the actual distributed build.

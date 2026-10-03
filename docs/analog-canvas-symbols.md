# Analog Canvas textbook symbols

Common schematic bodies and palette previews now use the actual generated
symbol definitions from [cascode-ai/analog-canvas](https://github.com/cascode-ai/analog-canvas)
at revision `85e6be67420a2395d5094325123b6debc1eb0286`. The selected catalog,
complete original generated TypeScript source, original AGPL-3.0 license and
public credit page are distributed under `public/analog-canvas/`.

Run `node scripts/build-analog-canvas-symbols.mjs` to regenerate the selected
JSON and SVG previews. `--check` verifies the fixed source hash and exact
generated outputs. This selects existing artwork; it does not generate new
symbol bodies. The upstream catalog preserves its individual provenance and
house-derived status for every selected definition.

The presentation adapter renders the catalog primitives directly. MOS uses the
upstream `textbook-3terminal` default variant and its supplied source arrow;
the hidden bulk lead is omitted according to that variant. DC voltage uses the
single-cell battery definition. The diode uses its supplied outline and cathode
bar. These drawings contain no decorative terminal circles. Native junction
dots use CircuitJS's own post-count list and appear only at three or more
connections, including branched wire endpoints. Selecting a component no
longer fills its terminal locations with circles.

Artwork is uniformly scaled and rotated, with reflection for reversed native
terminal orientation. BJT/MOS display fitting leaves clearance between the
arrow/body and the collector/emitter/source/drain junctions. Display leads
connect to the exact original native posts; connectivity, editing, models,
serialization, current directions and solving remain CircuitJS. Existing long
component spans still include their electrically necessary leads. Bundled
starters additionally call `compactComponentLeads()` immediately after native
import: long R/C/L and two-terminal sources become 64-unit native components,
with real upstream `WireElm` connections reaching their original terminal
locations. The helper is synchronous and idempotent; it retains component
objects, values, direction and ordering, then requests native analysis once.
Saved user documents and file imports retain their authored coordinates. Unsupported
artwork retains the separately attributed KiCad or native CircuitJS rendering.

The fitted Analog Canvas bodies use the same two-world-unit stroke as native
wires; the adapter compensates for symbol-fit scale while normal viewport zoom
continues to scale everything together. BJT fitting reserves extra clearance
at collector and emitter posts. Op-amp input bends remain outside the body,
with exactly two input leads and one output. Ground always faces down the page;
only its non-electrical endpoint is normalized, preserving its connected post.
The renderer reads the latest editor theme after asynchronous assets finish
loading, so dark paper cannot retain light-theme ink. Programmed voltage
sources use the pulse-source artwork and a PWL/period annotation instead of
the dormant native sine-frequency label.

Finite acquisition uses the existing native solver loop with animation-rate
throttling disabled only during a bounded batch (at most 2,048 requested steps,
8 ms per call). The event loop runs between batches. Every accepted timestep
is recorded, including adaptive convergence steps; neither preview plotting nor
requested record depth synthesizes simulator data. Circuit revision and element
identity checks invalidate edited graphs. Changing the maximum timestep now
invalidates the native stamp, preserving capacitor and inductor integration.
Progress reports contain actual collected samples and simulated time. A native
convergence stop or cancellation clears the acquisition callback and restores
the previous timestep unless the user explicitly changed it in the meantime.

Live acquisition samples accepted solver states at the requested record interval in its bounded ring; adaptive convergence steps do not evict the requested time span. Ring
capacity limits retained history and does not fabricate or interpolate values.

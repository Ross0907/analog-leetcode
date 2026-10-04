# Analog Canvas textbook symbols

Common schematic bodies and palette previews use 17 actual generated
symbol definitions from [cascode-ai/analog-canvas](https://github.com/cascode-ai/analog-canvas)
at revision `85e6be67420a2395d5094325123b6debc1eb0286`. The selected catalog,
complete original generated TypeScript source, original AGPL-3.0 license and
public credit page are distributed under `public/analog-canvas/`.

Run `node scripts/build-analog-canvas-symbols.mjs` to regenerate the selected
JSON and SVG previews. `--check` verifies the fixed source hash and exact
generated outputs. This selects existing artwork; it does not generate new
symbol bodies. The upstream catalog preserves its individual provenance and
house-derived status for every selected definition.

The presentation adapter renders the catalog primitives. MOS uses the
upstream `textbook-3terminal` default variant and its supplied source arrow;
the hidden bulk lead is omitted according to that variant. The requested
equal-length MOS gate bars are a small presentation adaptation: the shorter
bar extends to the longer bar's existing ±12.5-unit endpoints. The other
primitives, arrow and electrical pins are unchanged. The original source and
selected JSON remain byte-for-byte upstream; the renderer and generated MOS
previews disclose this derivative treatment. Verification against upstream
main `7e26ec6ed2b725f080bcc479d2b66c1674b25402` on 2026-10-04 found the
same source hash and unequal original bars. DC voltage uses the
single-cell battery definition. The diode uses its supplied outline and cathode
bar. These drawings contain no decorative terminal circles. Native junction
dots use CircuitJS's own post-count list, filtered to physical device/wire
branches, and appear only at three or more connections. A net label naming
an otherwise two-connection wire does not add a dot. Junctions use a three-unit
radius. Selecting a component no
longer fills its terminal locations with circles.

Artwork is uniformly scaled and rotated, with reflection for reversed native
terminal orientation. Two-terminal bodies retain canonical size regardless of
longer authored lead spans; only spans shorter than the source pin spacing
shrink uniformly. The selected `inductor-compact` has the same 40-unit pin span
as the resistor. BJT/MOS display fitting leaves clearance between the
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

The fitted Analog Canvas bodies use a finer 1.25-world-unit stroke, separate
from the two-unit native wires and display leads. The adapter compensates for
symbol-fit scale while normal viewport zoom scales everything together. BJT
fitting translates the unchanged body toward its base by at most ten units,
extending collector/emitter clearance to the original connected native posts.
The exact upstream `opamp-wide` definition has
40-unit input pitch: a uniform .8 scale matches CircuitJS's normal 32-unit
signed input pitch. Its two input leads stay straight at every rotation and
flip; the output is the third and only remaining electrical terminal. Authored
op-amps too short to fit this unchanged body retain native rendering rather
than bending their leads through it. Ground always faces down the page;
only its non-electrical endpoint is normalized, preserving its connected post.
The renderer reads the latest editor theme after asynchronous assets finish
loading, so dark paper cannot retain light-theme ink. Native vertical net-label
tethers and text shift aside when their presentation would overlap a nearby
ground; their single native post, electrical name and stored endpoints remain
unchanged. A final annotation pass places automatic value/label text clear of
native wire segments and neighboring captions, then paints a small paper
backing. User-dragged offsets remain authoritative. An offscreen measurement
pass includes the actual caption bounds in the first viewport fit, preventing
left-side source values from being clipped. Label text starts beside a vertical tether, with plain/flag styles
and independent 90-degree rotation. Dragging a value or net-label annotation
updates native XML presentation attributes `atx`, `aty` and `ata`, retained by
native Undo/Redo and save/reload. Double-clicking a numeric value opens its
native-backed inline editor. Op-amp selection handles mark only the two real
inputs and output, never its non-electrical midpoint anchor.

The upstream generic voltage-source body is intentionally an empty circle.
Its presentation adds an upright sine/triangle/sawtooth indicator according to
the real CircuitJS waveform type. These indicators are application annotations,
not claimed as upstream catalog primitives. Square/pulse sources keep the
upstream pulse artwork. Arbitrary programmed sources show `PWL` inside the
upstream source outline plus the actual PWL/period annotation, rather than a
misleading sine frequency or clock shape. DC and variable DC use the original
single-cell battery. No source settings or solver equations change.

`ensureAnalyzed()` performs CircuitJS's existing pending analysis and pre-stamp
passes even while paused, allocating real native node IDs before SPICE export
or capture. It does not advance solver time or replace elements. Native
validation errors are returned unchanged; no node IDs or connections are
synthesized.

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

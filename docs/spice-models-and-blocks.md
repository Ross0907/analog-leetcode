# Native circuits, SPICE models and reusable blocks

The workbench reads CircuitJS's actual electrical node identities and current
component values. SPICE conversion supports resistors, capacitors, inductors,
voltage/current sources, bounded ideal op-amps, explicitly selected amplifier IC
models, diodes, bipolar transistors, MOSFETs and native analog switches. Native
capacitor ESR is retained as a series resistance. An analog switch uses its
exported on/off resistances, threshold and control polarity in ngspice's SW model;
the native pull-down variant is explicitly rejected because its leakage circuit
differs. It never substitutes a challenge
reference circuit when a native component is unsupported.

The model selector includes TI's LM741 macro-model, the ngspice collection's
1N4148, BC546B, BC556B, IRFP240 and IRFP9240 models, the bundled CMOS90 models,
and clearly labeled educational models. MOS level-1 conversion reads the native
threshold and beta; it does not recreate all native model extensions. The
educational BJT beta edits also reach SPICE; published manufacturer models keep
their own beta and other parameters. SPICE model selection changes SPICE analysis,
while CircuitJS keeps its native
live model. A three-terminal op-amp uses its displayed output-limit settings as
implicit LM741 power rails. Use the five-terminal native real op-amp to wire
the power supplies explicitly.
Native LM324 variants have no matching bundled SPICE macro-model and require an
explicit replacement selection before SPICE analysis. They retain their native
model for live measurements; an LM741 replacement is labeled as a different IC.

Original model files and attribution are in `public/spice-models`. LM741's two
affine POLY sources are expanded exactly into ordinary controlled sources and
DC offsets for the browser's non-XSPICE ngspice build. BC556B's non-electrical
catalogue fields are omitted from its runtime copy. The original files remain
unchanged alongside these compatibility copies. Regression tests solve all six
published device models, including the real worker message path.

AC analysis can excite any selected voltage or current source, including a DC
source. Its DC bias is retained. Set the AC magnitude, phase, sweep scale,
frequency limits and points per interval. A DC sweep selects its own source.

SPICE transient analysis accepts up to 131,072 target samples and preserves all
accepted solver points, including adaptive startup and source-edge points, up
to 262,144 samples. All raw vectors share an 8,388,608-number result budget;
complex vectors count both components. Oversized runs fail with a useful error
instead of being silently decimated. The worker retains its four-second run
timeout. The result budget bounds returned records, not the ngspice WASM heap.

PWL points and bitstreams apply to the actual native voltage source. The source
interpolates the same bounded numeric table that SPICE receives, and CircuitJS
saves it in its native XML. Repeating bitstreams retain their repeat period.
Editing a programmed source through the native editor clears its PWL table;
analysis then uses the edited native values. Imported DataInput sources require
explicit PWL settings because the original file cache is not portable between
sessions.

To reuse a circuit, add labels to its external ports, select its components and
labels, and use **Save selected circuit as block**. Leave test sources and loads
outside the selection. Native ground symbols remain internal. The saved block
is an upstream CircuitJS `CustomCompositeModel`, not an image or a separate
schematic format. Insert it into another exercise, place it on the native canvas,
and wire its labeled terminals. The library is stored in this browser. The
native circuit export includes the definitions of placed blocks.

For SPICE, `getAnalysisElements()` supplies native flattened component and node
identities by recursively expanding only user-defined blocks. Built-in ICs keep
their external pins and selected macro-model; their internal devices are not
included a second time. The host keeps top-level component indices first and appends internal
devices; model selectors use the same ordering and object identity. Internal
labels are scoped to their native block instead of becoming duplicate global
SPICE names. Internal op-amps keep the native ideal default unless another model
is explicitly selected. Sources inside blocks are edited in the native block
editor; the main stimulus controls address top-level test sources.

The six additional expert exercises progress through a reusable pipeline residue
stage, loaded DAC settling, timed SAR decisions, density-stream reconstruction,
LM741 transimpedance compensation and flash-threshold calibration. Their
starters intentionally miss at least one target. Tests run both the starter and
an edited native solution through CircuitJS, compile those actual node connections
and values into ngspice, and check the measured outputs. The catalogue audit also
covers all numerical questions, native capture windows and the newer pulse and
two-pole filter designs. These are
local practice checks; they do not claim authenticated server grading. The
existing five topology-graded exercises retain their server contracts.

The browser's containment policy permits native ngspice B sources and bounded
subcircuits. It counts at most 80 top-level components, 2048 expanded devices
and eight subcircuit levels; undefined and recursive subcircuits are rejected.
ngspice parses and solves the circuits. File, control and execution directives
remain restricted by the existing policy.

# Challenge audit and authoring

The analog library contains 41 exercises: nine original designs, 21 worked numerical exercises, two parts-only wiring exercises, six expert converter designs and three additional transient/AC designs. Each exercise has a native CircuitJS document and a declared measurement window. The catalogue browser regression imports each actual native graph, applies its declared native stimulus, observes finite live voltages, compiles that graph into SPICE and checks the solved objective. It does not use the separate reference deck as the circuit under test.

`tests/e2e/curriculum-integrity.spec.ts` checks all 21 numerical answers, all five registered topology graders, both BJT beta corners, the original advanced objectives and ten failing-starter/passing-solution designs. The solution edits in `tests/fixtures/curriculum-witnesses.ts` are ordinary edits to native documents before import. The two disconnected starters must reject analysis/grading until their actual terminals are wired. The test writes the measured evidence to `.tmp/curriculum-native-audit.json`; it fails if a lesson lacks a numerical witness.

## Original exercises

| Exercise | Audit outcome |
|---|---|
| Precision divider | 5 V supply and equal 10 kΩ resistors give 2.5 V; strict server grader retained. |
| RC cutoff | 15.9 kΩ and 10 nF give about 1000.97 Hz; strict server grader retained. |
| Inverting amplifier | 10 kΩ input / 100 kΩ feedback gives nominal gain −10; strict server grader retained. |
| BJT bias | Native beta edits are preserved in the educational SPICE model. The actual network is checked at beta 80, 120 and 240 for VCE, current and all resistor powers. Manufacturer models retain their published parameters. |
| Rectifier ripple | The original 100 Ω ripple target was infeasible within the capacitor limit. The exercise now states a 1 kΩ load and a real 10 Ω source resistance; 220 µF is the failing starter, 1000 µF is a tested solution. Ripple is measured over 400–500 ms after startup, and source/diode surge is checked. |
| Gate charging | Corrected to describe the actual lumped RG–CGS model. Removed unsupported claims of Miller charge, ringing and parasitic overshoot. |
| Sallen–Key | Nominal response is near 5.115 kHz with Q≈0.707. Corrected the impossible claim that ±5% capacitors guarantee ±3% cutoff at every corner. |
| CMOS inverter | Corrected 1.5 V noise-margin targets that were incompatible with a 1.8 V supply. The nominal exercise uses 0.5 V margins and explicitly identifies its educational model. |
| TIA | Reframed around the supported feedback pole and 100 kΩ transimpedance. An ideal constant-gain op-amp cannot establish realistic phase margin or noise. |

Native CircuitJS device models and ngspice models need not match exactly. Advanced challenge notes identify the specified SPICE model. Electrical behavior and connectivity come from CircuitJS; the presentation uses the pinned Analog Canvas artwork. No separate schematic connectivity backend is introduced.

The DC, RC, BJT, rectifier, Sallen–Key, and TIA starter drawings use local ground symbols instead of long return loops. All ground symbols have the same electrical reference. Their connectivity is resolved by CircuitJS; additional ground glyphs are not counted as additional electrical parts by the fixed-topology verifier.

## New worked exercises

| Exercise | Reference quantity |
|---|---|
| Loaded divider | 1.6667 V |
| Current divider | 2 mA through 2 kΩ |
| Thevenin load | 4 V |
| RC charge at one time constant | 3.1606 V at 1 ms |
| RL current rise | 31.606 mA at 1 ms |
| RC high-pass | 0.532018 V/V at 1 kHz |
| Non-inverting feedback | 1 V (ideal gain) |
| Weighted summing | −2 V |
| Difference amplifier | 0.3 V |
| Practical integrator | 1.59135 V/V at 100 Hz |
| Capacitive divider | 1/3 V/V |
| Passive two-bit DAC | 2 V for code 10 |
| Resistor power | 25 mW |
| RL low-pass | 0.846733 V at 1 kHz |
| Buffer isolation | 1.2 V (ideal gain) |

Answers use relative tolerances appropriate to finite op-amp gain and transient interpolation. Adaptive transient vectors are interpolated at the requested physical time; AC results use complex magnitudes. Tests never substitute a formula-generated waveform for solver output.

## Converter foundations

| Exercise | Reference quantity | Model boundary |
|---|---|---|
| Three-bit R–2R DAC, code 101 | 3.125 V | Matched unloaded ladder; ideal bit drivers |
| SAR trial and residue | 0.075 V after 100 → 110 → 101 | A held input and manually selected trials; no clocked digital controller claimed |
| Flash thermometer conversion | Code 2 for 2.2 V | Count the three actual comparator outputs; no hidden encoder is substituted into the circuit |
| Comparator polarity | 5 V for V+ = 2.6 V and V− = 2.5 V | Ideal comparison away from the threshold; no offset or delay |
| ADC acquisition settling | 149.82 µV error at 1 µs | 1 kΩ source resistance, 100 pF sampling capacitance, initially discharged |
| Sample-and-hold droop | Approximately 1.98010 V at 1.1 ms | Native analog switch / standard ngspice SW model; Ron = 10 Ω, Roff = 10 GΩ |

The exercises include block descriptions for signal flow and the SAR feedback loop. These are explanatory diagrams, not additional simulation backends. The native circuits use upstream resistor, capacitor, voltage-source, op-amp and analog-switch models. The SPICE comparator is an explicitly ideal behavioral voltage source with 0–5 V levels. No device-specific silicon accuracy is implied.

Reference reading: [Analog Devices' SAR and flash comparison](https://www.analog.com/en/resources/technical-articles/successive-approximation-registers-sar-and-flash-adcs.html), [SAR architecture and acquisition](https://www.analog.com/en/resources/analog-dialogue/articles/successive-approximation-adcs.html), and [the ngspice manual](https://ngspice.sourceforge.io/docs.html) for voltage-controlled switches and behavioral sources.

## Parts-only wiring exercises

`wire-adc-reference` supplies a 5 V source, two resistors, two disconnected ground symbols and a loose `vout` label. `wire-antialias-filter` supplies a sine source, resistor, capacitor, two grounds and the same label. Neither native starter contains a wire. Guidance explains the connections to build; recommended probes point to the output.

Both exercise slugs use the existing server-owned divider/RC topology verifiers. Submission values come from the current native graph. Native node IDs determine wiring; part position and creation order do not substitute for connectivity. A correct output is inferred and probed automatically; an explicit misplaced `vout` label is rejected. Missing wires, supply tampering, a high-pass substitution, extra active parts and a probe on the wrong node cannot pass. Separate ground symbols are accepted; a ground on the signal still shorts it and fails.

The supplied SPICE text is an analysis template. Parts-only simulation must compile the learner's current schematic and fail with a wiring error if it is incomplete, never run the completed template as a fallback. The browser test imports both disconnected starters, checks rejection, connects their actual native terminals, and verifies the resulting graphs through the server grader.

The local authoring form can export a divider template with separate parts and editable wiring guidance. The optional `starterSchematic.partsOnly` contract selects a registered disconnected native preset, requires 3–12 wiring steps, and declares the `vout` output and automatic probe. Validation binds that preset to the same audited divider or RC grader. Component counts describe the electrical blueprint; repeated ground glyphs denote one reference. Export remains a local review workflow, not an automatic publication endpoint.

## Adding an exercise

Add a stable ID/slug, difficulty, domain, clear objective, assumptions and units to `lib/practice-challenges.ts` or the main challenge registry. Include a native file exported from the CircuitJS editor and a matching SPICE deck. Keep signal flow left-to-right, feedback outside the amplifier body and all connections on the native grid.

For a worked exercise, add `solution` metadata with the expected value, tolerance, explanation and a supported `verification` measurement. The existing ngspice audit then validates it automatically. Extend native import/browser validation so the displayed circuit is checked too. The native circuit document is ordinary upstream data, not a new rendering or connectivity implementation.

For authoritative design grading, implement a server-owned verifier and topology contract. Public solution data or user-authored templates cannot register executable grader logic. The existing `/problems/new` authoring form remains a source-controlled JSON template workflow.

## Capture defaults and additional design exercises

Steady operating-point lessons default to numeric DC readouts. Changing analog signals default to the scope; timed comparator decisions can be inspected in the logic analyzer. Every finite transient records from time zero, using a native solver reset that preserves the learner's components, wires and probe identities. It must not reapply the starter or overwrite component edits. The capture windows range from 300 ns for gate charging through 500 ms for settled rectifier ripple. Programmed PWL and bitstreams are applied to native voltage sources, so the live view and compiled SPICE waveform have the same input.

The three additional exercises are `reject-short-input-glitch` (peak and recovery after a 200 µs pulse), `rlc-bandpass-selectivity` (5 kHz passband and 50 kHz rejection), and `buffered-antialias-poles` (1 kHz signal preservation and 20 kHz rejection). Each begins with a capacitor that fails its target and has an edited native capacitor solution that passes both checks.

Authored ground-referenced sources use vertical voltage symbols with explicit local ground returns. Repeated supplies occupy a two-column bank connected through CircuitJS's own named nets. Floating series/trim sources keep both actual terminals and are never grounded by this layout helper. Ground symbols are electrical connections, regardless of their displayed location.

The optional v1 authoring field `workspace.nativeView` specifies `preferredInstrument`, `acquisitionMode`, `captureDurationS`, `captureSamples`, real `probeNodes`, `sourceStyle` and `stimulus`. Defaults are DC, live, 1 ms, 8192 points, vout, vertical source with ground return, and the reviewed preset stimulus. Validation bounds the record and probe set. This is reviewable presentation metadata; it cannot override a registered grader or introduce executable stimulus/model text. Older v1 templates without the field remain valid.

The compiler preserves native capacitor ESR as an explicit series resistor, permits unloaded amplifier/comparator outputs, and maps the native analog switch to ngspice's standard four-terminal SW model. A missing required connection now names the actual component pin instead of showing only “Circuit document cannot be compiled.” Both TIA starters have wire segments ending on real native input/capacitor pins, including junctions that previously lay visually on an unbroken wire without being connected.

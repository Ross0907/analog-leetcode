# Challenge audit and authoring

The library contains 24 exercises. All nine original typed and visual presets still compile and run in ngspice. Fifteen new exercises provide native CircuitJS documents, a SPICE deck, units, assumptions, a numerical answer and a worked explanation. Their answers are independently compared with actual ngspice vectors in `tests/practice-challenges.test.mts`.

## Original exercises

| Exercise | Audit outcome |
|---|---|
| Precision divider | 5 V supply and equal 10 kΩ resistors give 2.5 V; strict server grader retained. |
| RC cutoff | 15.9 kΩ and 10 nF give about 1000.97 Hz; strict server grader retained. |
| Inverting amplifier | 10 kΩ input / 100 kΩ feedback gives nominal gain −10; strict server grader retained. |
| BJT bias | Statement uses the supplied bias network; analysis label corrected to operating point. Beta changes are separate model experiments. |
| Rectifier ripple | Diode/capacitor/load transient retained. Peak current and ripple are measured from the real model, not promised by a fabricated reference curve. |
| Gate charging | Corrected to describe the actual lumped RG–CGS model. Removed unsupported claims of Miller charge, ringing and parasitic overshoot. |
| Sallen–Key | Nominal response is near 5.115 kHz with Q≈0.707. Corrected the impossible claim that ±5% capacitors guarantee ±3% cutoff at every corner. |
| CMOS inverter | Corrected 1.5 V noise-margin targets that were incompatible with a 1.8 V supply. The nominal exercise uses 0.5 V margins and explicitly identifies its educational model. |
| TIA | Reframed around the supported feedback pole and 100 kΩ transimpedance. An ideal constant-gain op-amp cannot establish realistic phase margin or noise. |

Native CircuitJS device models and ngspice models need not match exactly. Advanced challenge notes identify the specified SPICE model. Generic native symbols come from CircuitJS; no custom symbol backend is used for these exercises.

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

## Adding an exercise

Add a stable ID/slug, difficulty, domain, clear objective, assumptions and units to `lib/practice-challenges.ts` or the main challenge registry. Include a native file exported from the CircuitJS editor and a matching SPICE deck. Keep signal flow left-to-right, feedback outside the amplifier body and all connections on the native grid.

For a worked exercise, add `solution` metadata with the expected value, tolerance, explanation and a supported `verification` measurement. The existing ngspice audit then validates it automatically. Extend native import/browser validation so the displayed circuit is checked too. The native circuit document is ordinary upstream data, not a new rendering or connectivity implementation.

For authoritative design grading, implement a server-owned verifier and topology contract. Public solution data or user-authored templates cannot register executable grader logic. The existing `/problems/new` authoring form remains a source-controlled JSON template workflow.

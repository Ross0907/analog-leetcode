# Waveform instruments

`ScopeResult` in `app/components/simulation-console.tsx` accepts the shared `SimulationPayload` contract. It displays captures from the upstream CircuitJS1 engine and results from the existing EEcircuit/ngspice WebAssembly worker. Neither the viewer nor the FFT module evaluates a circuit or supplies fallback waveforms.

## Probes and analyses

- The result contract accepts voltage and current traces, stable IDs, descriptive names, optional node associations, and optional colors. Voltages and currents use separate plots and scales. Colors otherwise derive from stable probe identity.
- Up to 32 probes are accepted. Requests above this limit fail visibly. No fifth probe is silently discarded. An unavailable requested ngspice node or source current is an error; the normalizer never substitutes a different node.
- ngspice supports operating point, transient, DC sweep, and complex AC results. AC plots show magnitude in dB relative to 1 V (or 1 A) and unwrapped phase. A unit AC source is needed when interpreting node magnitude as voltage gain. The normalizer retains actual source/inductor branch currents provided by ngspice; requesting an unavailable device current produces an error.
- All trace arrays must match the result axis and contain finite numbers. Transient time and AC frequency must increase. The existing ngspice resource bounds and isolated worker timeout remain in place.
- The worker prepends a comment title before sending a deck to ngspice. SPICE reserves its first line for a title; this preserves voltage sources that are the first line of older challenge decks.
- Users can rename, hide, remove, and restore result traces. These controls change the displayed capture. Native editor probe controls change which nodes are acquired in the next capture.

## Oscilloscope

The timebase selector, zoom buttons, horizontal position slider, and Shift-drag/middle-drag pan inspect the captured record. Vertical scale and autoscale are available per physical unit. Dragging the plot moves its nearest time cursor. Arrow keys move cursor A; Alt+arrows move cursor B. Time cursors show delta time, reciprocal delta time, and each visible trace's interpolated B-minus-A amplitude. Independent amplitude cursors display a vertical difference. A trigger channel, level, and rising/falling edge identify crossings in the recorded waveform; **Find first edge** centers the capture on an existing crossing. This is a post-capture trigger search, not hardware acquisition triggering.

For time records, minimum, maximum, peak-to-peak, mean, and RMS use the visible samples. Mean and RMS integrate the piecewise-linear waveform over actual time intervals, avoiding sample-density bias from adaptive SPICE timesteps. Period and midpoint-threshold duty estimates require at least two complete consistent periods, three rising crossings, and more than eight samples per cycle at the largest interval. Undersampled, nonperiodic, constant, and invalid records show unavailable values. Frequency-domain plots do not present RMS/mean of dB or phase as physical waveform measurements.

## FFT

The spectrum uses the established MIT-licensed [`fft.js`](https://github.com/indutny/fft.js) transform. The user selects the captured channel, power-of-two record length (64–32768), Rectangular/Hann/Hamming/Blackman window, DC removal, linear/log frequency, linear/dB peak magnitude, frequency span, and marker. Record lengths use the final portion of the capture. There is no zero padding that could suggest additional measured resolution.

Uniform captures retain their original sample spacing. Adaptive records are explicitly interpolated at the largest recorded time interval, with a visible interpolation warning. The transform refuses a record too short for the requested length at that interval. Frequency resolution is sample rate divided by FFT length; Nyquist is half the sample rate. Magnitude is one-sided peak amplitude with coherent window gain correction; DC and Nyquist bins are not doubled. dB is relative to one trace unit, clamped at −300 dB for display.

The dominant bin is reported only for a resolved signal with at least three cycles and sufficient samples per cycle. THD, SNR, SINAD, SFDR, and harmonic amplitudes are deliberately gated: a uniform coherent periodic capture, Rectangular window, at least 256 samples, at least eight cycles, and at least 16 samples per cycle. THD includes harmonics 2–5 below Nyquist. SNR, SINAD, and SFDR compare spectral power; the Nyquist bin receives its full RMS energy, since its samples do not have a separate negative-frequency partner. Residual power and spurs below the numerical floor return unavailable ratios rather than infinite SNR. These metrics characterize the simulated capture, not a hardware noise specification. Other records explain why the metrics are unavailable.

## Validation

`tests/waveform-analysis.test.mts` checks analytical ramp integration on adaptive time intervals, sine frequency and duty, cursor interpolation, all four window gains, DC/Nyquist normalization, known harmonic distortion, sparse/noncoherent record guards, and stable colors. `tests/simulator-results.test.mts` checks 32 simultaneous nodes, exact sample preservation, current units, missing node and invalid-axis errors, DC sweeps, and complex AC phase unwrapping. `tests/simulator-policy.test.mts` retains deck-containment and output-bound tests.

The result tests also execute the actual ngspice WebAssembly engine on 32 independent divider nodes and an untitled source-first deck. `tests/e2e/instruments.spec.ts` exercises native CircuitJS captures, multiple ngspice voltage/current probes, Bode plots, trace management, and FFT controls in a browser.

The upstream [ngspice manual](https://ngspice.sourceforge.io/docs/ngspice-manual.pdf) documents voltage-source branch currents as `i(source)` / `source#branch`; the adapter accepts those actual result-vector forms.

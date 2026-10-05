import type { Challenge } from './challenges';

const native = (body: string) => `$ 1 1e-7 10.2 50 5 50\n${body}\n`;
const common = { difficulty: 'Intermediate', acceptance: null, attempts: 0, available: true, judge: null, starterMode: 'connected', domain: 'AC', probe: 'out', recommendedProbes: ['vin', 'out'] } as const;
const pulse = [{ timeS: 0, value: 0 }, { timeS: .0001, value: 0 }, { timeS: .0001001, value: 5 }, { timeS: .0016, value: 5 }, { timeS: .0016001, value: 0 }, { timeS: .004, value: 0 }];

export const measurementChallenges: Challenge[] = [
  {
    ...common, recommendedProbes: [...common.recommendedProbes], id: 42, slug: 'rc-pulse-rise-recovery', title: 'Balance pulse rise and recovery', xp: 260,
    summary: 'Tune an RC time constant against both edges of a finite pulse.',
    objective: 'A 5 V pulse rises at 0.1 ms and falls at 1.6 ms. With R=10 kΩ, choose C so the output is 4.4–4.6 V at 1.2 ms and below 0.45 V at 2.8 ms. Use both cursors to inspect charging and recovery.',
    analysis: 'Transient', topics: ['Time constant', 'Pulse response', 'Recovery'], prerequisites: ['rc-charge-one-tau'],
    constraints: ['Keep R=10 kΩ and the supplied input pulse.', 'Choose C between 10 nF and 220 nF; starter C=100 nF.', 'Run a fresh 4 ms record including both input edges.'],
    nativeCircuit: native('v 112 352 112 128 0 0 40 0 0 0 .5\nr 112 128 352 128 0 10000\nc 352 128 352 352 0 1e-7 0\ng 112 352 112 384 0\ng 352 352 352 384 0\n207 112 128 112 80 0 vin\n207 352 128 432 128 0 out'),
    starterNetlist: 'V1 vin 0 PWL(0 0 .1m 0 .1001m 5 1.6m 5 1.6001m 0 4m 0)\nR1 vin out 10k\nC1 out 0 100n\n.tran .5u 4m\n.end',
    analysisDefaults: { type: 'transient', duration: .004, samples: 16384, sourceOverrides: { 0: { type: 'pwl', points: pulse } } },
    designChecks: [{ id: 'rise', label: 'Charging at 1.2 ms', node: 'out', analysis: 'transient', kind: 'sample', at: .0012, min: 4.4, max: 4.6, unit: 'V' }, { id: 'fall', label: 'Recovery at 2.8 ms', node: 'out', analysis: 'transient', kind: 'sample', at: .0028, min: 0, max: .45, unit: 'V' }],
  },
  {
    ...common, recommendedProbes: [...common.recommendedProbes], id: 43, slug: 'rlc-step-damping', title: 'Damp an RLC step response', xp: 300,
    summary: 'Remove ringing without making a second-order circuit settle too slowly.',
    objective: 'A 5 V step drives a series resistor and 10 mH inductor into a 1 µF capacitor. Tune R so the output never exceeds 5.05 V and reaches 4.98–5.02 V at 1.1 ms. Compare the underdamped starter with a critically damped response.',
    analysis: 'Transient', topics: ['Damping', 'Overshoot', 'Settling'], prerequisites: ['rl-current-rise'],
    constraints: ['Keep L=10 mH, C=1 µF and the input step at 0.1 ms.', 'Choose R between 20 Ω and 400 Ω; starter R=20 Ω.', 'Ideal passive elements; parasitic resistance is not included.'],
    nativeCircuit: native('v 112 352 112 128 0 0 40 0 0 0 .5\nr 112 128 304 128 0 20\nl 304 128 496 128 0 .01 0\nc 496 128 496 352 0 1e-6 0\ng 112 352 112 384 0\ng 496 352 496 384 0\n207 112 128 112 80 0 vin\n207 496 128 576 128 0 out'),
    starterNetlist: 'V1 vin 0 PWL(0 0 .1m 0 .1001m 5 2m 5)\nR1 vin mid 20\nL1 mid out 10m\nC1 out 0 1u\n.tran .2u 2m\n.end',
    analysisDefaults: { type: 'transient', duration: .002, samples: 16384, sourceOverrides: { 0: { type: 'pwl', points: [{ timeS: 0, value: 0 }, { timeS: .0001, value: 0 }, { timeS: .0001001, value: 5 }, { timeS: .002, value: 5 }] } } },
    designChecks: [{ id: 'overshoot', label: 'Full step excursion', node: 'out', analysis: 'transient', kind: 'peak-to-peak', from: 0, to: .0019, min: 4.98, max: 5.05, unit: 'V' }, { id: 'settled', label: 'Settled output at 1.1 ms', node: 'out', analysis: 'transient', kind: 'sample', at: .0011, min: 4.98, max: 5.02, unit: 'V' }],
  },
  {
    ...common, recommendedProbes: [...common.recommendedProbes], id: 44, slug: 'highpass-signal-rejection', title: 'Separate drift from useful signal', xp: 260,
    summary: 'Design a high-pass filter from measured passband and rejection requirements.',
    objective: 'With C=100 nF, tune R so the gain at 100 Hz is 0.09–0.11 V/V while the gain at 10 kHz is at least 0.99 V/V. Use the AC sweep magnitude and phase cursors; distinguish the cutoff from the passband.',
    analysis: 'AC sweep', topics: ['High-pass filter', 'Bode response', 'Signal rejection'], prerequisites: ['rc-high-pass'],
    constraints: ['Keep C=100 nF and AC excitation at 1 V.', 'Choose R between 100 Ω and 100 kΩ; starter R=10 kΩ.', 'Sweep 10 Hz to 100 kHz.'],
    nativeCircuit: native('v 112 352 112 128 0 1 1000 1 0 0 .5\nc 112 128 352 128 0 1e-7 0\nr 352 128 352 352 0 10000\ng 112 352 112 384 0\ng 352 352 352 384 0\n207 112 128 112 80 0 vin\n207 352 128 432 128 0 out'),
    starterNetlist: 'V1 vin 0 AC 1\nC1 vin out 100n\nR1 out 0 10k\n.ac dec 100 10 100k\n.end',
    analysisDefaults: { type: 'ac-sweep', startHz: 10, stopHz: 1e5, acPoints: 100, acSource: 0, acMagnitude: 1 },
    designChecks: [{ id: 'reject', label: '100 Hz rejection', node: 'out', analysis: 'ac', kind: 'sample', at: 100, min: .09, max: .11, unit: 'V/V' }, { id: 'pass', label: '10 kHz passband', node: 'out', analysis: 'ac', kind: 'sample', at: 10000, min: .99, max: 1.001, unit: 'V/V' }],
  },
  {
    ...common, recommendedProbes: [...common.recommendedProbes], id: 45, slug: 'notch-unwanted-tone', title: 'Notch an unwanted 5 kHz tone', xp: 320,
    summary: 'Tune a shunt LC trap while preserving frequencies on both sides of the notch.',
    objective: 'A 1 kΩ source resistor feeds a series 10 mH LC branch to ground. Tune C so output gain at 5 kHz is below 0.02 V/V, while gain at 100 Hz exceeds 0.99 and at 50 kHz exceeds 0.94. Inspect the notch and phase transition in the AC sweep.',
    analysis: 'AC sweep', topics: ['Notch filter', 'Series resonance', 'Frequency selectivity'], prerequisites: ['rlc-bandpass-selectivity'],
    constraints: ['Keep R=1 kΩ and L=10 mH; AC source amplitude is 1 V.', 'Choose C between 10 nF and 1 µF; starter C=10 nF.', 'Ideal LC trap with unloaded output; component loss would limit notch depth.'],
    nativeCircuit: native('v 112 416 112 128 0 1 5000 1 0 0 .5\nr 112 128 352 128 0 1000\nl 352 128 352 272 0 .01 0\nc 352 272 352 416 0 1e-8 0\ng 112 416 112 448 0\ng 352 416 352 448 0\n207 112 128 112 80 0 vin\n207 352 128 432 128 0 out'),
    starterNetlist: 'V1 vin 0 AC 1\nR1 vin out 1k\nL1 out mid 10m\nC1 mid 0 10n\n.ac dec 160 100 100k\n.end',
    analysisDefaults: { type: 'ac-sweep', startHz: 100, stopHz: 1e5, acPoints: 160, acSource: 0, acMagnitude: 1 },
    designChecks: [{ id: 'notch', label: '5 kHz notch', node: 'out', analysis: 'ac', kind: 'sample', at: 5000, min: 0, max: .02, unit: 'V/V' }, { id: 'low', label: '100 Hz transmission', node: 'out', analysis: 'ac', kind: 'sample', at: 100, min: .99, max: 1.001, unit: 'V/V' }, { id: 'high', label: '50 kHz transmission', node: 'out', analysis: 'ac', kind: 'sample', at: 50000, min: .94, max: 1.001, unit: 'V/V' }],
  },
];

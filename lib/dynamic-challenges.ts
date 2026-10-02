import type { Challenge } from './challenges';

const native = (body: string) => `$ 1 1e-7 10.2 50 5 50\n${body}\n`;
const common = { difficulty: 'Advanced', acceptance: null, attempts: 0, available: true, judge: null, starterMode: 'connected', preferredInstrument: 'scope' } as const;

export const dynamicChallenges: Challenge[] = [
  {
    ...common, id: 39, slug: 'reject-short-input-glitch', title: 'Reject a short input glitch', domain: 'AC', xp: 280,
    summary: 'Choose a capacitor from the measured response to a finite pulse, including recovery after the pulse.',
    objective: 'A 5 V interference pulse lasts 200 µs after t=1 ms. With R=10 kΩ, choose C so the filtered peak is below 1.0 V, but the output has fallen below 0.45 V by t=2 ms. Measure both the input pulse and output recovery from a fresh record.',
    analysis: 'Transient', topics: ['Pulse response', 'RC filtering', 'Recovery time'], prerequisites: ['rc-charge-one-tau'],
    constraints: ['Keep the 0–5 V, 200 µs test pulse and 10 kΩ resistor.', 'Choose C between 10 nF and 220 nF; the 10 nF starter admits too much interference.', 'A smaller peak alone is insufficient: check recovery as well.'],
    nativeCircuit: native('v 112 352 112 128 0 0 40 0 0 0 .5\nr 112 128 352 128 0 10000\nc 352 128 352 352 0 1e-8 0\ng 112 352 112 384 0\ng 352 352 352 384 0\n207 112 128 112 80 0 vin\n207 352 128 432 128 0 out'),
    starterNetlist: 'V1 vin 0 PWL(0 0 1m 0 1.0001m 5 1.2m 5 1.2001m 0 3m 0)\nR1 vin out 10k\nC1 out 0 10n\n.tran 1u 3m\n.end',
    probe: 'out', recommendedProbes: ['vin', 'out'], acquisitionMode: 'restart-record',
    analysisDefaults: { duration: .003, samples: 8192, sourceOverrides: { 0: { type: 'pwl', points: [{ timeS: 0, value: 0 }, { timeS: .001, value: 0 }, { timeS: .0010001, value: 5 }, { timeS: .0012, value: 5 }, { timeS: .0012001, value: 0 }, { timeS: .003, value: 0 }] } } },
    designChecks: [{ id: 'peak', label: 'Filtered pulse excursion', node: 'out', analysis: 'transient', kind: 'peak-to-peak', from: 0, to: .0012001, min: 0, max: 1, unit: 'V' }, { id: 'recovery', label: 'Recovery at 2 ms', node: 'out', analysis: 'transient', kind: 'sample', at: .002, min: 0, max: .45, unit: 'V' }],
  },
  {
    ...common, id: 40, slug: 'rlc-bandpass-selectivity', title: 'Tune a resonant band-pass', domain: 'AC', xp: 320,
    summary: 'Tune an RLC resonance while measuring the passband and far-stopband response.',
    objective: 'A series 100 mH inductor and capacitor drive a 1 kΩ load. Tune C for gain of at least 0.99 V/V at 5 kHz and at most 0.04 V/V at 50 kHz. Plot the AC sweep and relate the peak width to series resistance.',
    analysis: 'AC sweep', topics: ['Resonance', 'RLC filter', 'Selectivity'], prerequisites: ['rl-low-pass', 'rc-high-pass'],
    constraints: ['Keep L=100 mH and R=1 kΩ; ideal components are used.', 'Choose C between 1 nF and 100 nF, starting from 4.7 nF.', 'Source AC amplitude is 1 V; measure output across R.'],
    nativeCircuit: native('v 96 352 96 128 0 1 5000 1 0 0 .5\nl 96 128 288 128 0 .1 0\nc 288 128 480 128 0 4.7e-9 0\nr 480 128 480 352 0 1000\ng 96 352 96 384 0\ng 480 352 480 384 0\n207 96 128 96 80 0 vin\n207 480 128 560 128 0 out'),
    starterNetlist: 'V1 vin 0 AC 1\nL1 vin mid 100m\nC1 mid out 4.7n\nR1 out 0 1k\n.ac dec 100 100 100k\n.end',
    probe: 'out', recommendedProbes: ['vin', 'out'], analysisDefaults: { duration: .001, startHz: 100, stopHz: 1e5, acPoints: 100, acSource: 0, acMagnitude: 1 },
    designChecks: [{ id: 'pass', label: '5 kHz passband gain', node: 'out', analysis: 'ac', kind: 'sample', at: 5000, min: .99, max: 1.001, unit: 'V/V' }, { id: 'stop', label: '50 kHz stopband gain', node: 'out', analysis: 'ac', kind: 'sample', at: 50000, min: 0, max: .04, unit: 'V/V' }],
  },
  {
    ...common, id: 41, slug: 'buffered-antialias-poles', title: 'Make two filter poles work together', domain: 'Op-amps', xp: 350,
    summary: 'Compare two buffered RC sections with one pole and verify both useful signal and unwanted input attenuation.',
    objective: 'The first 10 kΩ/10 nF section drives a unity-gain buffer and a second 10 kΩ RC section. Tune the second capacitor so gain at 1 kHz remains 0.65–0.80 V/V and gain at 20 kHz is below 0.01 V/V. Confirm the buffer isolates the two sections.',
    analysis: 'AC sweep', topics: ['Anti-alias filtering', 'Cascaded poles', 'Buffer isolation'], prerequisites: ['wire-antialias-filter', 'buffer-isolation'], recommendedBlocks: ['AntiAliasRC'],
    constraints: ['Keep both resistors at 10 kΩ and C1 at 10 nF.', 'Change C2 from 1 nF; use 1–100 nF.', 'The bounded ideal amplifier has gain 100000; no bandwidth or noise model is claimed.'],
    nativeCircuit: native('v 112 352 112 128 0 1 1000 1 0 0 .5\nr 112 128 288 128 0 10000\nc 288 128 288 352 0 1e-8 0\ng 112 352 112 384 0\ng 288 352 288 384 0\nw 288 128 352 128 0\nw 352 128 352 160 0\nw 352 160 400 160 0\na 400 144 560 144 8 15 -15 1000000 0 0 100000\nw 400 128 400 64 0\nw 400 64 560 64 0\nw 560 64 560 144 0\nr 560 144 736 144 0 10000\nc 736 144 736 352 0 1e-9 0\ng 736 352 736 384 0\n207 112 128 112 80 0 vin\n207 288 128 288 80 0 first\n207 560 144 608 96 0 buffer\n207 736 144 816 144 0 out'),
    starterNetlist: 'V1 vin 0 AC 1\nR1 vin first 10k\nC1 first 0 10n\nE1 buffer 0 first buffer 100000\nR2 buffer out 10k\nC2 out 0 1n\n.ac dec 100 10 100k\n.end',
    probe: 'out', recommendedProbes: ['vin', 'first', 'out'], analysisDefaults: { duration: .005, startHz: 10, stopHz: 1e5, acPoints: 100, acSource: 0, acMagnitude: 1 },
    designChecks: [{ id: 'signal', label: '1 kHz useful signal', node: 'out', analysis: 'ac', kind: 'sample', at: 1000, min: .65, max: .8, unit: 'V/V' }, { id: 'alias', label: '20 kHz attenuation', node: 'out', analysis: 'ac', kind: 'sample', at: 20000, min: 0, max: .01, unit: 'V/V' }],
  },
];

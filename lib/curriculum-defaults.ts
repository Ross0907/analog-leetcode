import type { Challenge } from './challenges';
import type { NativeAnalysisSettings } from './circuitjs-analysis';
import { CIRCUITJS_STARTERS } from './circuitjs-starters';
import { textbookLessonSources } from './native-lesson-format';

const step = (high: number, edge: number, end: number) => ({ type: 'pwl' as const, points: [{ timeS: 0, value: 0 }, { timeS: edge, value: high }, { timeS: end, value: high }] });
const overrides: Record<string, Partial<NativeAnalysisSettings>> = {
  'diode-rectifier-ripple': { duration: .5, samples: 32768, models: { 2: 'rectifier' } },
  'mosfet-gate-drive': { duration: 300e-9, samples: 4096, sourceOverrides: { 0: step(10, 2e-9, 300e-9) } },
  'rc-charge-one-tau': { duration: .005, samples: 8192, sourceOverrides: { 0: step(5, 1e-9, .005) } },
  'rl-current-rise': { duration: .005, samples: 8192, sourceOverrides: { 0: step(5, 1e-9, .005) } },
  'adc-acquisition-settling': { duration: 2e-6, samples: 8192, sourceOverrides: { 0: step(3.3, 1e-12, 2e-6) } },
  'sample-hold-droop': { duration: .0015, samples: 8192, sourceOverrides: { 4: { type: 'pwl', points: [{ timeS: 0, value: 5 }, { timeS: .001, value: 5 }, { timeS: .001000001, value: 0 }, { timeS: .0015, value: 0 }] } } },
  'practical-integrator': { duration: .05, startHz: 1, stopHz: 1e5 },
  'sallen-key-q': { duration: .005, startHz: 100, stopHz: 1e5 },
  'transimpedance-stability': { duration: 100e-6, startHz: 10, stopHz: 1e7, acSource: 0, acMagnitude: 1e-6 },
  'cmos-inverter-trip-point': { duration: .002, dcSource: 6, dcStart: 0, dcStop: 1.8, dcStep: .01, models: { 0: 'generic-pmos-90nm', 1: 'generic-nmos-90nm' } },
  'lm741-tia-compensation': { duration: 100e-6 },
};

/** Lesson settings describe a measurement window; they do not replace the circuit. */
export function applyCurriculumDefaults(challenge: Challenge): Challenge {
  const type = { 'Operating point': 'operating-point', 'AC sweep': 'ac-sweep', 'Transient': 'transient', 'DC sweep': 'dc-sweep' }[challenge.analysis] as NativeAnalysisSettings['type'];
  return {
    ...challenge,
    nativeCircuit: textbookLessonSources(challenge.nativeCircuit ?? CIRCUITJS_STARTERS[challenge.slug]),
    analysisDefaults: { type, duration: challenge.analysis === 'Operating point' ? .001 : .005, samples: 8192, startHz: 10, stopHz: 1e5, acPoints: 60, acScale: 'decade', dcStart: 0, dcStop: 5, dcStep: .01, ...overrides[challenge.slug], ...challenge.analysisDefaults },
    preferredInstrument: challenge.preferredInstrument ?? (challenge.analysis === 'Operating point' || ['transimpedance-stability', 'lm741-tia-compensation'].includes(challenge.slug) ? 'dc' : 'scope'),
    acquisitionMode: challenge.acquisitionMode ?? (challenge.analysis === 'Transient' ? 'restart-record' : 'live'),
    recommendedProbes: challenge.recommendedProbes ?? [challenge.probe],
  };
}

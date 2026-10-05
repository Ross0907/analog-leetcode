import type { Challenge } from '../../lib/challenges';
import { evaluateDesignChecks } from '../../lib/design-checks';
import type { SimulationPayload } from '../../lib/simulator-contract';

// These edits are made to native documents before CircuitJS imports and solves
// them. They are never injected into the compiled SPICE deck or learner UI.
const edits: Record<string, [string, string][]> = {
  'rc-pulse-rise-recovery': [['c 352 128 352 352 0 1e-7 0', 'c 352 128 352 352 0 4.7e-8 0']],
  'rlc-step-damping': [['r 112 128 304 128 0 20', 'r 112 128 304 128 0 200']],
  'highpass-signal-rejection': [['r 352 128 352 352 0 10000', 'r 352 128 352 352 0 1590']],
  'notch-unwanted-tone': [['c 352 272 352 416 0 1e-8 0', 'c 352 272 352 416 0 1e-7 0']],
  'diode-rectifier-ripple': [['c 400 128 400 352 0 0.00022 0', 'c 400 128 400 352 0 0.001 0']],
  'pipeline-residue-block': [['r 352 112 512 112 0 19000', 'r 352 112 512 112 0 20000']],
  'r2r-dac-settling-budget': [['c 128 128 128 16 0 2.2e-10 0', 'c 128 128 128 16 0 1e-10 0']],
  'sar-conversion-sequence': [['207 352 416 272 416 0 vin', '207 352 416 272 416 0 dac'], ['207 352 448 272 448 0 dac', '207 352 448 272 448 0 vin']],
  'delta-sigma-output-filter': [['c 352 128 352 320 0 2.2e-7 0', 'c 352 128 352 320 0 1e-6 0']],
  'lm741-tia-compensation': [['c 352 160 512 160 0 2e-12 0', 'c 352 160 512 160 0 1e-10 0']],
  'flash-adc-threshold-calibration': [['v 240 288 384 288 0 0 40 .02 0 0 .5', 'v 240 288 384 288 0 0 40 0 0 0 .5']],
  'reject-short-input-glitch': [['c 352 128 352 352 0 1e-8 0', 'c 352 128 352 352 0 1e-7 0']],
  'rlc-bandpass-selectivity': [['c 288 128 480 128 0 4.7e-9 0', 'c 288 128 480 128 0 1e-8 0']],
  'buffered-antialias-poles': [['c 736 144 736 352 0 1e-9 0', 'c 736 144 736 352 0 1e-8 0']],
};
const wires = '\nw 96 128 240 128 0\nw 368 128 368 192 0\nw 368 192 432 192 0\nw 96 288 96 384 0\nw 432 320 432 384 0\nw 432 192 512 192 0\n';

export function curriculumVariants(challenge: Challenge) {
  const starter = challenge.nativeCircuit!;
  if (challenge.starterMode === 'parts-only') return [{ name: 'disconnected', circuit: starter, incomplete: true }, { name: 'wired', circuit: starter + wires, incomplete: false }];
  const variants = [{ name: 'starter', circuit: starter, incomplete: false }];
  if (edits[challenge.slug]) {
    let solved = starter;
    for (const [from, to] of edits[challenge.slug]) {
      if (!solved.includes(from)) throw Error('Native solution fixture no longer matches ' + challenge.slug + ': ' + from);
      solved = solved.replace(from, to);
    }
    variants.push({ name: 'solution', circuit: solved, incomplete: false });
  }
  if (challenge.slug === 'bjt-bias-across-beta') for (const beta of [80, 240]) variants.push({ name: 'beta-' + beta, circuit: starter.replace('0 1 0 0 120 default', '0 1 0 0 ' + beta + ' default'), incomplete: false });
  return variants;
}

export function measurement(result: SimulationPayload, node: string, at?: number) {
  const check = evaluateDesignChecks([{ id: 'value', label: node, node, analysis: result.analysis, kind: 'sample', at, min: -1e12, max: 1e12, unit: 'V' }], result)[0];
  if (check.measured === null) throw Error(node + ': ' + check.message);
  return check.measured;
}

export function verifyCurriculumAnswer(challenge: Challenge, result: SimulationPayload, variant: string) {
  const require = (condition: boolean, message: string) => { if (!condition) throw Error(challenge.slug + '/' + variant + ': ' + message); };
  if (challenge.solution) {
    const verification = challenge.solution.verification;
    const raw = (verification.sumNodes ?? [verification.node]).reduce((sum, node) => sum + measurement(result, node, verification.at), 0);
    const answer = raw * (verification.scale ?? 1) + (verification.offset ?? 0);
    require(Math.abs(answer - challenge.solution.value) <= Math.abs(challenge.solution.value) * challenge.solution.tolerance, `actual native answer ${answer} differs from worked answer ${challenge.solution.value}`);
    return [{ quantity: challenge.solution.quantity, value: answer }];
  }
  if (challenge.designChecks?.length) {
    const checks = evaluateDesignChecks(challenge.designChecks, result);
    require(checks.every(check => check.measured !== null), JSON.stringify(checks));
    require(checks.every(check => check.passed) === (variant === 'solution'), 'design target state: ' + JSON.stringify(checks));
    if (challenge.slug === 'diode-rectifier-ripple') {
      const current = result.traces.find(trace => trace.quantity === 'current' && /v1/i.test(trace.name));
      require(Boolean(current), 'missing actual source-current waveform');
      require(current!.values.every(value => Math.abs(value) <= 3), 'source/diode surge exceeds 3 A');
    }
    return checks;
  }
  switch (challenge.slug) {
    case 'precision-voltage-divider': case 'wire-adc-reference': require(Math.abs(measurement(result, 'vout') - 2.5) < .001, 'divider voltage'); break;
    case 'rc-cutoff-1khz': case 'wire-antialias-filter': require(Math.abs(measurement(result, 'vout', 1000) - Math.SQRT1_2) < .005, 'filter cutoff'); break;
    case 'inverting-gain-stage': require(Math.abs(measurement(result, 'vout') + 1) < .001, 'inverting output'); break;
    case 'bjt-bias-across-beta': {
      const vc = measurement(result, 'vc'), ve = measurement(result, 've'), vb = measurement(result, 'vb');
      const ic = (12 - vc) / 3300;
      require(vc - ve >= 4 && vc - ve <= 8 && ic >= .001 && ic <= .0025, 'bias outside active design window');
      require((12-vc)**2/3300 < .1 && ve**2/1000 < .1 && (12-vb)**2/68000 < .1 && vb**2/15000 < .1, 'resistor power');
      return [{ quantity: 'VCE', value: vc - ve }, { quantity: 'IC', value: ic }];
    }
    case 'mosfet-gate-drive': {
      const trace = result.traces.find(trace => trace.node === 'gate' && trace.quantity === 'voltage')!;
      const crossing = (voltage: number) => { const index = trace.values.findIndex(value => value >= voltage); require(index > 0, 'missing charging edge'); return result.x[index-1] + (result.x[index]-result.x[index-1]) * (voltage-trace.values[index-1]) / (trace.values[index]-trace.values[index-1]); };
      const rise = crossing(9) - crossing(1);
      require(rise >= 20e-9 && rise <= 80e-9, '10–90% rise time ' + rise);
      const current = result.traces.find(trace => trace.quantity === 'current' && /v1/i.test(trace.name));
      require(Boolean(current) && current!.values.every(value => Math.abs(value) <= 1), 'peak drive current');
      return [{ quantity: '10–90% rise time', value: rise }];
    }
    case 'sallen-key-q': {
      const dc = measurement(result, 'out', 100), fc = 1/(2*Math.PI*2200*Math.sqrt(20e-9*10e-9));
      require(Math.abs(fc/5000-1) <= .03 && Math.abs(measurement(result, 'out', fc)/dc-Math.SQRT1_2) < .006, 'Butterworth corner and Q');
      require(result.traces.filter(trace=>trace.node==='out' && trace.quantity==='magnitude').every(trace=>trace.values.every(value=>value <= .2)), 'peaking exceeds .2 dB');
      return [{ quantity: 'Natural frequency', value: fc }];
    }
    case 'cmos-inverter-trip-point': {
      const trace = result.traces.find(trace=>trace.node==='out' && trace.quantity==='voltage')!;
      const nearest = result.x.reduce((best,x,index)=> Math.abs(trace.values[index]-x) < Math.abs(trace.values[best]-result.x[best]) ? index : best, 0);
      const slopes = result.x.slice(1,-1).map((_,index)=>(trace.values[index+2]-trace.values[index])/(result.x[index+2]-result.x[index]));
      const boundaries = slopes.flatMap((slope,index)=> slope <= -1 ? [index+1] : []);
      const vil = result.x[boundaries[0]], vih = result.x[boundaries[boundaries.length-1]];
      require(Math.abs(result.x[nearest]-.9) <= .1, 'inverter switching point');
      require(vil-trace.values[trace.values.length-1] >= .5 && trace.values[0]-vih >= .5, 'inverter noise margins');
      return [{ quantity: 'VM', value: result.x[nearest] }, { quantity: 'NML', value: vil-trace.values[trace.values.length-1] }, { quantity: 'NMH', value: trace.values[0]-vih }];
    }
    case 'transimpedance-stability': require(Math.abs(measurement(result,'out',10)*1e6/100000-1) < .01 && Math.abs(measurement(result,'out',795775)*1e6/100000-Math.SQRT1_2) < .01, 'TIA gain and feedback pole'); break;
    default: throw Error('Missing solution witness for ' + challenge.slug);
  }
  return [{ quantity: 'Verified specification', value: measurement(result, challenge.probe, result.analysis==='ac' ? 1000 : undefined) }];
}

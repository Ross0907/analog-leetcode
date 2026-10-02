import type { SimulationPayload } from './simulator-contract';

export type DesignCheck = {
  id: string; label: string; node: string; analysis: 'dc' | 'transient' | 'ac';
  kind: 'sample' | 'mean' | 'peak-to-peak'; at?: number; from?: number; to?: number;
  min: number; max: number; unit: string; scale?: number;
};
export type DesignCheckResult = { id: string; label: string; passed: boolean; measured: number | null; unit: string; message: string };
const key = (name: string) => name.toLowerCase().replace(/^v\((.*)\)$/, '$1');

/** Local learning feedback only: never used as authenticated/authoritative grading. */
export function evaluateDesignChecks(checks: readonly DesignCheck[], result: SimulationPayload): DesignCheckResult[] {
  return checks.map(check => {
    const base = { id: check.id, label: check.label, unit: check.unit };
    try {
      if (result.analysis !== check.analysis) throw Error(`Run ${check.analysis === 'dc' ? 'operating-point' : check.analysis} analysis for this check.`);
      let measured: number;
      if (check.analysis === 'dc') {
        const point = result.operatingPoint.find(point => key(point.name) === key(check.node));
        if (!point) throw Error(`Probe ${check.node} and run again.`);
        measured = point.value;
      } else {
        const trace = result.traces.find(trace => key(trace.node ?? trace.name) === key(check.node) && (check.analysis === 'ac' ? trace.quantity === 'magnitude' : trace.quantity === 'voltage'));
        if (!trace || !result.x.length) throw Error(`Probe ${check.node} and run again.`);
        const values = trace.values.map(value => check.analysis === 'ac' && trace.unit === 'dB' ? 10 ** (value / 20) : value);
        const sample = (at: number) => {
          if (at < result.x[0] || at > result.x[result.x.length - 1]) throw Error('Extend the analysis to cover the measurement interval.');
          const next = result.x.findIndex(value => value >= at);
          if (next <= 0 || result.x[next] === at) return values[Math.max(next, 0)];
          const fraction = (at - result.x[next - 1]) / (result.x[next] - result.x[next - 1]);
          return values[next - 1] + fraction * (values[next] - values[next - 1]);
        };
        if (check.kind === 'sample') measured = sample(check.at ?? result.x[result.x.length - 1]);
        else {
          const from = check.from ?? result.x[0], to = check.to ?? result.x[result.x.length - 1];
          if (to <= from) throw Error('Invalid measurement interval.');
          const points = [{ x: from, y: sample(from) }, ...result.x.flatMap((x, index) => x > from && x < to ? [{ x, y: values[index] }] : []), { x: to, y: sample(to) }];
          if (check.kind === 'peak-to-peak') {
            const extrema = points.reduce((range, point) => ({ min: Math.min(range.min, point.y), max: Math.max(range.max, point.y) }), { min: Infinity, max: -Infinity });
            measured = extrema.max - extrema.min;
          }
          else measured = points.slice(1).reduce((area, point, index) => area + (point.x - points[index].x) * (point.y + points[index].y) / 2, 0) / (to - from);
        }
      }
      measured *= check.scale ?? 1;
      if (!Number.isFinite(measured)) throw Error('The solver did not produce a finite measurement.');
      const passed = measured >= check.min && measured <= check.max;
      return { ...base, measured, passed, message: `${measured.toPrecision(5)} ${check.unit}; target ${check.min}–${check.max} ${check.unit}` };
    } catch (error) { return { ...base, measured: null, passed: false, message: error instanceof Error ? error.message : 'Measurement unavailable.' }; }
  });
}

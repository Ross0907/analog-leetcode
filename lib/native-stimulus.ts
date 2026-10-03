import type { NativeSourceOverride } from './circuitjs-analysis';

export const MAX_STIMULUS_POINTS = 1024;
export type StimulusPoint = { timeS: number; value: number };

/** Bounded numeric waveform construction. No SPICE expressions or executable text. */
export function stimulusPoints(source: Extract<NativeSourceOverride, { type: 'pwl' | 'bitstream' }>, duration: number): StimulusPoint[] {
  if (!Number.isFinite(duration) || duration <= 0 || duration > 1e9) throw new Error('Waveform duration must be positive and finite.');
  if (source.type === 'pwl') {
    if (source.points.length < 2 || source.points.length > MAX_STIMULUS_POINTS) throw new Error('Use 2–1024 PWL points.');
    const points = source.points.map(point => ({ ...point }));
    for (let i = 0; i < points.length; i++) {
      const point = points[i];
      if (!Number.isFinite(point.timeS) || point.timeS < 0 || point.timeS > 1e9 || !Number.isFinite(point.value) || Math.abs(point.value) > 1e6 || (i > 0 && point.timeS <= points[i - 1].timeS)) throw new Error('PWL times must increase strictly; times and values must be finite.');
    }
    return source.repeatPeriodS === undefined ? points : repeatPwlPoints(points, source.repeatPeriodS, duration);
  }
  const { bits, bitPeriodS, low, high, riseS, delayS = 0 } = source;
  if (!/^[01]{1,256}$/.test(bits)) throw new Error('A bitstream must contain 1–256 binary digits.');
  if (![bitPeriodS, low, high, riseS, delayS].every(Number.isFinite) || bitPeriodS <= 0 || riseS <= 0 || riseS >= bitPeriodS || delayS < 0 || Math.abs(low) > 1e6 || Math.abs(high) > 1e6 || low >= high) throw new Error('Use low < high, a positive bit period, and a rise time shorter than one bit.');
  const periods = Math.max(0, duration - delayS) / bitPeriodS;
  const count = source.repeat ? Math.max(1, Math.ceil(periods - 1e-12 * Math.max(1, periods))) : bits.length;
  if (count > 500) throw new Error('The requested duration contains more than 500 bit periods. Increase the bit period or shorten the run.');
  const level = (index: number) => bits[index % bits.length] === '1' ? high : low;
  if (source.repeat && delayS !== 0) throw new Error('Repeating bitstreams currently require a zero start delay. Use explicit PWL points for a delayed repeating sequence.');
  const initial = source.repeat ? level(bits.length - 1) : low;
  const points: StimulusPoint[] = [{ timeS: 0, value: initial }];
  let previous = initial;
  for (let i = 0; i < count; i++) {
    const timeS = delayS + i * bitPeriodS, value = level(i);
    if (value !== previous) {
      if (timeS > points[points.length - 1].timeS) points.push({ timeS, value: previous });
      points.push({ timeS: timeS + riseS, value });
      previous = value;
    }
  }
  // Every last edge ends strictly before this boundary because rise < period.
  // Adding another rise interval would stretch long-edge repeating tables.
  const end = Math.max(duration, delayS + count * bitPeriodS);
  points.push({ timeS: end, value: previous });
  return points;
}

export function repeatPwlPoints(points: StimulusPoint[], period: number, duration: number): StimulusPoint[] {
  if (!Number.isFinite(period) || period <= 0 || points[0]?.timeS !== 0 || points[points.length - 1]?.timeS !== period || points[0].value !== points[points.length - 1].value) throw new Error('A repeating PWL table must begin at 0, finish at its period, and join at the same value.');
  const cycles = Math.ceil(duration / period);
  if (!Number.isFinite(cycles) || cycles * (points.length - 1) + 1 > MAX_STIMULUS_POINTS) throw new Error('Repeated waveform exceeds 1024 points. Shorten the run or increase its period.');
  const output = points.map(point => ({ ...point }));
  for (let cycle = 1; cycle < cycles; cycle++) for (const point of points.slice(1)) output.push({ timeS: cycle * period + point.timeS, value: point.value });
  return output;
}

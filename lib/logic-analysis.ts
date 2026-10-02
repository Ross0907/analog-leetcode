export type LogicState = 0 | 1 | 'X';
/** Digital cursors hold the last accepted sample, including nonuniform solver steps. */
export function heldSampleIndex(time: readonly number[], target: number): number {
  if (time.length === 0) return -1;
  let low = 0, high = time.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (time[middle]! <= target) low = middle + 1;
    else high = middle;
  }
  return Math.max(0, low - 1);
}

export function logicPath(time: readonly number[], values: readonly number[], start: number, end: number, low: number, high: number, maximumTransitions = 6000) {
  if (time.length === 0 || !(end > start)) return { path: '', truncated: false };
  const capturedStart = Math.max(start, time[0]!), capturedEnd = Math.min(end, time.at(-1)!);
  if (!(capturedEnd >= capturedStart)) return { path: '', truncated: false };
  const position = (time: number) => 1000 * (time - start) / (end - start);
  const y = (value: number) => { const state = logicState(value, low, high); return state === 1 ? 9 : state === 0 ? 37 : 23; };
  const first = heldSampleIndex(time, capturedStart);
  const path = ['M' + position(capturedStart) + ' ' + y(values[first]!)];
  let transitions = 0;
  for (let sample = first + 1; sample < time.length && time[sample]! <= capturedEnd; sample++) {
    if (logicState(values[sample]!, low, high) === logicState(values[sample - 1]!, low, high)) continue;
    if (++transitions > maximumTransitions) return { path: path.join(' '), truncated: true };
    path.push('H' + position(time[sample]!) + 'V' + y(values[sample]!));
  }
  path.push('H' + position(capturedEnd));
  return { path: path.join(' '), truncated: false };
}

export function automaticLogicThresholds(channels: readonly (readonly number[])[]) {
  let minimum = Infinity, maximum = -Infinity;
  for (const values of channels) for (const value of values) if (Number.isFinite(value)) { minimum = Math.min(minimum, value); maximum = Math.max(maximum, value); }
  if (!(maximum > minimum)) return null;
  const span = maximum - minimum;
  return { low: minimum + span * 0.2, high: minimum + span * 0.8 };
}
export function logicState(value: number, low: number, high: number): LogicState {
  if (!Number.isFinite(value) || !Number.isFinite(low) || !Number.isFinite(high) || high <= low) return 'X';
  return value <= low ? 0 : value >= high ? 1 : 'X';
}
export function logicWord(values: readonly number[], low: number, high: number) {
  const bits = values.map((value) => logicState(value, low, high));
  if (bits.some((bit) => bit === 'X')) return { binary: [...bits].reverse().join(''), hex: 'X' };
  const value = bits.reduce<number>((word, bit, index) => word + Number(bit) * 2 ** index, 0);
  return { binary: [...bits].reverse().join(''), hex: '0x' + value.toString(16).toUpperCase().padStart(Math.ceil(bits.length / 4), '0') };
}

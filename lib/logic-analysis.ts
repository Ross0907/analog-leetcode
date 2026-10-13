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
  const empty = { path: '', unknownPath: '', unknown: [] as { start: number; end: number }[], truncated: false };
  if (!time.length || !(end > start)) return empty;
  const capturedStart = Math.max(start, time[0]!), capturedEnd = Math.min(end, time.at(-1)!);
  if (!(capturedEnd >= capturedStart)) return empty;
  const position = (t: number) => 1000 * (t - start) / (end - start);
  let state = logicState(values[heldSampleIndex(time, capturedStart)]!, low, high), began = capturedStart, transitions = 0;
  const path: string[] = [], unknownPath: string[] = [], unknown: {start:number;end:number}[] = [];
  function segment(stop: number) {
    const a = position(began), b = position(stop);
    if (state === 'X') { unknownPath.push(`M${a} 9H${b}M${a} 37H${b}`); unknown.push({start:a,end:b}); }
    else path.push(`M${a} ${state === 1 ? 9 : 37}H${b}`);
  }
  for (let i = heldSampleIndex(time, capturedStart) + 1; i < time.length && time[i]! <= capturedEnd; i++) {
    const next = logicState(values[i]!, low, high); if (next === state) continue;
    segment(time[i]!);
    if (++transitions > maximumTransitions) return {path:path.join(' '),unknownPath:unknownPath.join(' '),unknown,truncated:true};
    if (state !== 'X' && next !== 'X') path.push(`M${position(time[i]!)} ${state === 1 ? 9 : 37}V${next === 1 ? 9 : 37}`);
    state = next; began = time[i]!;
  }
  segment(capturedEnd);
  return {path:path.join(' '),unknownPath:unknownPath.join(' '),unknown,truncated:false};
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

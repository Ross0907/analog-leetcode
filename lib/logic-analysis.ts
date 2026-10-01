export type LogicState = 0 | 1 | 'X';
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

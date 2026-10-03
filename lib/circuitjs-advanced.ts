import type { CircuitJsApi, CircuitJsElement } from './circuitjs';
import type { NativeSourceOverride } from './circuitjs-analysis';
import { stimulusPoints } from './native-stimulus';

export type AdvancedCircuitJsApi = CircuitJsApi & {
  setSourceWaveform(index: number, kind: 'dc' | 'sine' | 'pwl', data: string, repeatPeriod: number): string | null;
  exportNativeBlock(name: string): string;
  insertNativeBlock(name: string): string | null;
  getAnalysisElements(): CircuitJsElement[];
};

export function applyNativeSource(api: CircuitJsApi, index: number, source: NativeSourceOverride, duration: number) {
  const advanced = api as Partial<AdvancedCircuitJsApi>;
  if (!advanced.setSourceWaveform) throw new Error('Reload the schematic to load the waveform-enabled editor.');
  let repeatPeriod = 0;
  let data: string, kind: 'dc' | 'sine' | 'pwl' = source.type === 'bitstream' ? 'pwl' : source.type;
  if (source.type === 'dc') {
    if (!Number.isFinite(source.value) || Math.abs(source.value) > 1e6) throw new Error('DC value must be finite and within ±1 MV.');
    data = String(source.value);
  } else if (source.type === 'sine') {
    const values = [source.offset, source.amplitude, source.frequencyHz, source.phaseDeg ?? 0];
    if (!values.every(Number.isFinite) || source.frequencyHz <= 0 || Math.abs(source.offset) > 1e6 || Math.abs(source.amplitude) > 1e6) throw new Error('Use finite sine settings and a positive frequency.');
    data = values.join(' ');
  } else {
    kind = 'pwl';
    if (source.type === 'bitstream' && source.repeat) repeatPeriod = source.bitPeriodS * source.bits.length;
    if (source.type === 'pwl' && source.repeatPeriodS !== undefined) repeatPeriod = source.repeatPeriodS;
    data = stimulusPoints(source, repeatPeriod || duration).flatMap(point => [point.timeS, point.value]).join(' ');
  }
  const error = advanced.setSourceWaveform(index, kind, data, repeatPeriod);
  if (error) throw new Error(error);
}

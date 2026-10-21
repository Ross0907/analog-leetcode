import { inspectFftSampling, prepareFftRecord } from './fft-sampling';
import { computeSpectrum, spectrumSignalStop, measureWaveform } from './waveform-analysis';
import type { Trace } from './simulator-contract';

/** One bounded acquisition, planned from the measured band rather than repeated doubling. */
export function automaticFftCapture(time: number[], traces: Trace[], maximumDuration = 10) {
  const sampling = inspectFftSampling(time);
  if (sampling.supportedLength < 64 || !traces.length) return null;
  const record = prepareFftRecord(time, sampling.supportedLength);
  const spectra = traces.map(trace => computeSpectrum(time, trace.values, {
    length: sampling.supportedLength, window: 'blackman-harris', removeDc: true, record,
  }));
  // Startup can spoil the first crossing interval even when the later signal
  // repeats. Use a measured steady tail to plan settling and whole periods.
  const tailStart = Math.floor(time.length / 4);
  const frequencies = spectra.flatMap((s, index) => {
    const frequency = s.periodicFrequency ?? measureWaveform(time.slice(tailStart).map((x, i) => ({ x, y: traces[index].values[tailStart + i] }))).frequency;
    return frequency && frequency > 0 ? [frequency] : [];
  });
  const fundamental = frequencies.length ? Math.min(...frequencies) : null;
  const band = spectrumSignalStop(spectra) ?? Math.max(...spectra.map(s => s.sampleRate / 2));
  const fftLength = 2 ** Math.floor(Math.log2(Math.min(131072, Math.floor(2097152 / (traces.length + 1)))));
  // Retain at least 16 samples per cycle at the measured band edge. The solver
  // may take finer adaptive steps; no interpolated bins are invented here.
  const settleDuration = Math.min(2, maximumDuration / 4, fundamental ? Math.max(sampling.duration, 20 / fundamental) : 0);
  const limit = Math.min(maximumDuration - settleDuration, Math.max(sampling.duration, fftLength / (Math.max(band, fundamental ?? 0, 1e-6) * 16)));
  const recordDuration = fundamental && limit * fundamental >= 2 ? Math.floor(limit * fundamental) / fundamental : limit;
  if (!(recordDuration > 0)) return null;
  return {
    minimumSamples: fftLength, fftLength, recordDuration, settleDuration,
    reason: `Automatic high-quality FFT: ${fftLength.toLocaleString()} measured samples over ${recordDuration.toPrecision(4)} s, after ${settleDuration.toPrecision(3)} s settling.`,
  };
}

export function detectSpectrumPeaks(frequencies: number[], amplitudes: number[], maximum = 8) {
  let largest = 0;
  for (const amplitude of amplitudes) largest = Math.max(largest, amplitude);
  if (!(largest > 1e-12) || maximum < 1) return [];
  const candidates: { index: number; frequency: number; amplitude: number; decibels: number }[] = [];
  // DC is excluded, but a real peak at Nyquist is still measurable.
  for (let i = 1; i < amplitudes.length; i++) {
    if (amplitudes[i] > largest * 1e-4 && amplitudes[i] > amplitudes[i - 1] && (i === amplitudes.length - 1 || amplitudes[i] >= amplitudes[i + 1])) {
      candidates.push({ index: i, frequency: frequencies[i], amplitude: amplitudes[i], decibels: 20 * Math.log10(amplitudes[i]) });
    }
  }
  const selected: typeof candidates = [];
  for (const peak of candidates.sort((a, b) => b.amplitude - a.amplitude)) {
    if (selected.every(p => Math.abs(p.index - peak.index) >= 4)) selected.push(peak);
    if (selected.length >= maximum) break;
  }
  return selected;
}

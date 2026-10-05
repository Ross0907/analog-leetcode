import FFT from "fft.js";
import { prepareFftRecord, type FftRecord } from './fft-sampling';

export type WaveformPoint = { x: number; y: number };
export type WindowFunction = "rectangular" | "hann" | "hamming" | "blackman" | "blackman-harris";
export type WaveformMeasurements = {
  minimum: number | null; maximum: number | null; peakToPeak: number | null;
  mean: number | null; rms: number | null; frequency: number | null; dutyCycle: number | null;
};

export function interpolateWaveform(points: readonly WaveformPoint[], x: number): number | null {
  if (points.length > 1 && points[0]!.x > points[points.length - 1]!.x) return interpolateWaveform([...points].reverse(), x);
  if (!points.length || x < points[0]!.x || x > points[points.length - 1]!.x) return null;
  let low = 0; let high = points.length - 1;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (points[middle]!.x < x) low = middle + 1;
    else high = middle;
  }
  const right = points[low]!;
  if (right.x === x || low === 0) return right.y;
  const left = points[low - 1]!;
  return left.y + (right.y - left.y) * (x - left.x) / (right.x - left.x);
}

/** Time-weighted integrals avoid biased measurements on adaptive SPICE timesteps. */
export function measureWaveform(points: readonly WaveformPoint[]): WaveformMeasurements {
  const empty = { minimum: null, maximum: null, peakToPeak: null, mean: null, rms: null, frequency: null, dutyCycle: null };
  if (!points.length || points.some((p, i) => !Number.isFinite(p.x) || !Number.isFinite(p.y) || (i > 0 && p.x <= points[i - 1]!.x))) return empty;
  let minimum = Infinity; let maximum = -Infinity; let integral = 0; let squaredIntegral = 0; let maxStep = 0;
  points.forEach((p, i) => {
    minimum = Math.min(minimum, p.y); maximum = Math.max(maximum, p.y);
    if (i === 0) return;
    const previous = points[i - 1]!; const dt = p.x - previous.x;
    maxStep = Math.max(maxStep, dt);
    integral += dt * (previous.y + p.y) / 2;
    squaredIntegral += dt * (previous.y ** 2 + previous.y * p.y + p.y ** 2) / 3;
  });
  const duration = points[points.length - 1]!.x - points[0]!.x;
  const mean = duration > 0 ? integral / duration : points[0]!.y;
  const rms = duration > 0 ? Math.sqrt(Math.max(0, squaredIntegral / duration)) : Math.abs(points[0]!.y);
  const measured = { minimum, maximum, peakToPeak: maximum - minimum, mean, rms, frequency: null, dutyCycle: null } satisfies WaveformMeasurements;
  if (points.length < 24 || maximum - minimum < Math.max(1, Math.abs(maximum), Math.abs(minimum)) * 1e-9) return measured;
  const threshold = (minimum + maximum) / 2;
  const rising = crossings(points, threshold, "rising");
  const falling = crossings(points, threshold, "falling");
  if (rising.length < 3) return measured;
  const periods = rising.slice(1).map((time, i) => time - rising[i]!);
  const sorted = [...periods].sort((a, b) => a - b); const period = sorted[Math.floor(sorted.length / 2)]!;
  if (period <= maxStep * 8 || periods.some((candidate) => Math.abs(candidate / period - 1) > 0.1)) return measured;
  let fallingIndex = 0;
  const widths = rising.slice(0, -1).flatMap((start, i) => {
    while (fallingIndex < falling.length && falling[fallingIndex]! <= start) fallingIndex++;
    const candidate = falling[fallingIndex];
    const end = candidate !== undefined && candidate < rising[i + 1]! ? candidate : undefined;
    return end === undefined ? [] : [(end - start) / periods[i]!];
  });
  const dutyCycle = widths.length === periods.length ? 100 * widths.reduce((sum, width) => sum + width, 0) / widths.length : null;
  return { ...measured, frequency: 1 / period, dutyCycle };
}

export function crossings(points: readonly WaveformPoint[], threshold: number, edge: "rising" | "falling"): number[] {
  const result: number[] = [];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!; const b = points[i]!;
    const crosses = edge === "rising" ? a.y <= threshold && b.y > threshold : a.y >= threshold && b.y < threshold;
    if (crosses && b.x > a.x) result.push(a.x + (threshold - a.y) * (b.x - a.x) / (b.y - a.y));
  }
  return result;
}

export type Spectrum = {
  frequencies: number[]; amplitudes: number[]; decibels: number[]; sampleRate: number; binWidth: number;
  length: number; dominantFrequency: number | null; thd: number | null; snr: number | null;
  sinad: number | null; sfdr: number | null; harmonics: Array<{ order: number; frequency: number; amplitude: number }>;
  warnings: string[]; metricsReason: string | null;
  recordStart: number; recordEnd: number; periodicFrequency: number | null; coherent: boolean;
  displayPeakFrequency: number | null;
};

/** A centered display crop; the full one-sided spectrum remains unchanged. */
export function centeredSpectrumSpan(spectrum: Spectrum, logarithmic = false) {
  const peak = spectrum.displayPeakFrequency;
  if (peak === null) return null;
  const nyquist = spectrum.sampleRate / 2;
  if (!(peak > 0 && peak < nyquist)) return null;
  if (logarithmic) { const ratio = Math.min(2, peak / spectrum.binWidth, nyquist / peak); return ratio > 1 ? { start: peak / ratio, stop: peak * ratio } : null; }
  const half = Math.min(peak, nyquist - peak, Math.max(peak / 2, spectrum.binWidth * 8));
  return { start: peak - half, stop: peak + half };
}

// Bounded reusable transform plans avoid rebuilding twiddle tables for every
// simultaneous probe. Transforms are synchronous; output remains per channel.
const fftPlans = new Map<number, FFT>();
function fftPlan(length: number) {
  const cached = fftPlans.get(length);
  if (cached) { fftPlans.delete(length); fftPlans.set(length, cached); return cached; }
  const plan = new FFT(length); fftPlans.set(length, plan);
  if (fftPlans.size > 2) fftPlans.delete(fftPlans.keys().next().value!);
  return plan;
}

/** A display-only band enclosing 99.9% of non-DC spectral power, with room around resolved peaks. */
export function spectrumSignalStop(spectra: readonly Spectrum[]): number | null {
  if (!spectra.length) return null;
  let stop = 0;
  const nyquist = Math.max(...spectra.map(spectrum => spectrum.sampleRate / 2));
  for (const spectrum of spectra) {
    const power = spectrum.amplitudes.map((value, index) => index ? value ** 2 * (index === spectrum.amplitudes.length - 1 ? 2 : 1) : 0);
    const total = power.reduce((sum, value) => sum + value, 0);
    if (total < 1e-24) continue;
    if (spectrum.dominantFrequency === null) return null;
    let cumulative = 0, last = power.length - 1;
    for (let index = 1; index < power.length; index++) { cumulative += power[index]!; if (cumulative >= total * .999) { last = index; break; } }
    stop = Math.max(stop, spectrum.frequencies[last]! * 2, spectrum.dominantFrequency * 3, spectrum.binWidth * 8);
  }
  return stop > 0 && stop < nyquist * .75 ? stop : null;
}

export function computeSpectrum(time: ArrayLike<number>, values: ArrayLike<number>, options: {
  length: number; window: WindowFunction; removeDc: boolean; record?: FftRecord;
}): Spectrum {
  const { length, window, removeDc } = options;
  if (!Number.isInteger(length) || length < 64 || length > 131072 || (length & (length - 1)) !== 0) throw new Error("FFT length must be a power of two from 64 to 131072.");
  if (time.length !== values.length || time.length < length) throw new Error(`Capture at least ${length} samples for this FFT length.`);
  const record = options.record?.time === time && options.record.length === length ? options.record : prepareFftRecord(time, length);
  for (let i = 0; i < values.length; i++) if (!Number.isFinite(Number(values[i]))) throw new Error('FFT requires finite samples.');
  const irregular = record.uniformStart === null, step = record.step;
  const samples = Array.from({ length }, (_, i) => {
    if (record.uniformStart !== null) return Number(values[record.uniformStart + i]);
    const left = record.left![i]!, fraction = record.fraction![i]!;
    return Number(values[left]) + (Number(values[left + 1]) - Number(values[left])) * fraction;
  });
  if (samples.some((sample) => sample === null || !Number.isFinite(sample))) throw new Error("FFT resampling exceeds the capture.");
  const mean = removeDc ? samples.reduce((sum, value) => sum + value, 0) / length : 0;
  let windowSum = 0;
  const input = samples.map((sample, i) => {
    const angle = 2 * Math.PI * i / length;
    const weight = window === "hann" ? 0.5 - 0.5 * Math.cos(angle)
      : window === "hamming" ? 0.54 - 0.46 * Math.cos(angle)
        : window === "blackman" ? 0.42 - 0.5 * Math.cos(angle) + 0.08 * Math.cos(2 * angle)
          : window === 'blackman-harris' ? .35875 - .48829 * Math.cos(angle) + .14128 * Math.cos(2 * angle) - .01168 * Math.cos(3 * angle) : 1;
    windowSum += weight;
    return (sample - mean) * weight;
  });
  const transform = fftPlan(length); const output = transform.createComplexArray();
  transform.realTransform(output, input);
  const sampleRate = 1 / step; const binWidth = sampleRate / length;
  const amplitudes = Array.from({ length: length / 2 + 1 }, (_, i) => Math.hypot(Number(output[2 * i]), Number(output[2 * i + 1])) * (i === 0 || i === length / 2 ? 1 : 2) / windowSum);
  const frequencies = amplitudes.map((_, i) => i * binWidth);
  const decibels = amplitudes.map((amplitude) => 20 * Math.log10(Math.max(amplitude, 1e-15)));
  let peak = 1;
  for (let i = 2; i < amplitudes.length; i++) if (amplitudes[i]! > amplitudes[peak]!) peak = i;
  const significant = amplitudes[peak]! > Math.max(1e-12, Math.abs(mean) * 1e-10);
  const resolved = significant && peak >= 3 && peak < length / 8;
  const dominantFrequency = resolved ? frequencies[peak]! : null;
  const warnings = irregular ? ["Adaptive timesteps were linearly resampled at the largest recorded interval. Interpolation limits high-frequency accuracy."] : [];
  warnings.push("Spectrum is one-sided peak amplitude, corrected for window gain. dB is relative to 1 trace unit; floor −300 dB.");
  const waveform = measureWaveform(samples.map((y, i) => ({ x: i * step, y })));
  const coherent = waveform.frequency !== null && Math.abs(waveform.frequency / binWidth - peak) < 0.01;
  const result: Spectrum = { frequencies, amplitudes, decibels, sampleRate, binWidth, length, dominantFrequency, displayPeakFrequency: significant ? frequencies[peak]! : null, thd: null, snr: null, sinad: null, sfdr: null, harmonics: [], warnings, metricsReason: null, recordStart: record.start, recordEnd: record.end, periodicFrequency: waveform.frequency, coherent };
  if (!resolved || !coherent || irregular || window !== "rectangular" || length < 256 || peak < 8 || peak > length / 16) {
    result.metricsReason = "THD / SNR / SINAD / SFDR require a uniformly sampled, coherent periodic record: Rectangular window, ≥256 samples, ≥8 cycles, and ≥16 samples per cycle. Use the displayed FFT bin spacing to align the capture.";
    return result;
  }
  const harmonicBins = new Set<number>();
  for (let order = 2; order <= 5; order++) {
    const bin = peak * order;
    if (bin >= amplitudes.length - 1) break;
    harmonicBins.add(bin); result.harmonics.push({ order, frequency: frequencies[bin]!, amplitude: amplitudes[bin]! });
  }
  const fundamentalPower = amplitudes[peak]! ** 2;
  let harmonicPower = 0; let noisePower = 0; let largestSpur = 0;
  for (let i = 1; i < amplitudes.length; i++) {
    if (i === peak) continue;
    // The Nyquist bin has no negative-frequency partner: its RMS equals its
    // amplitude. Other one-sided sinusoidal bins have RMS = amplitude / √2.
    // Normalize both to the fundamental's amplitude-squared reference.
    const power = amplitudes[i]! ** 2 * (i === length / 2 ? 2 : 1);
    if (harmonicBins.has(i)) harmonicPower += power;
    else noisePower += power;
    largestSpur = Math.max(largestSpur, power);
  }
  const ratioDb = (power: number) => power > fundamentalPower * 1e-24 ? 10 * Math.log10(fundamentalPower / power) : null;
  result.thd = 100 * Math.sqrt(harmonicPower / fundamentalPower);
  result.snr = ratioDb(noisePower); result.sinad = ratioDb(noisePower + harmonicPower); result.sfdr = ratioDb(largestSpur);
  result.warnings.push("Distortion metrics use harmonics 2–5 below Nyquist; SNR/SINAD describe this simulated record, including numerical residuals, rather than physical device noise.");
  return result;
}

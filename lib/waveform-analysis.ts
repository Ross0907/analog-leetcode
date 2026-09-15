import FFT from "fft.js";

export type WaveformPoint = { x: number; y: number };
export type WindowFunction = "rectangular" | "hann" | "hamming" | "blackman";
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
  const widths = rising.slice(0, -1).flatMap((start, i) => {
    const end = falling.find((time) => time > start && time < rising[i + 1]!);
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
};

export function computeSpectrum(time: ArrayLike<number>, values: ArrayLike<number>, options: {
  length: number; window: WindowFunction; removeDc: boolean;
}): Spectrum {
  const { length, window, removeDc } = options;
  if (!Number.isInteger(length) || length < 64 || length > 32768 || (length & (length - 1)) !== 0) throw new Error("FFT length must be a power of two from 64 to 32768.");
  if (time.length !== values.length || time.length < length) throw new Error(`Capture at least ${length} samples for this FFT length.`);
  const points: WaveformPoint[] = [];
  let largestStep = 0; let smallestStep = Infinity;
  for (let i = 0; i < time.length; i++) {
    const x = Number(time[i]); const y = Number(values[i]);
    if (!Number.isFinite(x) || !Number.isFinite(y)) throw new Error("FFT requires finite samples.");
    if (i > 0) {
      const step = x - Number(time[i - 1]);
      if (step <= 0) throw new Error("FFT requires strictly increasing sample times.");
      largestStep = Math.max(largestStep, step); smallestStep = Math.min(smallestStep, step);
    }
    points.push({ x, y });
  }
  const irregular = largestStep / smallestStep > 1.00001;
  const step = irregular ? largestStep : (Number(time[time.length - 1]) - Number(time[0])) / (time.length - 1);
  const end = points[points.length - 1]!.x;
  const start = end - (length - 1) * step;
  if (start < points[0]!.x - step * 1e-6) throw new Error("Capture is too short at its largest timestep. Choose a smaller FFT or capture longer with a smaller maximum timestep.");
  // Decimal sample spacing can round the final interpolation coordinate one
  // ULP past the recorded endpoint. Stay within the already-validated record.
  const samples = Array.from({ length }, (_, i) => interpolateWaveform(points, Math.min(end, Math.max(points[0]!.x, start + i * step)))!);
  if (samples.some((sample) => sample === null || !Number.isFinite(sample))) throw new Error("FFT resampling exceeds the capture.");
  const mean = removeDc ? samples.reduce((sum, value) => sum + value, 0) / length : 0;
  let windowSum = 0;
  const input = samples.map((sample, i) => {
    const angle = 2 * Math.PI * i / length;
    const weight = window === "hann" ? 0.5 - 0.5 * Math.cos(angle)
      : window === "hamming" ? 0.54 - 0.46 * Math.cos(angle)
        : window === "blackman" ? 0.42 - 0.5 * Math.cos(angle) + 0.08 * Math.cos(2 * angle) : 1;
    windowSum += weight;
    return (sample - mean) * weight;
  });
  const transform = new FFT(length); const output = transform.createComplexArray();
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
  const result: Spectrum = { frequencies, amplitudes, decibels, sampleRate, binWidth, length, dominantFrequency, thd: null, snr: null, sinad: null, sfdr: null, harmonics: [], warnings, metricsReason: null };
  const waveform = measureWaveform(samples.map((y, i) => ({ x: i * step, y })));
  const coherent = waveform.frequency !== null && Math.abs(waveform.frequency / binWidth - peak) < 0.01;
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

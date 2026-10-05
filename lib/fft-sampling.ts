export const MAX_FFT_LENGTH = 131072;
const MIN_FFT_LENGTH = 64;

export type FftSampling = { count: number; duration: number; largestStep: number; smallestStep: number; supportedLength: number };

export type FftRecord = { time: ArrayLike<number>; length: number; step: number; start: number; end: number; uniformStart: number | null; left: Int32Array | null; fraction: Float64Array | null };

/** Prepare timestamps once for every channel. Interpolate only inside the actual record. */
export function prepareFftRecord(time: ArrayLike<number>, length: number): FftRecord {
  if (!Number.isInteger(length) || length < MIN_FFT_LENGTH || length > MAX_FFT_LENGTH || (length & (length - 1)) !== 0) throw new Error('FFT length must be a power of two from 64 to 131072.');
  if (time.length < length) throw new Error(`Capture at least ${length} samples for this FFT length.`);
  const sampling = inspectFftSampling(time), uniform = uniformFftSuffix(time, length);
  const step = uniform?.step ?? sampling.largestStep, end = Number(time[time.length - 1]), calculatedStart = end - (length - 1) * step;
  if (calculatedStart < Number(time[0]) - step * 1e-6) throw new Error('Capture is too short at its largest timestep. Choose a smaller FFT or capture longer with a smaller maximum timestep.');
  const start = uniform ? Number(time[uniform.start]) : Math.max(Number(time[0]), calculatedStart);
  const record: FftRecord = { time, length, step, start, end, uniformStart: uniform?.start ?? null, left: null, fraction: null };
  if (uniform) return record;
  record.left = new Int32Array(length); record.fraction = new Float64Array(length);
  let index = 0;
  for (let i = 0; i < length; i++) {
    const target = Math.max(Number(time[0]), Math.min(end, calculatedStart + i * step));
    while (index < time.length - 2 && Number(time[index + 1]) < target) index++;
    record.left[i] = index;
    record.fraction[i] = (target - Number(time[index])) / (Number(time[index + 1]) - Number(time[index]));
  }
  return record;
}

/** Increase duration and real depth together, preserving the current sampling bandwidth. */
export function fftResolutionRequest(sampleRate: number, currentLength: number, recordDuration: number, settleDuration: number, channels: number) {
  if (![sampleRate, recordDuration, settleDuration].every(Number.isFinite) || sampleRate <= 0 || recordDuration <= currentLength / sampleRate * 1.001 || settleDuration < 0 || recordDuration + settleDuration > 10) return null;
  const capacity = Math.min(MAX_FFT_LENGTH, Math.floor(2097152 / (Math.max(1, channels) + 1)));
  const fftLength = Math.max(MIN_FFT_LENGTH, 2 ** Math.ceil(Math.log2(recordDuration * sampleRate - 1e-6)));
  if (fftLength > capacity) return null;
  return { minimumSamples: fftLength, fftLength, recordDuration, settleDuration, reason: `Capture a longer measured record for finer frequency resolution, preserving the current sampling bandwidth. Start after ${settleDuration} s of real settling.` };
}

/** A uniform suffix can be used directly, even when an earlier part of the record has a gap. */
export function uniformFftSuffix(time: ArrayLike<number>, length: number): { start: number; step: number } | null {
  if (length < 2 || time.length < length) return null;
  const start = time.length - length, step = (Number(time[time.length - 1]) - Number(time[start])) / (length - 1);
  if (!(step > 0)) return null;
  for (let i = start + 1; i < time.length; i++) if (Math.abs((Number(time[i]) - Number(time[i - 1])) / step - 1) > 1e-5) return null;
  return { start, step };
}

/** Bounds on actual data support; extra adaptive convergence points are not uniform samples. */
export function inspectFftSampling(time: ArrayLike<number>): FftSampling {
  let largestStep = 0, smallestStep = Infinity;
  for (let i = 0; i < time.length; i++) {
    const value = Number(time[i]);
    if (!Number.isFinite(value)) throw new Error('FFT requires finite sample times.');
    if (i) {
      const step = value - Number(time[i - 1]);
      if (!(step > 0)) throw new Error('FFT requires strictly increasing sample times.');
      largestStep = Math.max(largestStep, step); smallestStep = Math.min(smallestStep, step);
    }
  }
  const duration = time.length > 1 ? Number(time[time.length - 1]) - Number(time[0]) : 0;
  const conservativeCount = largestStep > 0 ? Math.floor(duration / largestStep + 1e-6) + 1 : 0;
  let supportedLength = 0;
  for (let length = MIN_FFT_LENGTH; length <= Math.min(time.length, MAX_FFT_LENGTH); length *= 2) {
    if (length <= conservativeCount || uniformFftSuffix(time, length)) supportedLength = length;
  }
  return { count: time.length, duration, largestStep, smallestStep, supportedLength };
}

export function fftCaptureRequest(sampling: FftSampling, fftLength: number, channels: number) {
  const capacity = Math.min(MAX_FFT_LENGTH, Math.floor(2097152 / (Math.max(1, channels) + 1)));
  if (fftLength > capacity || (sampling.count >= capacity && sampling.supportedLength < fftLength)) return null;
  const supportedCount = sampling.largestStep > 0 ? sampling.duration / sampling.largestStep + 1 : 0;
  const estimate = supportedCount > 1 ? sampling.count * (fftLength - 1) / (supportedCount - 1) : fftLength;
  const minimumSamples = Math.min(MAX_FFT_LENGTH, 2 ** Math.ceil(Math.log2(Math.max(fftLength * 2, estimate * 1.05))));
  return { minimumSamples, fftLength, reason: `A ${fftLength.toLocaleString()}-point FFT needs a denser measured record. No zero padding or invented samples are used.` };
}

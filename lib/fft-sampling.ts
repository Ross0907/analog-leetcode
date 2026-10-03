export const MAX_FFT_LENGTH = 131072;
const MIN_FFT_LENGTH = 64;

export type FftSampling = { count: number; duration: number; largestStep: number; smallestStep: number; supportedLength: number };

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

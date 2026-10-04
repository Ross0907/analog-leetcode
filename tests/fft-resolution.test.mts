import test from 'node:test';
import assert from 'node:assert/strict';
import { computeSpectrum, centeredSpectrumSpan } from '../lib/waveform-analysis';
import { prepareFftRecord, fftResolutionRequest } from '../lib/fft-sampling';

const tone = (length: number, rate: number, frequency = 1000, window: 'hann' | 'rectangular' = 'hann') => {
  const time = Array.from({ length }, (_, i) => .1 + i / rate);
  return computeSpectrum(time, time.map(t => .532 * Math.sin(2 * Math.PI * frequency * t)), { length, window, removeDc: true });
};

test('longer real records narrow the main lobe; deeper records at fixed duration do not', () => {
  const short = tone(8192, 1638400), deeper = tone(65536, 13107200), longer = tone(65536, 1638400);
  assert.ok(Math.abs(short.binWidth - 200) < 1e-8);
  assert.ok(Math.abs(deeper.binWidth - short.binWidth) < 1e-8);
  assert.ok(Math.abs(longer.binWidth - 25) < 1e-8);
  for (const spectrum of [short, deeper, longer]) {
    const peak = Math.round(1000 / spectrum.binWidth);
    assert.ok(Math.abs(spectrum.amplitudes[peak]! - .532) < 1e-8);
    assert.ok(Math.abs(spectrum.amplitudes[peak - 1]! / spectrum.amplitudes[peak]! - .5) < 1e-8, 'Hann neighboring bins are real window spreading and must not be erased');
  }
  const coherent = tone(65536, 1638400, 1000, 'rectangular');
  assert.ok(coherent.amplitudes[39]! < 1e-10);
  const noncoherent = tone(65536, 1638400, 1010, 'rectangular');
  assert.ok(noncoherent.amplitudes[39]! > .01, 'Noncoherent leakage is retained');
  assert.equal(noncoherent.coherent, false);
});

test('finer resolution requests preserve sample rate and bound duration, settling and all-probe storage', () => {
  const request = fftResolutionRequest(1638400, 8192, .04, .005, 2)!;
  assert.equal(request.fftLength, 65536); assert.equal(request.recordDuration, .04); assert.equal(request.settleDuration, .005);
  assert.ok(request.minimumSamples / request.recordDuration! >= 1638400);
  assert.equal(fftResolutionRequest(1638400, 8192, .005, 0, 2), null);
  assert.equal(fftResolutionRequest(1638400, 8192, .04, .005, 32), null);
  assert.equal(fftResolutionRequest(8192, 64, 8, 3, 1), null);
  assert.equal(fftResolutionRequest(8192, 64, .1, -1, 1), null);
});

test('center selected peak is an honest symmetric display crop on linear and logarithmic axes', () => {
  const spectrum = tone(65536, 1638400), copy = structuredClone(spectrum);
  const linear = centeredSpectrumSpan(spectrum)!, log = centeredSpectrumSpan(spectrum, true)!;
  assert.ok(Math.abs((linear.start + linear.stop) / 2 - spectrum.dominantFrequency!) < 1e-8);
  assert.ok(Math.abs(Math.sqrt(log.start * log.stop) - spectrum.dominantFrequency!) < 1e-8);
  assert.deepEqual(spectrum, copy); assert.equal(centeredSpectrumSpan({ ...spectrum, displayPeakFrequency: null }), null);
});

test('centering remains available above the metric bandwidth limit without inventing space beyond Nyquist', () => {
  const length = 8192, time = Array.from({ length }, (_, i) => i / length);
  for (const frequency of [length / 4, length / 2 - 1]) {
    const spectrum = computeSpectrum(time, time.map(t => Math.cos(2 * Math.PI * frequency * t)), { length, window: 'rectangular', removeDc: true });
    assert.equal(spectrum.dominantFrequency, null, 'Conservative frequency/distortion metric guard is unchanged');
    assert.equal(spectrum.thd, null);
    const linear = centeredSpectrumSpan(spectrum)!, log = centeredSpectrumSpan(spectrum, true)!;
    assert.equal((linear.start + linear.stop) / 2, frequency);
    assert.ok(Math.abs(Math.sqrt(log.start * log.stop) - frequency) < 1e-9);
    assert.ok(linear.start >= 0 && linear.stop <= length / 2);
    assert.ok(log.start > 0 && log.stop <= length / 2);
  }
  const nyquist = computeSpectrum(time, time.map((_, i) => (-1) ** i), { length, window: 'rectangular', removeDc: true });
  assert.equal(nyquist.displayPeakFrequency, length / 2);
  assert.equal(centeredSpectrumSpan(nyquist), null);
  assert.equal(centeredSpectrumSpan(nyquist, true), null);
});

test('one prepared adaptive timestamp plan preserves every channel, absolute time and finite endpoint', () => {
  const time = Array.from({ length: 8193 }, (_, i) => 2 + (i / 8192) ** 1.05), plan = prepareFftRecord(time, 4096);
  const channels = [time.map(t => 3 * t - 1), time.map(t => Math.sin(2 * Math.PI * 128 * t))];
  for (const values of channels) {
    const prepared = computeSpectrum(time, values, { length: 4096, window: 'hann', removeDc: false, record: plan });
    const standalone = computeSpectrum(time, values, { length: 4096, window: 'hann', removeDc: false });
    assert.deepEqual(prepared, standalone); assert.ok(prepared.recordStart >= 2); assert.equal(prepared.recordEnd, 3);
    assert.ok(prepared.amplitudes.every(Number.isFinite));
  }
  const values = time.map(t => 3 * t - 1);
  for (let i = 0; i < plan.length; i++) {
    const left = plan.left![i]!, fraction = plan.fraction![i]!;
    const value = values[left]! + (values[left + 1]! - values[left]!) * fraction;
    assert.ok(Math.abs(value - (3 * (plan.start + i * plan.step) - 1)) < 1e-12);
  }
});

test('FFT interval metadata stays inside actual endpoints despite arithmetic roundoff', () => {
  const uniform = Array.from({ length: 64 }, (_, i) => .1234567 + i * .00003);
  assert.equal(prepareFftRecord(uniform, 64).start, uniform[0]);
  const end = 63 - 1e-13, adaptive = [0, .25, ...Array.from({ length: 62 }, (_, i) => i + 1), end];
  const plan = prepareFftRecord(adaptive, 64);
  assert.equal(plan.uniformStart, null); assert.equal(plan.start, 0); assert.equal(plan.end, end); assert.equal(plan.step, 1);
  assert.equal(plan.fraction![0], 0);
  const fft = computeSpectrum(adaptive, adaptive, { length: 64, window: 'hann', removeDc: true, record: plan });
  assert.equal(fft.recordStart, 0); assert.equal(fft.recordEnd, end);
  const trueGap = [...adaptive]; trueGap[trueGap.length - 1] = 62.99;
  assert.throws(() => prepareFftRecord(trueGap, 64), /too short/, 'Metadata clamping must not hide a genuinely unsupported record');
});

test('four-term Blackman–Harris reduces distant leakage while retaining its wider physical main lobe', () => {
  const length = 8192, time = Array.from({ length }, (_, i) => i / length), values = time.map(t => Math.sin(2 * Math.PI * 512.375 * t));
  const hann = computeSpectrum(time, values, { length, window: 'hann', removeDc: true });
  const harris = computeSpectrum(time, values, { length, window: 'blackman-harris', removeDc: true });
  const far = (amplitudes: number[]) => Math.max(...amplitudes.filter((_, i) => i > 10 && Math.abs(i - 512.375) > 8));
  assert.ok(far(harris.amplitudes) < far(hann.amplitudes) * .1);
  assert.ok(harris.amplitudes[514]! > hann.amplitudes[514]!, 'A lower sidelobe window widens the main lobe rather than deleting energy');
  assert.equal(harris.thd, null, 'Rectangular/coherent metric guard remains in force');
});

test('one-sided spectral power matches actual sample energy including DC and Nyquist', () => {
  const length = 8192, time = Array.from({ length }, (_, i) => i / length);
  const values = time.map((t, i) => 2.4 + .7 * Math.sin(2 * Math.PI * 123 * t) + .13 * Math.cos(2 * Math.PI * 271 * t) + .04 * (-1) ** i);
  const fft = computeSpectrum(time, values, { length, window: 'rectangular', removeDc: false });
  const spectralEnergy = fft.amplitudes.reduce((sum, amplitude, i) => sum + amplitude ** 2 * (i === 0 || i === length / 2 ? 1 : .5), 0);
  const measuredEnergy = values.reduce((sum, value) => sum + value ** 2, 0) / length;
  assert.ok(Math.abs(spectralEnergy - measuredEnergy) < 1e-12);
});

test('tiny DC ripple keeps its absolute units rather than becoming a normalized zero-dB peak', () => {
  const length = 8192, time = Array.from({ length }, (_, i) => i / length);
  const ripple = computeSpectrum(time, time.map(t => 1.8 + 1e-9 * Math.sin(2 * Math.PI * 64 * t)), { length, window: 'hann', removeDc: true });
  assert.ok(Math.abs(ripple.amplitudes[64]! - 1e-9) < 1e-16);
  assert.ok(Math.abs(ripple.decibels[64]! + 180) < 1e-6);
  const constant = computeSpectrum(time, time.map(() => 1.8), { length, window: 'hann', removeDc: true });
  assert.equal(constant.dominantFrequency, null);
  assert.ok(Math.max(...constant.decibels) < -230, 'Floating-point summation residual remains tiny and cannot appear as a full-scale tone');
});

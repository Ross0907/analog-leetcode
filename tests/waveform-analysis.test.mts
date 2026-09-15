import assert from "node:assert/strict";
import test from "node:test";
import { computeSpectrum, interpolateWaveform, measureWaveform, type WindowFunction } from "../lib/waveform-analysis";
import { probeColor } from "../lib/probe-colors";

const near = (actual: number | null, expected: number, tolerance = 1e-8) => assert.ok(actual !== null && Math.abs(actual - expected) <= tolerance, `${actual} should be within ${tolerance} of ${expected}`);
const signal = (length: number, frequency: number, sampleRate = length, harmonic = 0) => {
  const time = Array.from({ length }, (_, i) => i / sampleRate);
  return { time, values: time.map((t) => 2 + Math.sin(2 * Math.PI * frequency * t) + harmonic * Math.sin(6 * Math.PI * frequency * t)) };
};

test("adaptive time measurements integrate physical time rather than sample density", () => {
  const points = [0, 0.001, 0.002, 0.003, 0.01, 1].map((x) => ({ x, y: x }));
  const measured = measureWaveform(points);
  near(measured.mean, 0.5); near(measured.rms, Math.sqrt(1 / 3));
  near(measured.minimum, 0); near(measured.maximum, 1); near(measured.peakToPeak, 1);
  assert.equal(measured.frequency, null); assert.equal(measured.dutyCycle, null);
});

test("frequency and midpoint duty need complete, sufficiently sampled stable periods", () => {
  const { time, values } = signal(4096, 32);
  const measured = measureWaveform(time.map((x, i) => ({ x, y: values[i]! })));
  near(measured.frequency, 32, 1e-5); near(measured.dutyCycle, 50, 1e-5);
  near(measured.rms, Math.sqrt(4.5), 0.002);
  assert.equal(measureWaveform([{ x: 0, y: 1 }, { x: 1, y: 1 }]).frequency, null);
  assert.equal(measureWaveform(time.slice(0, 50).map((x, i) => ({ x, y: values[i]! }))).frequency, null);
  assert.equal(measureWaveform([{ x: 1, y: 1 }, { x: 0, y: 2 }]).rms, null);
});

test("cursor interpolation is bounded and uses the interval containing each cursor", () => {
  const points = [{ x: 0, y: 2 }, { x: 0.1, y: 4 }, { x: 1, y: 8 }];
  near(interpolateWaveform(points, 0.05), 3);
  near(interpolateWaveform(points, 0.55), 6);
  near(interpolateWaveform([...points].reverse(), 0.55), 6);
  assert.equal(interpolateWaveform(points, -1), null);
  assert.equal(interpolateWaveform(points, 2), null);
});

test("all supported FFT windows preserve coherent sinusoid peak amplitude", () => {
  const { time, values } = signal(4096, 32);
  for (const window of ["rectangular", "hann", "hamming", "blackman"] as WindowFunction[]) {
    const spectrum = computeSpectrum(time, values, { length: 4096, window, removeDc: true });
    near(spectrum.amplitudes[32]!, 1, 1e-8); near(spectrum.decibels[32]!, 0, 1e-8);
    near(spectrum.amplitudes[0]!, 0, 1e-10); near(spectrum.dominantFrequency, 32);
    near(spectrum.binWidth, 1); near(spectrum.sampleRate, 4096);
  }
});

test("DC normalization and Nyquist normalization do not double their amplitudes", () => {
  const time = Array.from({ length: 256 }, (_, i) => i / 256);
  const spectrum = computeSpectrum(time, time.map((_, i) => 3 + 0.5 * (-1) ** i), { length: 256, window: "rectangular", removeDc: false });
  near(spectrum.amplitudes[0]!, 3); near(spectrum.amplitudes[128]!, 0.5);
  assert.equal(spectrum.dominantFrequency, null);
});

test("decimal-spaced captures retain the final sample despite floating-point endpoint rounding", () => {
  const time = Array.from({ length: 1024 }, (_, i) => 0.1234567 + i * 0.00003);
  const spectrum = computeSpectrum(time, time.map((t) => Math.sin(t * 2 * Math.PI * 1000)), { length: 512, window: "hann", removeDc: true });
  assert.equal(spectrum.length, 512);
  assert.ok(spectrum.amplitudes.every(Number.isFinite));
  near(spectrum.sampleRate, 1 / 0.00003, 1e-6);
});

test("Nyquist residual power uses its full RMS energy in SNR and SINAD", () => {
  const time = Array.from({ length: 4096 }, (_, i) => i / 4096);
  const values = time.map((t, i) => Math.sin(t * 2 * Math.PI * 32) + 0.01 * (-1) ** i);
  const spectrum = computeSpectrum(time, values, { length: 4096, window: "rectangular", removeDc: true });
  const expected = 10 * Math.log10(0.5 / 0.0001);
  near(spectrum.snr, expected, 1e-6); near(spectrum.sinad, expected, 1e-6);
});

test("coherent 10-percent third harmonic gives 10-percent THD and 20 dB SFDR", () => {
  const { time, values } = signal(4096, 32, 4096, 0.1);
  const spectrum = computeSpectrum(time, values, { length: 4096, window: "rectangular", removeDc: true });
  near(spectrum.thd, 10, 1e-6); near(spectrum.sfdr, 20, 1e-6); near(spectrum.sinad, 20, 1e-6);
  assert.equal(spectrum.snr, null, "numerical floor is not reported as infinite SNR");
  assert.equal(spectrum.metricsReason, null);
});

test("unresolved, noncoherent and windowed records withhold distortion metrics", () => {
  const short = signal(256, 1.3);
  const spectrum = computeSpectrum(short.time, short.values, { length: 256, window: "hann", removeDc: true });
  assert.equal(spectrum.thd, null); assert.equal(spectrum.snr, null); assert.equal(spectrum.dominantFrequency, null);
  assert.match(spectrum.metricsReason!, /coherent/);
});

test("adaptive samples are resampled explicitly and large gaps do not invent detail", () => {
  const time = Array.from({ length: 1024 }, (_, i) => i / 1024 + (i % 2) * 0.00001);
  const spectrum = computeSpectrum(time, time.map((x) => Math.sin(2 * Math.PI * 16 * x)), { length: 512, window: "hann", removeDc: true });
  assert.match(spectrum.warnings[0]!, /resampled/); assert.equal(spectrum.thd, null);
  assert.throws(() => computeSpectrum(time, time.map((x) => x), { length: 1024, window: "hann", removeDc: true }), /too short/);
  assert.throws(() => computeSpectrum([0, 0, 1], [1, 2, 3], { length: 64, window: "hann", removeDc: true }), /at least 64/);
  assert.throws(() => computeSpectrum(time, time, { length: 100, window: "hann", removeDc: true }), /power of two/);
});

test("trace color depends on identity rather than adjacent probe order", () => {
  assert.equal(probeColor("out"), probeColor("OUT"));
  const before = ["in", "out", "sense"].map(probeColor);
  assert.equal(before[1], ["out", "sense"].map(probeColor)[0]);
});

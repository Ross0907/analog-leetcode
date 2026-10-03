import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { computeSpectrum } from '../lib/waveform-analysis';
import { fftCaptureRequest, inspectFftSampling } from '../lib/fft-sampling';
import { availableFftLength } from '../lib/instrument-interactions';

test('lesson36 real ngspice record explains the unsupported FFT depth without padding its data', () => {
  const measured = JSON.parse(readFileSync(new URL('./fixtures/delta-sigma-measured.json', import.meta.url), 'utf8'));
  const sampling = inspectFftSampling(measured.time);
  assert.equal(sampling.count, 3109);
  assert.equal(sampling.supportedLength, 1024);
  for (const trace of measured.traces) {
    const spectrum = computeSpectrum(measured.time, trace.values, { length: 1024, window: 'hann', removeDc: true });
    assert.equal(spectrum.frequencies.length, 513);
    assert.ok(spectrum.amplitudes.every(Number.isFinite));
    assert.throws(() => computeSpectrum(measured.time, trace.values, { length: 16384, window: 'hann', removeDc: true }), /at least 16384/);
  }
  const request = fftCaptureRequest(sampling, 16384, measured.traces.length)!;
  assert.ok(request.minimumSamples >= 32768 && request.minimumSamples <= 131072);
  assert.equal(request.fftLength, 16384);
});

test('an early gap does not reject a later uniform 16384-point measured record', () => {
  const length = 16384, rate = 16384;
  const time = [-20, -10, ...Array.from({ length }, (_, i) => i / rate)];
  const values = [0, 0, ...Array.from({ length }, (_, i) => Math.sin(2 * Math.PI * 128 * i / rate))];
  const spectrum = computeSpectrum(time, values, { length, window: 'rectangular', removeDc: true });
  assert.equal(inspectFftSampling(time).supportedLength, length);
  assert.equal(spectrum.sampleRate, rate);
  assert.ok(Math.abs(spectrum.amplitudes[128]! - 1) < 1e-9);
  assert.equal(spectrum.dominantFrequency, 128);
  assert.ok(!spectrum.warnings.some(warning => warning.includes('resampled')));
  assert.equal(availableFftLength(time, 1000), 512);
});

test('sampling support rejects missing intervals and impossible acquisition budgets', () => {
  const time = [...Array.from({ length: 2001 }, (_, i) => i / 100000), .04];
  const sampling = inspectFftSampling(time);
  assert.equal(sampling.supportedLength, 0);
  assert.throws(() => computeSpectrum(time, time, { length: 64, window: 'hann', removeDc: true }), /too short/);
  assert.equal(fftCaptureRequest(sampling, 131072, 32), null);
  assert.equal(fftCaptureRequest({ ...sampling, count: 131072 }, 131072, 1), null);
  assert.throws(() => inspectFftSampling([0, 0, 1]), /increasing/);
  assert.throws(() => inspectFftSampling([0, NaN, 1]), /finite/);
});

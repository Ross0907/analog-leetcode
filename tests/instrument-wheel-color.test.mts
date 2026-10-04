import test from 'node:test';
import assert from 'node:assert/strict';
import { instrumentWheelGesture, zoomPlotBounds } from '../lib/instrument-interactions';
import { hexToHsv, hsvToHex, normalizeHexColor } from '../lib/color-picker';
import { computeSpectrum, spectrumSignalStop } from '../lib/waveform-analysis';

test('wheel modifiers choose explicit axes while unmodified scrolling remains untouched', () => {
  const wheel = { deltaY: -120, deltaMode: 0, ctrlKey: false, shiftKey: false, altKey: false };
  assert.equal(instrumentWheelGesture(wheel), null);
  assert.equal(instrumentWheelGesture({ ...wheel, shiftKey: true }), null);
  const both = instrumentWheelGesture({ ...wheel, ctrlKey: true })!;
  assert.equal(both.x, true); assert.equal(both.y, true); assert.ok(both.factor < 1);
  assert.deepEqual(instrumentWheelGesture({ ...wheel, ctrlKey: true, shiftKey: true }), { ...both, y: false });
  assert.deepEqual(instrumentWheelGesture({ ...wheel, altKey: true }), { ...both, x: false });
  assert.equal(instrumentWheelGesture({ ...wheel, ctrlKey: true, deltaY: NaN }), null);
  assert.equal(instrumentWheelGesture({ ...wheel, ctrlKey: true, deltaY: 0 }), null);
  assert.equal(instrumentWheelGesture({ ...wheel, ctrlKey: true, deltaMode: 1, deltaY: -3 })!.factor, instrumentWheelGesture({ ...wheel, ctrlKey: true, deltaY: -48 })!.factor);
});

test('wheel zoom anchors linear and logarithmic axes and stops at record/numeric limits', () => {
  const start = { minimum: 10, maximum: 50 }, ratio = .3;
  const zoom = zoomPlotBounds(start, ratio, .5, { minimum: 0, maximum: 100 });
  assert.equal(zoom.maximum - zoom.minimum, 20);
  assert.equal(zoom.minimum + ratio * (zoom.maximum - zoom.minimum), 22);
  const log = zoomPlotBounds({ minimum: 1, maximum: 5 }, .75, .5, { minimum: 1, maximum: 5 });
  assert.equal(10 ** (log.minimum + .75 * (log.maximum - log.minimum)), 10000);
  assert.deepEqual(zoomPlotBounds({ minimum: 2, maximum: 4 }, 0, 1e20, { minimum: 0, maximum: 10 }), { minimum: 0, maximum: 10 });
  const tiny = zoomPlotBounds({ minimum: 1, maximum: 2 }, .5, 1e-20, { minimum: 0, maximum: 10 });
  assert.ok(tiny.maximum - tiny.minimum >= 1e-8 * .999);
  assert.deepEqual(zoomPlotBounds(start, .5, NaN), start);
});

test('inline picker converts arbitrary RGB colors without losing channels and rejects invalid hex drafts', () => {
  for (const color of ['#000000', '#ffffff', '#808080', '#ff0000', '#00ff00', '#0000ff', '#e5ae36', '#8333aa', '#19a7ce', '#010203']) assert.equal(hsvToHex(hexToHsv(color)), color);
  assert.equal(normalizeHexColor(' AbC '), '#aabbcc');
  assert.equal(normalizeHexColor('#Ee1199'), '#ee1199');
  assert.equal(normalizeHexColor('#1'), null);
  assert.equal(normalizeHexColor('red'), null);
  assert.equal(hsvToHex({ h: 420, s: 100, v: 100 }), '#ffff00');
  assert.equal(hsvToHex({ h: 120, s: 0, v: 50 }), '#808080');
});

test('signal-band fitting exposes resolved tones while preserving the complete measured spectrum', () => {
  const length = 8192, time = Array.from({ length }, (_, i) => i / 1638400);
  const spectrum = (frequency: number) => computeSpectrum(time, time.map(t => .532 * Math.sin(2 * Math.PI * frequency * t)), { length, window: 'hann', removeDc: true });
  const low = spectrum(1000), original = structuredClone(low);
  assert.equal(spectrumSignalStop([low]), 3000);
  assert.deepEqual(low, original, 'Display fitting never removes FFT bins or changes amplitudes');
  const high = spectrum(40000);
  assert.ok(spectrumSignalStop([low, high])! >= 120000, 'Every trace contributes to the displayed band');
  assert.equal(spectrumSignalStop([{ ...low, dominantFrequency: null }]), null, 'Unresolved or broad signals keep the full range');
  assert.equal(spectrumSignalStop([]), null);
});

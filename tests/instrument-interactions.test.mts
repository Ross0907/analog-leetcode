import assert from 'node:assert/strict';
import test from 'node:test';
import { availableFftLength, distanceToSegment, fitTimeWindow, instrumentTraceColor, nearestPlotTrace, rectangleView, stackedTraceOffsets } from '../lib/instrument-interactions';
import { automaticLogicThresholds, heldSampleIndex, logicPath } from '../lib/logic-analysis';

const plot = { left: 50, top: 20, width: 400, height: 200 };
const x = { minimum: 0, maximum: 10 }, y = { minimum: -5, maximum: 5 };

test('area zoom maps reversed drag and inverted vertical pixels into exact axis bounds', () => {
  assert.deepEqual(rectangleView({ x: 350, y: 170 }, { x: 150, y: 70 }, plot, x, y), {
    x: { minimum: 2.5, maximum: 7.5 }, y: { minimum: -2.5, maximum: 2.5 },
  });
  assert.deepEqual(rectangleView({ x: -40, y: -60 }, { x: 700, y: 800 }, plot, x, y), { x, y });
});

test('frequency-area zoom interpolates decades, while click and zero-sized plot do not zoom', () => {
  const frequency = rectangleView({ x: 150, y: 20 }, { x: 350, y: 220 }, plot, { minimum: 1, maximum: 5 }, y)!;
  assert.equal(10 ** frequency.x.minimum, 100);
  assert.equal(10 ** frequency.x.maximum, 10000);
  assert.equal(rectangleView({ x: 150, y: 70 }, { x: 153, y: 72 }, plot, x, y), null);
  assert.equal(rectangleView({ x: 100, y: 60 }, { x: 300, y: 180 }, { ...plot, width: 0 }, x, y), null);
});

test('right-click hit testing chooses the nearest visible trace segment, not plot background', () => {
  const lines = [{ id: 'low', points: [{ x: 0, y: 10 }, { x: 100, y: 10 }] }, { id: 'high', points: [{ x: 0, y: 15 }, { x: 100, y: 15 }] }];
  assert.equal(nearestPlotTrace(lines, { x: 50, y: 13 }), 'high');
  assert.equal(nearestPlotTrace(lines, { x: 50, y: 50 }), null);
  assert.equal(nearestPlotTrace([{ id: 'gap', points: [{ x: 0, y: 0 }, { x: NaN, y: NaN }, { x: 100, y: 0 }] }], { x: 50, y: 0 }), null);
  assert.equal(distanceToSegment({ x: 15, y: 5 }, { x: 0, y: 5 }, { x: 10, y: 5 }), 5);
});

test('bright trace colors have readable light-theme contrast without changing dark colors', () => {
  for (const color of ['#ffd33d', '#22c7df', '#f4f4f5', '#7ed957', '#000000']) {
    assert.equal(instrumentTraceColor(color, 'dark'), color);
    const display = instrumentTraceColor(color, 'light');
    const luminance = [1, 3, 5].map((offset) => parseInt(display.slice(offset, offset + 2), 16) / 255)
      .reduce((sum, channel, index) => sum + (channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4) * [0.2126, 0.7152, 0.0722][index]!, 0);
    assert.ok(1.05 / (luminance + 0.05) > 3.8);
  }
});

test('logic zoom preserves native nonuniform transition timing and held cursor state', () => {
  const time = [0, 0.001, 0.1, 0.5, 0.9, 1], values = [0, 5, 5, 0, 5, 5];
  assert.equal(heldSampleIndex(time, 0.3), 2);
  assert.equal(heldSampleIndex(time, 0.5), 3);
  assert.equal(heldSampleIndex(time, 9), 5);
  assert.equal(heldSampleIndex([], 1), -1);
  assert.deepEqual(logicPath(time, values, 0.25, 0.75, 0.8, 2), { path: 'M0 9 H500V37 H1000', truncated: false });
  const bounded = logicPath(time, values, 0, 1, 0.8, 2, 1);
  assert.equal(bounded.truncated, true);
  assert.equal(bounded.path, 'M0 37 H1V9'); // Never invent a flat continuation after truncation.
});


test('stacked display offsets separate overlapping ranges without modifying their measured values', () => {
  const measured = [{ id: 'a', minimum: -2, maximum: 2 }, { id: 'b', minimum: -1, maximum: 1 }, { id: 'c', minimum: 1, maximum: 3 }];
  const original = structuredClone(measured), offsets = stackedTraceOffsets(measured);
  assert.deepEqual(measured, original);
  for (let index = 1; index < measured.length; index++) {
    const upper = measured[index - 1]!, lower = measured[index]!;
    assert.ok(upper.minimum + offsets[upper.id]! > lower.maximum + offsets[lower.id]!, 'Adjacent displayed ranges must have a visible gap');
  }
  assert.ok(Object.values(stackedTraceOffsets([{ id: 'constant', minimum: 5, maximum: 5 }])).every(Number.isFinite));
});

test('requested time windows never invent digital samples outside the captured interval', () => {
  assert.deepEqual(fitTimeWindow({ minimum: 0.002, maximum: 0.005 }, 'elapsed'), { minimum: 0, maximum: 0.005 });
  assert.deepEqual(fitTimeWindow({ minimum: 0.002, maximum: 0.005 }, 'requested', 0.01), { minimum: 0, maximum: 0.01 });
  assert.deepEqual(fitTimeWindow({ minimum: 0.002, maximum: 0.005 }, 'samples'), { minimum: 0.002, maximum: 0.005 });
  assert.deepEqual(logicPath([0.002, 0.004], [0, 5], 0, 0.01, 0.8, 2), { path: 'M200 37 H400V9 H400', truncated: false });
  assert.deepEqual(logicPath([0.002, 0.004], [0, 5], 0.005, 0.01, 0.8, 2), { path: '', truncated: false });
});

test('Auto set uses measured voltage range and physically available FFT spacing', () => {
  assert.deepEqual(automaticLogicThresholds([[0, 5], [1, 2]]), { low: 1, high: 4 });
  assert.equal(automaticLogicThresholds([[5, 5], [NaN]]), null);
  const uniform = Array.from({ length: 8192 }, (_, i) => i / 8192);
  assert.equal(availableFftLength(uniform), 8192);
  const adaptive = [...Array.from({ length: 2001 }, (_, i) => i / 100000), 0.04];
  assert.equal(availableFftLength(adaptive), 64, 'A long gap cannot be treated as thousands of uniformly captured samples');
});

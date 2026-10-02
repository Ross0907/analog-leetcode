import assert from 'node:assert/strict';
import test from 'node:test';
import { distanceToSegment, instrumentTraceColor, nearestPlotTrace, rectangleView } from '../lib/instrument-interactions';
import { heldSampleIndex, logicPath } from '../lib/logic-analysis';

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

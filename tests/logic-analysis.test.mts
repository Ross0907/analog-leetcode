import assert from 'node:assert/strict';
import test from 'node:test';
import { logicState, logicWord } from '../lib/logic-analysis';

test('digital thresholds distinguish valid low/high levels from the undefined band', () => {
  assert.equal(logicState(0.8, 0.8, 2), 0);
  assert.equal(logicState(2, 0.8, 2), 1);
  assert.equal(logicState(1.5, 0.8, 2), 'X');
  assert.equal(logicState(NaN, 0.8, 2), 'X');
  assert.equal(logicState(1, 2, 0.8), 'X');
});

test('logic buses preserve list order as bit significance and propagate unknown inputs', () => {
  assert.deepEqual(logicWord([5, 0, 5, 0], 0.8, 2), { binary: '0101', hex: '0x5' });
  assert.deepEqual(logicWord([5, 1, 0, 5], 0.8, 2), { binary: '10X1', hex: 'X' });
  assert.deepEqual(logicWord(Array(16).fill(3.3), 0.8, 2), { binary: '1111111111111111', hex: '0xFFFF' });
});

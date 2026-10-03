import assert from 'node:assert/strict';
import test from 'node:test';
import { stimulusPoints } from '../lib/native-stimulus';
import { expertChallenges } from '../lib/expert-challenges';

test('repeating PWL uses actual repeated edges with one strictly increasing shared boundary', () => {
  const points = stimulusPoints({ type: 'pwl', repeatPeriodS: .002, points: [
    {timeS:0,value:0},{timeS:.0005,value:0},{timeS:.000501,value:5},{timeS:.001999,value:5},{timeS:.002,value:0},
  ] }, .008);
  assert.equal(points.filter(point => point.value === 5 && Math.abs(point.timeS % .002 - .000501) < 1e-12).length, 4);
  assert.equal(points.at(-1)!.timeS, .008);
  points.slice(1).forEach((point,index) => assert.ok(point.timeS > points[index].timeS));
});

test('repeated PWL rejects discontinuous joins and unbounded expansions', () => {
  assert.throws(() => stimulusPoints({type:'pwl',repeatPeriodS:1,points:[{timeS:0,value:0},{timeS:1,value:1}]},4), /same value/);
  assert.throws(() => stimulusPoints({type:'pwl',repeatPeriodS:1,points:[{timeS:0,value:0},{timeS:.5,value:1},{timeS:1,value:0}]},1000), /1024/);
});

test('SAR and flash acquisition defaults contain four complete real stimulus sequences', () => {
  for (const slug of ['sar-conversion-sequence','flash-adc-threshold-calibration']) {
    const challenge = expertChallenges.find(challenge => challenge.slug === slug)!;
    const settings = challenge.analysisDefaults!;
    const repeating = Object.values(settings.sourceOverrides ?? {}).filter(source => source.type === 'pwl' && source.repeatPeriodS);
    assert.ok(repeating.length);
    for (const source of repeating) {
      assert.equal(source.type,'pwl');
      if (source.type !== 'pwl') continue;
      assert.ok(settings.duration! / source.repeatPeriodS! >= 3.999);
      const points = stimulusPoints(source, settings.duration!);
      assert.ok(points.at(-1)!.timeS >= settings.duration! - 1e-12);
    }
    assert.ok(settings.samples! >= 32768);
  }
});

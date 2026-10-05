import assert from 'node:assert/strict';
import test from 'node:test';
import {sampleAt,formatValue,vectorSample,numericValue,timeText,parseCursorTime,escapeSvgText} from '../public/hdl/viewer/signal-values.mjs';

test('VCD cursor lookup observes event boundaries and does not use a future sample',()=>{
  const wave=[[5,0],[10,128],[20,255]];
  assert.equal(sampleAt(wave,4),null);assert.deepEqual(sampleAt(wave,5),wave[0]);assert.deepEqual(sampleAt(wave,19.99),wave[1]);assert.deepEqual(sampleAt(wave,20),wave[2]);assert.deepEqual(sampleAt(wave,100),wave[2]);
});
test('HDL bus radices preserve width, signedness, ASCII and values above Number precision',()=>{
  assert.equal(formatValue(128,0,8,'binary'),'10000000');assert.equal(formatValue(128,0,8,'octal'),'200');assert.equal(formatValue(128,0,8,'hex'),'80');
  assert.equal(formatValue(128,0,8,'unsigned'),'128');assert.equal(formatValue(128,0,8,'signed'),'-128');assert.equal(formatValue(65,0,8,'ascii'),'"A"');
  assert.equal(formatValue(0b00000101,0,8,'unsigned'),'5');assert.equal(formatValue(0,0,8,'unsigned'),'0');
  assert.equal(formatValue('0xffffffffffffffff',0,64,'signed'),'-1');assert.equal(formatValue('0x20000000000001',0,64,'unsigned'),'9007199254740993');
  assert.equal(formatValue(0x4142,0,16,'ascii'),'"AB"');assert.equal(formatValue(0,0,8,'ascii'),'"\\x00"');
  assert.equal(formatValue(0x225c,0,16,'ascii'),'"\\"\\\\"');
  assert.equal(formatValue(1,0,1e12,'signed'),'Unsupported bus width');assert.equal(numericValue(1,0,1e12,true),null);
  assert.equal(formatValue(1,0,1.5,'hex'),'Unsupported bus width');assert.equal(numericValue(1,0,Infinity),null);
  assert.equal(escapeSvgText(formatValue(0x3c672f3e,0,32,'ascii')),'"&lt;g/&gt;"');
  assert.equal(escapeSvgText('&lt;script>'),'&amp;lt;script&gt;');
});
test('unknown/high-impedance values stay explicit and break analog numeric traces',()=>{
  assert.equal(formatValue(0x96,0x30,8,'binary'),'10xz0110');assert.equal(formatValue(0xff,0xff,8,'hex'),'zz');assert.equal(formatValue(0,0xff,8,'unsigned'),'X');
  assert.deepEqual(vectorSample({kind:'bit'},[0,4]),[BigInt(1),BigInt(1)]);assert.deepEqual(vectorSample({kind:'bit'},[0,2]),[BigInt(0),BigInt(1)]);
  assert.equal(numericValue(BigInt(4),BigInt(1),8),null);assert.equal(numericValue(BigInt(255),BigInt(0),8,true),-1);
  assert.equal(timeText(11,1,-9),'11 ns');assert.ok(!timeText(-11,1,-9).startsWith('-'));
});

test('editable HDL cursor time preserves precise engineering input and rejects outside the record',()=>{
  const precise=parseCursorTime('12.3456789 ns',1000,-12,50);assert.ok(precise!==null);
  assert.ok(Math.abs(precise-12.3456789)<1e-12);
  assert.equal(parseCursorTime('1.2u',1,-9,2000),1200);
  assert.equal(parseCursorTime('1.2 µs',1,-9,2000),1200);
  assert.equal(parseCursorTime('1.2e-6',1,-9,2000),1200);
  assert.equal(parseCursorTime('0',1,-9,0),0);
  assert.equal(parseCursorTime('50 ns',1000,-12,50),50);
  for(const input of ['-1ns','51ns','1e999','not a time','3k','12.3.4ns'])assert.equal(parseCursorTime(input,1000,-12,50),null);
});

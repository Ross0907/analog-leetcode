import test from 'node:test';
import assert from 'node:assert/strict';
import { fftLongRecordRequest } from '../lib/fft-sampling';
import { computeSpectrum } from '../lib/waveform-analysis';
import { logicPath } from '../lib/logic-analysis';
import { distinctTraceColors } from '../lib/probe-colors';
import { parsePreferences } from '../lib/workspace-preferences';
import { netlistGraph } from '../lib/hdl-netlist';

test('long-record acquisition resolves a 100 Hz tone using real samples at the memory ceiling',()=>{
  const plan=fftLongRecordRequest(.005,.4,.08,2)!;
  assert.equal(plan.fftLength,131072);assert.equal(plan.recordDuration,.4);
  const step=plan.recordDuration/plan.fftLength;
  const time=Array.from({length:plan.fftLength},(_,i)=>plan.settleDuration+(i+1)*step);
  const values=time.map(t=>2*Math.sin(2*Math.PI*100*t));
  const spectrum=computeSpectrum(time,values,{length:plan.fftLength,window:'rectangular',removeDc:true});
  assert.ok(Math.abs(spectrum.binWidth-2.5)<1e-9);
  assert.ok(Math.abs(spectrum.amplitudes[40]-2)<1e-8);
  assert.ok(spectrum.amplitudes[39]<1e-8&&spectrum.amplitudes[41]<1e-8);
  assert.equal(fftLongRecordRequest(.01,.01,0,2),null);
  assert.equal(fftLongRecordRequest(.01,9,2,2),null);
  assert.ok(fftLongRecordRequest(.01,.4,0,32)!.fftLength*33<=2097152);
});
test('unknown logic intervals occupy both rails and never draw an ambiguous midpoint',()=>{
  const plot=logicPath([0,1,2,3],[0,1.5,5,5],0,3,.8,2);
  assert.deepEqual(plot.unknown,[{start:1000/3,end:2000/3}]);
  assert.ok(plot.unknownPath.includes(' 9H')&&plot.unknownPath.includes(' 37H'));
  assert.ok(!plot.path.includes(' 23'));
});
test('default trace colors avoid collisions while custom probe colors are retained',()=>{
  const colors=distinctTraceColors(['out','node1','node2','out'],{out:'#ffd33d'});
  assert.equal(colors.out,'#ffd33d');assert.equal(new Set(Object.values(colors)).size,3);
  assert.equal(new Set(Object.values(distinctTraceColors(Array.from({length:32},(_,i)=>String(i))))).size,32);
});
test('settings reject invalid or duplicate bindings and default to click reset',()=>{
  assert.equal(parsePreferences(null).clickAction,'reset');
  assert.equal(parsePreferences({fitKey:'q',areaKey:'q',centerKey:'c'}).fitKey,'f');
  assert.equal(parsePreferences({fitKey:'q',areaKey:'w',centerKey:'c'}).fitKey,'q');
});
test('elaborated connections preserve real bit identity and bus width',()=>{
  const graph=netlistGraph({ports:{a:{direction:'input',bits:[2,3]},y:{direction:'output',bits:[4,5]}},cells:{inv:{type:'$not',port_directions:{A:'input',Y:'output'},connections:{A:[2,3],Y:[4,5]}}},netnames:{}});
  assert.equal(graph.edges.length,2);assert.ok(graph.edges.every(edge=>edge.label==='2'));
  assert.ok(graph.edges.some(edge=>edge.source==='port:a'&&edge.target==='cell:inv'));
  assert.ok(graph.edges.some(edge=>edge.source==='cell:inv'&&edge.target==='port:y'));
  assert.ok(graph.nodes.find(n=>n.id==='port:y')!.position.x>graph.nodes.find(n=>n.id==='cell:inv')!.position.x);
});

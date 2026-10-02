import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { Simulation } from 'eecircuit-engine';
import { STANDARD_SPICE_MODELS } from '../lib/spice-model-library';
import { validateSimulatorNetlist } from '../lib/simulator-netlist-policy';
import { circuitJsAnalysis } from '../lib/circuitjs-analysis';
import type { CircuitJsApi, CircuitJsElement } from '../lib/circuitjs';
import { stimulusPoints } from '../lib/native-stimulus';

test('published model parameters are copied without changing the original models', () => {
  for (const [id, model] of Object.entries(STANDARD_SPICE_MODELS)) {
    const extension = ['lm741','bc546b','bc556b'].includes(id) ? 'lib' : 'mod';
    const original = readFileSync(`public/spice-models/${['lm741','bc556b'].includes(id) ? id+'-ngspice' : id}.${extension}`, 'utf8').split(/\r?\n/).map(s => s.trim()).filter(s => s && !s.startsWith('*')).join('\n');
    assert.equal(model.line, original, id);
  }
  const original = readFileSync('public/spice-models/lm741.lib','utf8');
  const compatible = readFileSync('public/spice-models/lm741-ngspice.lib','utf8').split('\n').slice(1).join('\n');
  assert.equal(compatible, original.replace('EOS 7 1 POLY(1) 16 49 1E-3 1','EOS 7 107 16 49 1\nVOS 107 1 1E-3').replace('F6 50 99 POLY(1) V6 450U 1','F6 50 99 V6 1\nIOFF 50 99 450U'));
});

test('TI LM741, published diode/BJT and complementary VDMOS models solve in real ngspice', {timeout: 60_000}, async () => {
  const simulation = new Simulation(); await simulation.start();
  const decks = [
    { model: 'lm741', devices: 'VP vp 0 15\nVN vn 0 -15\nVIN vin 0 .1\nRI vin minus 10k\nRF out minus 100k\nX1 0 minus vp vn out LM741\nRL out 0 10k', node: 'out', min: -1.1, max: -.9 },
    { model: '1n4148', devices: 'V1 vin 0 5\nR1 vin out 1k\nD1 out 0 D1N4148/TEMP', node: 'out', min: .5, max: .9 },
    { model: 'bc546b', devices: 'V1 supply 0 5\nV2 base 0 .65\nR1 supply out 1k\nQ1 out base 0 BC546B', node: 'out', min: 2, max: 5 },
    { model: 'bc556b', devices: 'V1 supply 0 -5\nV2 base 0 -.65\nR1 supply out 1k\nQ1 out base 0 BC556B', node: 'out', min: -5, max: -.1 },
    { model: 'irfp240', devices: 'V1 supply 0 10\nV2 gate 0 6\nR1 supply out 100\nM1 out gate 0 IRFP240', node: 'out', min: 0, max: 1 },
    { model: 'irfp9240', devices: 'V1 supply 0 -10\nV2 gate 0 -6\nR1 supply out 100\nM1 out gate 0 IRFP9240', node: 'out', min: -1, max: 0 },
  ] as const;
  for (const fixture of decks) {
    const deck = `${fixture.devices}\n${STANDARD_SPICE_MODELS[fixture.model].line}\n.op\n.end`;
    validateSimulatorNetlist(deck);
    simulation.setNetList('* Standard model validation\n'+deck);
    const result = await simulation.runSim();
    assert.equal(result.dataType,'real',fixture.model);
    if(result.dataType!=='real') throw Error('Missing real solution');
    const voltage=result.data.find(series=>series.name.toLowerCase()===`v(${fixture.node})`)?.values[0];
    assert.ok(voltage!==undefined && voltage>=fixture.min && voltage<=fixture.max,`${fixture.model}: ${voltage}`);
  }
});

test('DC-source AC excitation and programmed bitstream use the actual edited native graph', {timeout:60_000}, async () => {
  function element(type:string,nodes:number[],attrs:string,label='') { return {getType:()=>type,getNodeId:(index:number)=>nodes[index],getPostCount:()=>nodes.length,getPostX:()=>0,getPostY:()=>0,getLabelName:()=>label,exportElement:()=>`<component ${attrs}/>`} as unknown as CircuitJsElement; }
  const elements=[element('VoltageElm',[0,1],'wf="0" maxv="5"'),element('ResistorElm',[1,2],'r="1000"'),element('ResistorElm',[2,0],'r="1000"'),element('LabeledNodeElm',[2],'','out')];
  const api={getElements:()=>elements,getStopMessage:()=>null} as unknown as CircuitJsApi;
  const settings={type:'ac-sweep',duration:.004,samples:1000,startHz:10,stopHz:1e5,dcStart:0,dcStop:5,dcStep:.1,acSource:0,acMagnitude:1,acScale:'octave',acPoints:5} as const;
  const ac=circuitJsAnalysis(api,settings);
  assert.match(ac.deck,/V1 node1 0 DC 5e0 AC 1e0 0/);
  assert.match(ac.deck,/\.ac oct 5 /);
  const generated=circuitJsAnalysis(api,{...settings,type:'transient',sourceOverrides:{0:{type:'bitstream',bits:'0101',bitPeriodS:.001,low:0,high:5,riseS:1e-6}}});
  assert.match(generated.deck,/PWL\(/);
  const simulation=new Simulation(); await simulation.start(); simulation.setNetList(generated.deck);
  const result=await simulation.runSim(); assert.equal(result.dataType,'real');
  if(result.dataType!=='real') throw Error('Missing transient');
  const time=result.data.find(series=>series.name==='time')!, out=result.data.find(series=>series.name.toLowerCase()==='v(out)')!;
  assert.ok(time && out);
  for(const [at,expected] of [[.0005,0],[.0015,2.5],[.0025,0],[.0035,2.5]]) {
    const index=time.values.findIndex(value=>value>=at); assert.ok(index>=0);
    assert.ok(Math.abs(out.values[index]-expected)<1e-6,`at ${at}: ${out.values[index]}`);
  }
  assert.throws(()=>stimulusPoints({type:'bitstream',bits:'1'.repeat(256),bitPeriodS:1e-12,low:0,high:5,riseS:1e-13,repeat:true},1),/500 bit periods/);
  assert.throws(()=>stimulusPoints({type:'pwl',points:[{timeS:0,value:0},{timeS:0,value:5}]},1),/increase strictly/);
});

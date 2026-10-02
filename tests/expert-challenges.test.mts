import assert from 'node:assert/strict';
import test from 'node:test';
import { Simulation } from 'eecircuit-engine';
import { expertChallenges } from '../lib/expert-challenges';
import { challenges } from '../lib/challenges';
import { evaluateDesignChecks } from '../lib/design-checks';
import { validateSimulatorNetlist } from '../lib/simulator-netlist-policy';
import { normalizeNgspiceResult } from '../lib/simulator-results';
import { validateCircuitJsText } from '../lib/circuitjs';

const solutions: Record<string, (deck: string) => string> = {
  'pipeline-residue-block': deck => deck.replace('RF residue minus 19k','RF residue minus 20k'),
  'r2r-dac-settling-budget': deck => deck.replace('CL dac 0 220p','CL dac 0 100p'),
  'sar-conversion-sequence': deck => deck.replace('V(dac)-V(vin)','V(vin)-V(dac)'),
  'delta-sigma-output-filter': deck => deck.replace('C1 out 0 220n','C1 out 0 1u'),
  'lm741-tia-compensation': deck => deck.replace('CF out nsum 2p','CF out nsum 100p'),
  'flash-adc-threshold-calibration': deck => deck.replace('VOFF ref2c ref2 .02','VOFF ref2c ref2 0'),
};

test('expert starters require actual changes and all six edited circuits pass real-ngspice checks', {timeout:60_000}, async () => {
  const simulation = new Simulation(); await simulation.start();
  assert.equal(expertChallenges.length,6);
  for(const challenge of expertChallenges) {
    assert.equal(challenge.judge,null,'Local practice targets must not claim authoritative grading');
    validateCircuitJsText(challenge.nativeCircuit!);
    for(const prerequisite of challenge.prerequisites??[]) assert.ok(challenges.some(candidate=>candidate.slug===prerequisite),prerequisite);
    assert.ok(challenge.designChecks?.length);
    for(const solved of [false,true]) {
      const deck=solved?solutions[challenge.slug](challenge.starterNetlist):challenge.starterNetlist;
      assert.notEqual(solutions[challenge.slug](challenge.starterNetlist),challenge.starterNetlist,'A solution must edit the actual circuit');
      const analysis=validateSimulatorNetlist(deck);
      simulation.setNetList('* Expert circuit regression\n'+deck);
      const raw=await simulation.runSim();
      const result=normalizeNgspiceResult(raw,analysis,[...new Set(challenge.designChecks.map(check=>check.node))],[],0);
      const checks=evaluateDesignChecks(challenge.designChecks,result);
      console.log(challenge.slug,solved?'edited':'starter',checks.map(check=>`${check.id}=${check.measured}`).join(', '));
      assert.equal(checks.every(check=>check.passed),solved,`${challenge.slug}: ${checks.map(check=>check.message).join('; ')}`);
    }
  }
});

test('checks require the right analysis and use time-weighted measurements on adaptive time steps', () => {
  const result={engine:'ngspice-wasm',analysis:'transient',xLabel:'Time',xUnit:'s',yLabel:'Voltage',yUnit:'V',x:[0,.1,1],traces:[{id:'out',name:'V(out)',node:'out',unit:'V',quantity:'voltage',values:[0,1,1]}],operatingPoint:[],warnings:[],runtimeMs:0} as const;
  const payload=structuredClone(result) as unknown as Parameters<typeof evaluateDesignChecks>[1];
  const mean=evaluateDesignChecks([{id:'mean',label:'Mean',node:'out',analysis:'transient',kind:'mean',from:0,to:1,min:.949,max:.951,unit:'V'}],payload);
  assert.ok(mean[0].passed); assert.ok(Math.abs(mean[0].measured!-.95)<1e-12);
  const wrong=evaluateDesignChecks([{id:'op',label:'OP',node:'out',analysis:'dc',kind:'sample',min:0,max:5,unit:'V'}],payload);
  assert.equal(wrong[0].measured,null); assert.equal(wrong[0].passed,false);
});

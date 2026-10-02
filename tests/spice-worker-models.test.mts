import assert from 'node:assert/strict';
import test from 'node:test';
import { STANDARD_SPICE_MODELS } from '../lib/spice-model-library';
import { validateSimulatorNetlist } from '../lib/simulator-netlist-policy';
import type { SimulatorWorkerMessage, SimulatorWorkerRequest } from '../lib/simulator-contract';

test('actual worker message path accepts B sources and the TI LM741 subcircuit', {timeout:15_000}, async () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis,'self');
  let readyResolve: (message: SimulatorWorkerMessage) => void = () => {};
  let resultResolve: (message: SimulatorWorkerMessage) => void = () => {};
  const ready = new Promise<SimulatorWorkerMessage>(resolve => { readyResolve=resolve; });
  const result = new Promise<SimulatorWorkerMessage>(resolve => { resultResolve=resolve; });
  const scope = { onmessage: null as null | ((event: {data:SimulatorWorkerRequest})=>Promise<void>), postMessage: (message:SimulatorWorkerMessage) => { if(message.type==='ready'||message.type==='initialization-error') readyResolve(message); else resultResolve(message); } };
  Object.setPrototypeOf(scope,globalThis);
  Object.defineProperty(globalThis,'self',{configurable:true,value:scope});
  try {
    await import('../app/workers/spice.worker');
    assert.equal((await ready).type,'ready');
    const netlist=`BINPUT vin 0 V=max(-1,min(1,.1))\nVP vp 0 15\nVN vn 0 -15\nRI vin minus 10k\nRF out minus 100k\nX1 0 minus vp vn out LM741\nRL out 0 10k\n${STANDARD_SPICE_MODELS.lm741.line}\n.op\n.end`;
    await scope.onmessage!({data:{type:'run',id:'b-and-x',netlist,probes:['out']}});
    const message=await result;
    assert.equal(message.type,'result');
    if(message.type!=='result') throw Error('Missing worker result');
    assert.equal(message.ok,true, !message.ok?message.error:'');
    const voltage=message.payload.operatingPoint.find(point=>point.name.toLowerCase()==='v(out)')?.value;
    assert.ok(voltage!==undefined&&voltage> -1.1&&voltage< -.9,String(voltage));
  } finally {
    if(previous) Object.defineProperty(globalThis,'self',previous); else Reflect.deleteProperty(globalThis,'self');
  }
});

test('subcircuit budgeting rejects recursive, deeply nested and oversized blocks before solver execution', () => {
  assert.throws(()=>validateSimulatorNetlist('X1 a b loop\n.subckt loop a b\nX2 a b loop\n.ends\n.op\n.end'),/Recursive/);
  assert.throws(()=>validateSimulatorNetlist('X1 a b missing\n.op\n.end'),/not defined/);
  const nested=Array.from({length:10},(_,index)=>`.subckt s${index} a b\n${index===9?'R1 a b 1k':`X1 a b s${index+1}`}\n.ends`).join('\n');
  assert.throws(()=>validateSimulatorNetlist('X1 a b s0\n'+nested+'\n.op\n.end'),/eight-level/);
  const exploding=Array.from({length:4},(_,index)=>`.subckt s${index} a b\n${index===3?'':Array.from({length:16},(_,instance)=>`X${instance} a b s${index+1}`).join('\n')}\n.ends`).join('\n');
  assert.throws(()=>validateSimulatorNetlist('X1 a b s0\n'+exploding+'\n.op\n.end'),/2048-device/);
  assert.throws(()=>validateSimulatorNetlist(Array.from({length:81},(_,index)=>`R${index} n${index} 0 1k`).join('\n')+'\n.op\n.end'),/80 top-level/);
});

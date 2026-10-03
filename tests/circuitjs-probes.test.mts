import assert from 'node:assert/strict';
import test from 'node:test';
import { probePosition, probeAttachment, clearProbeAttachment, spiceProbeMatches, spiceProbePayloadAppearance } from '../lib/circuitjs-probes';
import type { CircuitJsApi, CircuitJsElement, CircuitJsProbe } from '../lib/circuitjs';
import type { SimulationPayload } from '../lib/simulator-contract';
function wire() { return { getType:()=> 'RoutedWireElm', getNodeId:()=> 2, getPostCount:()=>2, getPostX:(i:number)=>i ? 100 : 0, getPostY:(i:number)=>i ? 100 : 0, getWirePath:()=>[{x:0,y:0},{x:100,y:0},{x:100,y:100}] } as unknown as CircuitJsElement; }
test('probe tips follow the actual routed native path as geometry moves',()=>{
 const element=wire();
 const probe={element,post:0,anchorFraction:.75} as CircuitJsProbe;
 assert.deepEqual(probePosition(probe),{x:100,y:50});
 assert.equal(probeAttachment(element,0,100,50,.75).anchorFraction,.75);
 element.getWirePath=()=>[{x:20,y:0},{x:100,y:0},{x:100,y:80}];
 assert.deepEqual(probePosition(probe),{x:100,y:40});
});

test('SPICE voltage and current phase retain exact probe identity and color without changing values or direction',()=>{
 const element=wire(), api={getElements:()=>[element]} as unknown as CircuitJsApi;
 const current={id:'current',kind:'current',element,post:0,color:'#123456'} as CircuitJsProbe;
 const voltage={...current,id:'voltage',kind:'voltage',color:'#abcdef'} as CircuitJsProbe;
 const bindings=[{element,expression:'I(V7)'}];
 const trace={id:'phase:i(v7)',name:'∠I(V7)',node:'i(v7)',quantity:'phase' as const,unit:'°',values:[-90,-45]};
 assert.equal(spiceProbeMatches(current,trace,api,bindings),true);
 assert.equal(spiceProbeMatches(voltage,trace,api,bindings),false);
 assert.equal(spiceProbeMatches(current,{name:'∠I(V1)',node:'i(v1)'},api,bindings),false);
 assert.equal(spiceProbeMatches(voltage,{name:'∠V(node2)',node:'node2'},api,bindings),true);
 const payload={engine:'ngspice-wasm',analysis:'ac',xLabel:'Frequency',xUnit:'Hz',yLabel:'Phase',yUnit:'°',x:[1,2],traces:[trace],operatingPoint:[],warnings:[],runtimeMs:0} as SimulationPayload;
 const styled=spiceProbePayloadAppearance(payload,[current,voltage],api,bindings);
 assert.equal(styled.traces[0].color,'#123456');
 assert.equal(styled.traces[0].values,trace.values);
 assert.equal(styled.traces[0].id,trace.id);
 assert.equal(styled.traces[0].name,trace.name);
});
test('automatic probe anchors use only wires on the same solved net',()=>{
 const element=wire(), node={getNodeId:()=>2,getPostX:()=>90,getPostY:()=>100} as unknown as CircuitJsElement;
 assert.equal(clearProbeAttachment([element],node,0).element,element);
 element.getNodeId=()=>3;
 assert.equal(clearProbeAttachment([element],node,0).element,node);
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { probePosition, probeAttachment, clearProbeAttachment } from '../lib/circuitjs-probes';
import type { CircuitJsElement, CircuitJsProbe } from '../lib/circuitjs';
function wire() { return { getType:()=> 'RoutedWireElm', getNodeId:()=> 2, getPostCount:()=>2, getPostX:(i:number)=>i ? 100 : 0, getPostY:(i:number)=>i ? 100 : 0, getWirePath:()=>[{x:0,y:0},{x:100,y:0},{x:100,y:100}] } as unknown as CircuitJsElement; }
test('probe tips follow the actual routed native path as geometry moves',()=>{
 const element=wire();
 const probe={element,post:0,anchorFraction:.75} as CircuitJsProbe;
 assert.deepEqual(probePosition(probe),{x:100,y:50});
 assert.equal(probeAttachment(element,0,100,50,.75).anchorFraction,.75);
 element.getWirePath=()=>[{x:20,y:0},{x:100,y:0},{x:100,y:80}];
 assert.deepEqual(probePosition(probe),{x:100,y:40});
});
test('automatic probe anchors use only wires on the same solved net',()=>{
 const element=wire(), node={getNodeId:()=>2,getPostX:()=>90,getPostY:()=>100} as unknown as CircuitJsElement;
 assert.equal(clearProbeAttachment([element],node,0).element,element);
 element.getNodeId=()=>3;
 assert.equal(clearProbeAttachment([element],node,0).element,node);
});

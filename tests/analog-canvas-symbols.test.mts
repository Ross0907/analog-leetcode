import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { analogPlacement, analogPrimitives, analogSymbolDefinition, drawAnalogPrimitive } from '../public/analog-canvas/renderer.js';

const manifest = JSON.parse(readFileSync('public/analog-canvas/symbols.json', 'utf8'));
test('textbook bodies retain exact pinned Analog Canvas source and license', () => {
  const hash = (file: string) => createHash('sha256').update(readFileSync(file)).digest('hex');
  assert.equal(manifest.revision, '85e6be67420a2395d5094325123b6debc1eb0286');
  assert.equal(hash('public/analog-canvas/source/razavi-catalog.generated.ts.txt'), '8a2aaf499ae19d33e28667951e633d36a3b765cf20974e465bce610c21985f49');
  assert.equal(hash('public/analog-canvas/LICENSE.md'), '0d96a4ff68ad6d4b6f1f30f713b18d5184912ba8dd389f86aa7710db079abcb0');
  assert.equal(Object.keys(manifest.symbols).length, 15);
});
test('MOS uses actual upstream three-terminal arrows without circles or a dangling bulk pin', () => {
  for (const id of ['nmos', 'pmos', 'npn', 'pnp']) {
    const primitives = analogPrimitives(manifest.symbols[id]);
    assert(!primitives.some((item: {kind: string; part: string}) => item.kind === 'circle' || item.part === 'bulk-lead'));
    assert(primitives.some((item: {kind: string}) => item.kind === 'polygon'));
  }
});
test('DC source is a single-cell battery with native positive terminal preserved', () => {
  const element = { getType: () => 'VoltageElm', getWaveform: () => 0, getPostCount: () => 2, getPostX: () => 0, getPostY: (post: number) => post * 64 };
  const definition = analogSymbolDefinition(element);
  assert.deepEqual(definition, ['battery', '-', '+']);
  const placement = analogPlacement(manifest.symbols.battery, definition, element);
  assert(placement);
  assert.deepEqual(placement.posts, [{ x: 0, y: 0 }, { x: 0, y: 64 }]);
  assert.equal(manifest.symbols.battery.primitives.filter((item: {kind: string}) => item.kind === 'polygon').length, 2);
});
test('BJT artwork leaves clearance at collector/emitter while native posts remain fixed', () => {
  const element = { getType: () => 'NTransistorElm', getPostCount: () => 3, getPostX: (post: number) => post === 0 ? 0 : 64, getPostY: (post: number) => post === 1 ? -16 : post === 2 ? 16 : 0 };
  const definition = analogSymbolDefinition(element), placement = analogPlacement(manifest.symbols.npn, definition, element);
  assert(placement);
  const point = (x: number, y: number) => { const m = placement.matrix; return { x: m[0] * x + m[2] * y + m[4], y: m[1] * x + m[3] * y + m[5] }; };
  // Exact upstream collector elbow and emitter arrow tip have built-in lead clearance.
  const collector = point(0, -13.379732), emitter = point(0, 13.377859);
  assert(Math.hypot(collector.x - 64, collector.y + 16) >= 8.4);
  assert(Math.hypot(emitter.x - 64, emitter.y - 16) >= 8.4);
  assert.deepEqual(placement.posts, [{x:0,y:0}, {x:64,y:-16}, {x:64,y:16}]);
});

test('ground bars always face downward without moving their electrical post', () => {
  for (const [x,y] of [[0,32],[0,-32],[32,0],[-32,0]]) {
    const elm={getType:()=> 'GroundElm',getPostCount:()=>1,getPostX:()=>200,getPostY:()=>160,getEndpointX:()=>200+x,getEndpointY:()=>160+y};
    const placement=analogPlacement(manifest.symbols.ground,analogSymbolDefinition(elm),elm);
    assert(placement); assert.equal(Math.abs(placement.matrix[1]),0); assert.equal(Math.abs(placement.matrix[2]),0);
    assert(placement.matrix[3]>0); assert.deepEqual(placement.posts,[{x:200,y:160}]);
    assert.equal(placement.matrix[5]+placement.matrix[3]*-10,160);
  }
});

test('symbol-fitting scale cannot make artwork strokes thinner than native wires', () => {
  const original=globalThis.Path2D;
  class Path { moveTo() {} lineTo() {} }
  Object.assign(globalThis,{Path2D:Path});
  try {
    for(const scale of [.25,.56,1,1.25]) {
      const context={lineWidth:0,stroke(){},fill(){}};
      drawAnalogPrimitive(context,{kind:'line',from:{x:0,y:0},to:{x:20,y:0},style:{strokeRole:'emphasis'}},scale);
      assert.equal(context.lineWidth*scale,2);
    }
  } finally { if(original)Object.assign(globalThis,{Path2D:original});else Reflect.deleteProperty(globalThis,'Path2D'); }
});

test('actual Analog Canvas op-amp retains signed inputs and outward output for every native rotation and flip', () => {
  for (const flip of [1,-1]) for (const angle of [0,Math.PI/2,Math.PI,Math.PI*1.5]) {
    const posts = [[0,-16*flip],[0,16*flip],[80,0]].map(([x,y]) => ({x:x*Math.cos(angle)-y*Math.sin(angle),y:x*Math.sin(angle)+y*Math.cos(angle)}));
    const element = {getType:()=> 'OpAmpElm',getPostCount:()=>3,getPostX:(p:number)=>posts[p].x,getPostY:(p:number)=>posts[p].y};
    const definition=analogSymbolDefinition(element), placed=analogPlacement(manifest.symbols.opamp,definition,element);
    assert(placed);
    const drawn=placed.pins.map((pin:{x:number;y:number}) => ({x:placed.matrix[0]*pin.x+placed.matrix[2]*pin.y+placed.matrix[4],y:placed.matrix[1]*pin.x+placed.matrix[3]*pin.y+placed.matrix[5]}));
    assert(Math.hypot(drawn[0].x-posts[0].x,drawn[0].y-posts[0].y) < Math.hypot(drawn[0].x-posts[1].x,drawn[0].y-posts[1].y));
    const outputProjection=drawn[2].x*Math.cos(angle)+drawn[2].y*Math.sin(angle);
    assert(outputProjection > 0 && outputProjection <= 80.00001);
  }
});

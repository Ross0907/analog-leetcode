import { test, expect, type Page } from '@playwright/test';
import type { CircuitJsApi } from '../../lib/circuitjs';
import { CIRCUITJS_STARTERS } from '../../lib/circuitjs-starters';
import { neutralCircuitJsPresentation } from '../../lib/circuitjs';

const circuit = `$ 4 0.000005 10 50 5 50 5e-11
v 96 240 96 80 0 0 40 10 0 0 0.5
w 96 80 160 80 0
r 160 80 320 80 0 1000
r 320 80 320 240 0 1000
w 320 240 96 240 0
g 96 240 96 288 0
207 320 80 320 32 4 output
207 480 80 528 80 4 output
r 480 80 480 240 0 1000000000
g 480 240 480 272 0`;

async function open(page: Page, text = circuit) {
  await page.goto(`/circuitjs/circuitjs.html?running=false&hideSidebar=true&hideInfoBox=true&cct=${encodeURIComponent('$ 4 0.000001 10 50 5 50 5e-11')}`);
  await expect.poll(() => page.evaluate(() => typeof (window as unknown as {CircuitJS1?: CircuitJsApi}).CircuitJS1?.getElements === 'function' && Boolean((window as unknown as {AnaCodeKiCad?:{ready:boolean}}).AnaCodeKiCad?.ready))).toBe(true);
  await page.evaluate(text => { const a=(window as unknown as {CircuitJS1:CircuitJsApi}).CircuitJS1; a.importCircuit(text,false); a.setTheme('light'); a.setSimRunning(true); },text);
  await expect.poll(() => page.evaluate(() => (window as unknown as {CircuitJS1:CircuitJsApi}).CircuitJS1.getElements().filter(e=>e.getType()==='ResistorElm').length)).toBeGreaterThan(0);
}
async function point(page: Page,x:number,y:number) { return page.evaluate(({x,y})=>{const a=(window as unknown as {CircuitJS1:CircuitJsApi}).CircuitJS1,r=document.querySelector('canvas')!.getBoundingClientRect();return{x:r.left+a.screenX(x),y:r.top+a.screenY(y)};},{x,y}); }
async function xml(page: Page) { return page.evaluate(() => (window as unknown as {CircuitJS1:CircuitJsApi}).CircuitJS1.exportCircuit()); }

test('value text drags independently, saves and undoes; double click changes the real native value',async({page})=>{
  await open(page); const start=await point(page,240,60), end=await point(page,270,20);
  const initial=await xml(page);
  await page.mouse.move(start.x,start.y); await page.mouse.down(); await page.mouse.move(end.x,end.y,{steps:8}); await page.mouse.up();
  let saved=await xml(page); expect(saved).toContain('atx="30"'); expect(saved).toContain('aty="-40"');
  expect(await page.evaluate(()=>{const a=(window as unknown as {CircuitJS1:CircuitJsApi}).CircuitJS1,e=a.getElements().find(e=>e.getType()==='ResistorElm')!;return [e.getPostX(0),e.getPostY(0),e.getPostX(1),e.getPostY(1)];})).toEqual([160,80,320,80]);
  await page.keyboard.press('Control+z'); await expect.poll(()=>xml(page)).toBe(initial);
  await page.keyboard.press('Control+y'); await expect.poll(()=>xml(page)).toBe(saved);
  // Redo imports the saved drawing and fits its new caption bounds. Reproject
  // the saved world position instead of clicking the pre-import screen pixel.
  const restored=await point(page,270,20);
  await page.mouse.dblclick(restored.x,restored.y); const input=page.getByRole('textbox',{name:'Resistance (ohms)',exact:true});
  await expect(input).toBeVisible(); await input.fill('2k'); await input.press('Enter');
  await expect.poll(()=>page.evaluate(()=>{const a=(window as unknown as {CircuitJS1:CircuitJsApi}).CircuitJS1;return a.getElements().find(e=>e.getType()==='ResistorElm'&&e.getPostX(0)===320)?.getVoltage(0);})).toBeCloseTo(10/3,5);
  saved=await xml(page); await page.evaluate(text=>(window as unknown as {CircuitJS1:CircuitJsApi}).CircuitJS1.importCircuit(text,false),saved);
  expect(await xml(page)).toContain('aty="-40"');
  await page.screenshot({path:'.tmp/native-annotations-value.png'});
});

test('net label text clears its wire, rotates and drags with native XML undo and electrical name intact',async({page})=>{
  await open(page);
  const initial=await xml(page);
  expect(await page.evaluate(()=>{const a=(window as unknown as {CircuitJS1:CircuitJsApi}).CircuitJS1,l=a.getElements().filter(e=>e.getType()==='LabeledNodeElm');return l[0].getNodeId(0)===l[1].getNodeId(0);})).toBe(true);
  await page.evaluate(()=>{const a=(window as unknown as {CircuitJS1:CircuitJsApi}).CircuitJS1;return a.getElements().find(e=>e.getType()==='LabeledNodeElm')!.setLabelAngle!(90);});
  expect(await xml(page)).toContain('ata="90"');
  await page.keyboard.press('Control+z'); await expect.poll(()=>xml(page)).toBe(initial);
  await page.keyboard.press('Control+y'); await expect.poll(()=>xml(page)).toContain('ata="90"');
  await page.evaluate(()=>{const a=(window as unknown as {CircuitJS1:CircuitJsApi}).CircuitJS1;return a.getElements().find(e=>e.getType()==='LabeledNodeElm')!.setLabelAngle!(0);});
  const start=await point(page,357,49),end=await point(page,397,9);
  await page.mouse.move(start.x,start.y);await page.mouse.down();await page.mouse.move(end.x,end.y,{steps:8});await page.mouse.up();
  const saved=await xml(page);expect(saved).toContain('atx="40"');expect(saved).toContain('aty="-40"');
  await page.evaluate(text=>(window as unknown as {CircuitJS1:CircuitJsApi}).CircuitJS1.importCircuit(text,false),saved);
  await expect.poll(()=>page.evaluate(()=>{const a=(window as unknown as {CircuitJS1:CircuitJsApi}).CircuitJS1,l=a.getElements().filter(e=>e.getType()==='LabeledNodeElm');return l[0].getNodeId(0)===l[1].getNodeId(0)&&l[0].getNodeId(0)>0;})).toBe(true);
  await page.screenshot({path:'.tmp/native-annotations-label.png'});
});

test('selected op amp has no phantom center-input handle',async({page})=>{
  await open(page,`${circuit}\na 608 160 736 160 0 15 -15 1000000 0 0 100000`);
  const center=await point(page,608,160),body=await point(page,670,160);await page.mouse.move(body.x,body.y);
  await expect.poll(()=>page.evaluate(()=> (window as unknown as {CircuitJS1:CircuitJsApi}).CircuitJS1.getHoveredElement()?.getType())).toBe('OpAmpElm');
  await page.waitForTimeout(100);
  const selected=await page.evaluate(({x,y})=>{const canvas=document.querySelector('canvas')!,r=canvas.getBoundingClientRect(),ctx=canvas.getContext('2d')!,sx=canvas.width/r.width,sy=canvas.height/r.height;const p=ctx.getImageData(Math.round((x-r.left)*sx)-2,Math.round((y-r.top)*sy)-2,5,5).data;let yellow=0;for(let i=0;i<p.length;i+=4)if(p[i]>190&&p[i+1]>110&&p[i+1]<210&&p[i+2]<140)yellow++;return yellow;},center);
  expect(selected).toBe(0);await page.screenshot({path:'.tmp/native-annotations-opamp-selected.png'});
});

test('live scalar wire current is solved before every accepted timestep callback',async({page})=>{
  await open(page,circuit.replace('0 0 40 10 0 0 0.5','0 1 1000 10 0 0 0.5'));
  const result=await page.evaluate(()=>new Promise<{error:number,span:number,count:number}>(resolve=>{
    const a=(window as unknown as {CircuitJS1:CircuitJsApi}).CircuitJS1;
    const r=a.getElements().find(e=>e.getType()==='ResistorElm')!,w=a.getElements().find(e=>e.getType()==='WireElm')!;
    const values:number[]=[], errors:number[]=[];
    a.ontimestep=()=>{
      values.push(w.getCurrent());errors.push(Math.abs(w.getCurrent()-r.getCurrent()));
      if(values.length>=128){a.ontimestep=undefined;a.setSimRunning(false);resolve({error:Math.max(...errors),span:Math.max(...values)-Math.min(...values),count:values.length});}
    };a.setSimRunning(true);
  }));
  expect(result.count).toBe(128);expect(result.span).toBeGreaterThan(.001);expect(result.error).toBeLessThan(1e-10);
});

test('dark MOS presentation and rotated flag label preserve native posts and net identity',async({page})=>{
  await open(page);
  await page.evaluate(text=>{const a=(window as unknown as {CircuitJS1:CircuitJsApi}).CircuitJS1;a.importCircuit(text,false);a.setTheme('dark');a.setSimRunning(false);a.ensureAnalyzed?.();},neutralCircuitJsPresentation(CIRCUITJS_STARTERS['cmos-inverter-trip-point']));
  const before=await page.evaluate(()=>{const a=(window as unknown as {CircuitJS1:CircuitJsApi}).CircuitJS1;return a.getElements().map(e=>Array.from({length:e.getPostCount()},(_,n)=>[e.getPostX(n),e.getPostY(n),e.getNodeId(n)]));});
  expect(await page.evaluate(()=>{const a=(window as unknown as {CircuitJS1:CircuitJsApi}).CircuitJS1,e=a.getElements().find(e=>e.getType()==='LabeledNodeElm')!;return [e.setLabelStyle!('flag'),e.setLabelAngle!(270)];})).toEqual([null,null]);
  await page.evaluate(()=> (window as unknown as {CircuitJS1:CircuitJsApi}).CircuitJS1.ensureAnalyzed?.());
  const after=await page.evaluate(()=>{const a=(window as unknown as {CircuitJS1:CircuitJsApi}).CircuitJS1;return a.getElements().map(e=>Array.from({length:e.getPostCount()},(_,n)=>[e.getPostX(n),e.getPostY(n),e.getNodeId(n)]));});
  expect(after).toEqual(before);await page.waitForTimeout(150);await page.screenshot({path:'.tmp/native-annotations-mos-dark.png'});
});

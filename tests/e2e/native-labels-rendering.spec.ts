import { expect, test, type Page } from '@playwright/test';
import type { CircuitJsApi } from '../../lib/circuitjs';
import type { AdvancedCircuitJsApi } from '../../lib/circuitjs-advanced';

const blank='/circuitjs/circuitjs.html?running=false&hideSidebar=true&hideInfoBox=true&cct=%24%204%200.000001%2010%2050%205%2050';
const divider='$ 4 .000001 10 50 5 50\nv 96 240 96 80 0 0 40 10 0 0 .5\nw 96 80 160 80 0\nr 160 80 320 80 0 1000\nr 320 80 320 240 0 1000\nw 320 240 96 240 0\ng 96 240 96 288 0';
async function open(page:Page,text=divider) {
  await page.goto(blank);
  await page.waitForFunction(()=>Boolean((window as unknown as {CircuitJS1?:CircuitJsApi;AnaCodeKiCad?:{ready:boolean}}).CircuitJS1?.hitTest&&(window as unknown as {AnaCodeKiCad?:{ready:boolean}}).AnaCodeKiCad?.ready));
  await page.evaluate(text=>{const api=(window as unknown as {CircuitJS1:CircuitJsApi}).CircuitJS1;api.importCircuit(text,false);api.setSimRunning(true);api.stepSimulation!(5,8);},text);
}

test('delayed symbol assets honor the latest dark theme and opamp has exactly two visible input leads',async({page})=>{
  let release!:()=>void, waiting=0;
  const gate=new Promise<void>(resolve=>{release=resolve;});
  await page.route('**/kicad/svg/**',async route=>{waiting++;await gate;await route.continue();});
  await page.goto(blank);
  await page.waitForFunction(()=>typeof (window as unknown as {CircuitJS1?:CircuitJsApi}).CircuitJS1?.setTheme==='function');
  await expect.poll(()=>waiting).toBeGreaterThan(0);
  await page.evaluate(()=>{const api=(window as unknown as {CircuitJS1:CircuitJsApi}).CircuitJS1;api.setTheme('dark');api.importCircuit('$ 4 .000001 10 50 5 50\na 160 160 288 160 8 15 -15 1000000 0 0 100000',false);});
  release();
  await page.waitForFunction(()=>Boolean((window as unknown as {AnaCodeKiCad?:{ready:boolean}}).AnaCodeKiCad?.ready));
  const samples=()=>page.evaluate(()=>{
    const api=(window as unknown as {CircuitJS1:CircuitJsApi}).CircuitJS1,canvas=document.querySelector('canvas')!,context=canvas.getContext('2d')!;
    const ratio=canvas.width/canvas.getBoundingClientRect().width;
    const count=(x:number,y:number,width:number,height:number)=>{
      const left=Math.floor(api.screenX(x)*ratio),top=Math.floor(api.screenY(y)*ratio),w=Math.max(1,Math.ceil((api.screenX(x+width)-api.screenX(x))*ratio)),h=Math.max(1,Math.ceil((api.screenY(y+height)-api.screenY(y))*ratio));
      const pixels=context.getImageData(left,top,w,h).data;let ink=0;
      for(let i=0;i<pixels.length;i+=4)if(pixels[i]>140&&pixels[i+1]>140&&pixels[i+2]>140)ink++;
      return ink;
    };
    return {top:count(166,142,12,4),bottom:count(166,174,12,4),middle:count(166,158,12,4),body:count(198,145,56,31)};
  });
  await expect.poll(async()=> (await samples()).body).toBeGreaterThan(20);
  const actual=await samples(); expect(actual.top).toBeGreaterThan(5);expect(actual.bottom).toBeGreaterThan(5);expect(actual.middle).toBe(0);
});

test('native point picking finds real wires without hovering and rejects the opamp body',async({page})=>{
  await open(page);
  const found=await page.evaluate(()=>{
    const api=(window as unknown as {CircuitJS1:CircuitJsApi}).CircuitJS1;
    const hit=api.hitTest!(api.screenX(128),api.screenY(80)+4);
    const terminal=api.hitTest!(api.screenX(320),api.screenY(80));
    return {wire:hit?.wire,x:hit?.x,y:hit?.y,voltage:hit?.element.getVoltage(hit.post),distance:hit?.distance,terminal:terminal?.element.getNodeId(terminal.post),empty:api.hitTest!(api.screenX(240),api.screenY(160))};
  });
  expect(found.wire).toBe(true);expect(found.x).toBeCloseTo(128,0);expect(found.y).toBe(80);expect(found.voltage).toBeCloseTo(10,6);expect(found.distance).toBeLessThanOrEqual(5);expect(found.terminal).toBeGreaterThan(0);expect(found.empty).toBeNull();
  await page.evaluate(()=>{const api=(window as unknown as {CircuitJS1:CircuitJsApi}).CircuitJS1;api.importCircuit('$ 4 .000001 10 50 5 50\na 160 160 288 160 8 15 -15 1000000 0 0 100000',false);});
  expect(await page.evaluate(()=>{const api=(window as unknown as {CircuitJS1:CircuitJsApi}).CircuitJS1;return api.hitTest!(api.screenX(224),api.screenY(160));})).toBeNull();
});

test('plain and flag labels share actual electrical nets, persist, and use native placement',async({page})=>{
  await open(page,'$ 4 .000001 10 50 5 50\nv 96 240 96 80 0 0 40 5 0 0 .5\ng 96 240 96 272 0\n207 96 80 176 80 0 shared\nr 352 80 352 240 0 1000\ng 352 240 352 272 0');
  expect(await page.evaluate(()=> (window as unknown as {CircuitJS1:CircuitJsApi}).CircuitJS1.addNetLabel!('shared','flag'))).toBeNull();
  const points=await page.evaluate(()=>{const api=(window as unknown as {CircuitJS1:CircuitJsApi}).CircuitJS1,rect=document.querySelector('canvas')!.getBoundingClientRect();return [352,432].map(x=>({x:rect.left+api.screenX(x),y:rect.top+api.screenY(80)}));});
  await page.mouse.move(points[0].x,points[0].y);await page.mouse.down();await page.mouse.move(points[1].x,points[1].y,{steps:5});await page.mouse.up();await page.keyboard.press('Escape');
  await expect.poll(()=>page.evaluate(()=> (window as unknown as {CircuitJS1:CircuitJsApi}).CircuitJS1.getElements().find(e=>e.getType()==='ResistorElm')!.getVoltageDiff())).toBeCloseTo(5,6);
  const state=await page.evaluate(()=>{
    const api=(window as unknown as {CircuitJS1:CircuitJsApi}).CircuitJS1,labels=api.getElements().filter(e=>e.getType()==='LabeledNodeElm');
    const before=labels.map(e=>({name:e.getLabelName(),style:e.getLabelStyle!(),node:e.getNodeId(0)}));
    const voltage=api.getElements().find(e=>e.getType()==='ResistorElm')!.getVoltageDiff();
    const xml=api.exportCircuit();api.importCircuit(xml,false);api.setSimRunning(true);api.stepSimulation!(5,8);
    return {before,voltage,after:api.getElements().filter(e=>e.getType()==='LabeledNodeElm').map(e=>({style:e.getLabelStyle!(),node:e.getNodeId(0)})),xml};
  });
  expect(state.before).toHaveLength(2);expect(state.before.map(e=>e.style)).toEqual(['plain','flag']);expect(new Set(state.before.map(e=>e.node)).size).toBe(1);expect(state.voltage).toBeCloseTo(5,6);expect(state.after.map(e=>e.style)).toEqual(['plain','flag']);expect(new Set(state.after.map(e=>e.node)).size).toBe(1);
});

test('routed wire picking reports its real polyline and path fraction at a bend-side segment',async({page})=>{
  await open(page);
  const points=await page.evaluate(()=>{const api=(window as unknown as {CircuitJS1:CircuitJsApi}).CircuitJS1,rect=document.querySelector('canvas')!.getBoundingClientRect();api.startWire();return [[416,80],[512,160]].map(([x,y])=>({x:rect.left+api.screenX(x),y:rect.top+api.screenY(y)}));});
  await page.mouse.click(points[0].x,points[0].y);await page.mouse.move(points[1].x,points[1].y);await page.mouse.click(points[1].x,points[1].y);await page.keyboard.press('Escape');
  const result=await page.evaluate(()=>{
    const api=(window as unknown as {CircuitJS1:CircuitJsApi}).CircuitJS1,wire=api.getElements().find(e=>e.getType()==='RoutedWireElm')!,path=wire.getWirePath!()!;
    const lengths=path.slice(1).map((p,i)=>Math.hypot(p.x-path[i].x,p.y-path[i].y));
    const index=lengths.indexOf(Math.max(...lengths)),a=path[index],b=path[index+1],x=(a.x+b.x)/2,y=(a.y+b.y)/2;
    const hit=api.hitTest!(api.screenX(x),api.screenY(y))!;
    return {path,x,y,hitX:hit.x,hitY:hit.y,same:hit.element===wire,fraction:hit.pathFraction,expected:(lengths.slice(0,index).reduce((a,b)=>a+b,0)+lengths[index]/2)/lengths.reduce((a,b)=>a+b,0)};
  });
  expect(result.path.length).toBeGreaterThanOrEqual(3);expect(result.same).toBe(true);expect(result.hitX).toBeCloseTo(result.x,0);expect(result.hitY).toBeCloseTo(result.y,0);expect(result.fraction).toBeCloseTo(result.expected,2);
});

test('reset retains probes and source tables while ground artwork faces down and PWL metadata is truthful',async({page})=>{
  await open(page,divider.replace('g 96 240 96 288','g 96 240 32 240'));
  const result=await page.evaluate(()=>{
    const api=(window as unknown as {CircuitJS1:AdvancedCircuitJsApi}).CircuitJS1,old=api.getElements();
    api.setSourceWaveform(0,'pwl','0 0 .001 6 .002 0',.002);api.setMaxTimeStep(.00001);api.stepSimulation!(20,8);api.setSimRunning(false);
    const before=api.getTime();api.resetSimulation!();
    const ground=api.getElements().find(e=>e.getType()==='GroundElm')!;
    const xml=new DOMParser().parseFromString(ground.exportElement(),'application/xml');
    return {before,time:api.getTime(),running:api.isRunning(),identities:old.every((e,i)=>api.getElements()[i]===e),info:old[0].getInfo(),source:old[0].exportElement(),ground:xml.documentElement.getAttribute('x'),post:[ground.getPostX(0),ground.getPostY(0)]};
  });
  expect(result.before).toBeGreaterThan(0);expect(result.time).toBe(0);expect(result.running).toBe(false);expect(result.identities).toBe(true);expect(result.info.join(' ')).toContain('PWL');expect(result.info.join(' ')).not.toContain('Hz');expect(result.source).toContain('pwl=');expect(result.post).toEqual([96,240]);expect(result.ground).toBe('96 240 96 264');
});

test('palette sources place vertically with a real grounded return and preserve imported floating sources',async({page})=>{
  const loads=[320,448,576].map(x=>`w ${x} 160 ${x+32} 160 0\nr ${x+32} 160 ${x+32} 256 0 1000\nw ${x+32} 256 ${x} 256 0`).join('\n');
  await open(page,'$ 4 .000001 10 50 5 50\nv 96 96 192 96 0 0 40 .02 0 0 .5\nr 96 96 96 240 0 1000\ng 96 240 96 272 0\nr 192 96 192 240 0 1000\ng 192 240 192 272 0\n'+loads);
  const original=await page.evaluate(()=> (window as unknown as {CircuitJS1:CircuitJsApi}).CircuitJS1.getElements()[0].exportElement());
  for(const [index,type] of ['DCVoltageElm','ACVoltageElm','CurrentElm'].entries()) {
    const points=await page.evaluate(({index,type})=>{const api=(window as unknown as {CircuitJS1:CircuitJsApi}).CircuitJS1,rect=document.querySelector('canvas')!.getBoundingClientRect();api.addElement(type);return [[320+index*128,160],[368+index*128,256]].map(([x,y])=>({x:rect.left+api.screenX(x),y:rect.top+api.screenY(y)}));},{index,type});
    await page.mouse.move(points[0].x,points[0].y);await page.mouse.down();await page.mouse.move(points[1].x,points[1].y,{steps:6});await page.mouse.up();await page.keyboard.press('Escape');
  }
  const state=await page.evaluate(()=>{
    const api=(window as unknown as {CircuitJS1:CircuitJsApi}).CircuitJS1;api.setSimRunning(true);api.stepSimulation!(5,8);
    const all=api.getElements(),sources=all.filter(e=>['VoltageElm','DCVoltageElm','ACVoltageElm','CurrentElm'].includes(e.getType())).slice(1),grounds=all.filter(e=>e.getType()==='GroundElm');
    return {original:all[0].exportElement(),stop:api.getStopMessage(),sources:sources.map(e=>({x0:e.getPostX(0),x1:e.getPostX(1),y0:e.getPostY(0),y1:e.getPostY(1),returnNode:e.getNodeId(0),outputNode:e.getNodeId(1),voltage:e.getVoltage(1),ground:grounds.some(g=>g.getPostX(0)===e.getPostX(0)&&g.getPostY(0)===e.getPostY(0))})),grounds:grounds.length};
  });
  expect(state.original).toBe(original);expect(state.sources).toHaveLength(3);expect(state.grounds).toBe(5);expect(state.stop).toBeNull();
  for(const source of state.sources){expect(source.x0).toBe(source.x1);expect(source.y0).toBeGreaterThan(source.y1);expect(source.ground).toBe(true);expect(source.returnNode).toBe(0);expect(source.outputNode).toBeGreaterThan(0);expect(Number.isFinite(source.voltage)).toBe(true);}
  expect(state.sources[0].voltage).toBeCloseTo(5,5);
  await page.keyboard.press('Control+z');
  await expect.poll(()=>page.evaluate(()=> (window as unknown as {CircuitJS1:CircuitJsApi}).CircuitJS1.getElements().filter(e=>e.getType()==='GroundElm').length)).toBe(4);
});

test('sine source has visible interior waveform ink and PWL uses an explicit arbitrary-waveform mark',async({page})=>{
  await open(page,divider.replace('0 0 40 10','0 1 40 10'));
  await page.evaluate(()=> (window as unknown as {CircuitJS1:CircuitJsApi}).CircuitJS1.setTheme('light'));
  await expect.poll(()=>page.evaluate(()=>{
    const api=(window as unknown as {CircuitJS1:CircuitJsApi}).CircuitJS1,canvas=document.querySelector('canvas')!,ctx=canvas.getContext('2d')!,ratio=canvas.width/canvas.getBoundingClientRect().width;
    // Strictly inside the unchanged circle: an empty circle has no dark pixels here.
    const x=Math.round(api.screenX(90)*ratio),y=Math.round(api.screenY(155)*ratio),w=Math.max(1,Math.round((api.screenX(102)-api.screenX(90))*ratio)),h=Math.max(1,Math.round((api.screenY(165)-api.screenY(155))*ratio));
    const pixels=ctx.getImageData(x,y,w,h).data;let count=0;
    for(let i=0;i<pixels.length;i+=4)if(pixels[i]<90&&pixels[i+1]<90&&pixels[i+2]<90)count++;
    return count;
  })).toBeGreaterThan(8);
  await page.evaluate(()=>{
    const win=window as unknown as {CircuitJS1:AdvancedCircuitJsApi;pwlMark?:boolean},ctx=document.querySelector('canvas')!.getContext('2d')!,original=ctx.fillText.bind(ctx);
    ctx.fillText=(text:string,x:number,y:number,maxWidth?:number)=>{if(text==='PWL')win.pwlMark=true;if(maxWidth===undefined)original(text,x,y);else original(text,x,y,maxWidth);};
    win.CircuitJS1.setSourceWaveform(0,'pwl','0 0 .001 6 .002 0',.002);
  });
  await expect.poll(()=>page.evaluate(()=>Boolean((window as unknown as {pwlMark?:boolean}).pwlMark))).toBe(true);
});

test('paused analysis resolves native nodes immediately without advancing time or replacing elements',async({page})=>{
  await open(page);
  const result=await page.evaluate(()=>{
    const api=(window as unknown as {CircuitJS1:CircuitJsApi}).CircuitJS1;
    api.setSimRunning(false);api.importCircuit('$ 4 .000001 10 50 5 50\nv 96 240 96 80 0 0 40 10 0 0 .5\nr 96 80 320 80 0 1000\nc 320 80 320 240 0 .000001 0\nw 320 240 96 240 0\ng 96 240 96 272 0',false);
    const before=api.getElements(),time=api.getTime();let hooks=0;api.onanalyze=()=>{hooks++;};
    const initial=api.ensureAnalyzed!(),nodes=before.map(e=>Array.from({length:e.getPostCount()},(_,p)=>e.getNodeId(p)));
    before.find(e=>e.getType()==='ResistorElm')!.setEditableValue('2000');const edited=api.ensureAnalyzed!();
    return {initial,edited,nodes,time,afterTime:api.getTime(),running:api.isRunning(),identities:before.every((e,i)=>e===api.getElements()[i]),hooks};
  });
  expect(result.initial).toBeNull();expect(result.edited).toBeNull();expect(result.nodes.flat().every(id=>id>=0)).toBe(true);expect(result.afterTime).toBe(result.time);expect(result.running).toBe(false);expect(result.identities).toBe(true);expect(result.hooks).toBe(2);
  const invalid=await page.evaluate(()=>{
    const api=(window as unknown as {CircuitJS1:CircuitJsApi}).CircuitJS1;
    api.importCircuit('$ 4 .000001 10 50 5 50\nL 96 160 96 80 0 1 false 5 0\ng 96 160 96 192 0',false);
    return {error:api.ensureAnalyzed!(),nativeError:api.getStopMessage(),time:api.getTime(),running:api.isRunning()};
  });
  expect(invalid.error).toBeTruthy();expect(invalid.error).toBe(invalid.nativeError);expect(invalid.time).toBe(0);expect(invalid.running).toBe(false);
});

test('vertical global label moves its text clear of adjacent ground without changing its electrical post',async({page})=>{
  await open(page);
  await page.evaluate(()=>{
    const win=window as unknown as {CircuitJS1:CircuitJsApi;labelDraw?:{x:number;y:number;clearanceX:number}},canvas=document.querySelector('canvas')!,ctx=canvas.getContext('2d')!,original=ctx.fillText.bind(ctx);
    ctx.fillText=(text:string,x:number,y:number,maxWidth?:number)=>{
      if(text==='b0'){
        // Labels can translate/rotate their local text origin independently.
        // Project through the real canvas transform, then compare in CSS pixels
        // with the native ground-clearance coordinate (including HiDPI scaling).
        const rendered=new DOMPoint(x,y).matrixTransform(ctx.getTransform()),bounds=canvas.getBoundingClientRect();
        win.labelDraw={x:rendered.x/(canvas.width/bounds.width),y:rendered.y/(canvas.height/bounds.height),clearanceX:win.CircuitJS1.screenX(174)};
      }
      if(maxWidth===undefined)original(text,x,y);else original(text,x,y,maxWidth);
    };
    win.CircuitJS1.importCircuit('$ 4 .000001 10 50 5 50\nv 160 208 160 160 0 0 40 5 0 0 .5\ng 160 208 160 240 0\n207 160 160 160 224 0 b0\nr 160 160 256 160 0 1000\nw 256 160 256 208 0\nw 256 208 160 208 0',false);
    win.CircuitJS1.ensureAnalyzed!();
  });
  await expect.poll(()=>page.evaluate(()=>{const draw=(window as unknown as {labelDraw?:{x:number;clearanceX:number}}).labelDraw;return draw?draw.x-draw.clearanceX:-Infinity;})).toBeGreaterThan(0);
  const label=await page.evaluate(()=>{
    const api=(window as unknown as {CircuitJS1:CircuitJsApi}).CircuitJS1,e=api.getElements().find(e=>e.getType()==='LabeledNodeElm')!;
    return {post:[e.getPostX(0),e.getPostY(0)],node:e.getNodeId(0),sourceNode:api.getElements()[0].getNodeId(1),name:e.getLabelName(),xml:e.exportElement()};
  });
  expect(label.post).toEqual([160,160]);expect(label.node).toBe(label.sourceNode);expect(label.name).toBe('b0');expect(label.xml).toContain('160 160 160 224');
});

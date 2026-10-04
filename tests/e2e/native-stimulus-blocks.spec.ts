import { expect, test } from '@playwright/test';
import type { AdvancedCircuitJsApi } from '../../lib/circuitjs-advanced';
import type { CircuitJsElement } from '../../lib/circuitjs';
import { circuitJsAnalysis } from '../../lib/circuitjs-analysis';

test.use({video:'off'});
const blank='/circuitjs/circuitjs.html?running=false&hideSidebar=true&cct=%24%201%200.000001%2010%2050%205%2050';

test('native programmed PWL repeats, persists in XML, and rejects unrelated inline numeric edits', async ({page}) => {
  await page.goto(blank);
  await page.waitForFunction(()=>Boolean((window as unknown as {CircuitJS1?:AdvancedCircuitJsApi}).CircuitJS1?.setSourceWaveform));
  const result=await page.evaluate(async()=>{
    const api=(window as unknown as {CircuitJS1:AdvancedCircuitJsApi}).CircuitJS1;
    api.importCircuit('$ 1 .000001 10 50 5 50\nv 128 320 128 128 0 0 40 5 0 0 .5\ng 128 320 128 352 0\nr 128 128 352 128 0 1000\nr 352 128 352 320 0 1000\ng 352 320 352 352 0\n207 352 128 432 128 0 out\n',false);
    const source=api.getElements()[0], count=api.getElements().length;
    const error=api.setSourceWaveform(0,'pwl','0 0 .001 2 .002 0',.002);
    if(error) throw Error(error);
    const xml=api.exportCircuit();
    api.importCircuit(xml,false); api.setMaxTimeStep(1e-6);
    const voltage=await new Promise<number>((resolve,reject)=>{
      const timeout=setTimeout(()=>reject(Error(api.getStopMessage()??'PWL simulation stalled')),5000);
      api.ontimestep=()=>{if(api.getTime()>=.0025){api.ontimestep=undefined;api.setSimRunning(false);clearTimeout(timeout);resolve(api.getNodeVoltage('out'));}};
      api.setSimRunning(true);
    });
    const reloaded=api.getElements()[0];
    const persisted=reloaded.exportElement();
    const editError=reloaded.setEditableValue('3');
    return {voltage,xml,persisted,edited:reloaded.exportElement(),editError,count,afterCount:api.getElements().length,initialType:source.getType()};
  });
  expect(result.voltage).toBeCloseTo(.5,2);
  expect(result.xml).toContain('pwl='); expect(result.persisted).toContain('pwlr=');
  expect(result.editError).toBe('This value is not editable.'); expect(result.edited).toBe(result.persisted);
  expect(result.afterCount).toBe(result.count);
  expect(result.initialType).toBe('VoltageElm');
});

test('a learner native block is saved, placed and analyzed beside a real opamp without duplicating IC internals', async ({page})=>{
  await page.goto(blank);
  await page.waitForFunction(()=>Boolean((window as unknown as {CircuitJS1?:AdvancedCircuitJsApi}).CircuitJS1?.exportNativeBlock));
  await page.evaluate(()=>{
    const api=(window as unknown as {CircuitJS1:AdvancedCircuitJsApi}).CircuitJS1;
    api.importCircuit('$ 1 .000001 10 50 5 50\nr 128 128 352 128 0 1000\nr 352 128 352 320 0 1000\ng 352 320 352 352 0\n207 128 128 64 128 0 vin\n207 352 128 432 128 0 vout\n',false);
    const model=api.exportNativeBlock('TestDividerBlock');
    if(!model.includes('<ccm'))throw Error('Native block definition missing');
    api.importCircuit('$ 1 .000001 10 50 5 50\n',false);
    api.importCircuit(model,true);
    const error=api.insertNativeBlock('TestDividerBlock'); if(error)throw Error(error);
  });
  const canvas=page.locator('canvas').first();
  const bounds=await canvas.boundingBox(); if(!bounds)throw Error('Native canvas unavailable');
  await page.mouse.move(bounds.x+bounds.width*.35,bounds.y+bounds.height*.35);
  await page.mouse.down(); await page.mouse.move(bounds.x+bounds.width*.5,bounds.y+bounds.height*.45); await page.mouse.up();
  await expect.poll(()=>page.evaluate(()=>(window as unknown as {CircuitJS1:AdvancedCircuitJsApi}).CircuitJS1.getElements().filter(element=>element.getType()==='CustomCompositeElm').length)).toBe(1);
  const snapshot=await page.evaluate(async()=>{
    const api=(window as unknown as {CircuitJS1:AdvancedCircuitJsApi}).CircuitJS1;
    api.cancelDrawing();
    // Append the native IC to the complete serialized circuit. The import
    // API's true flag imports model definitions only, not component instances.
    const withAmplifier=new DOMParser().parseFromString(api.exportCircuit(),'application/xml');
    const amplifierXml=withAmplifier.createElement('OpAmpReal');
    for(const [name,value]of Object.entries({x:'704 192 832 192',f:'0',slr:'.6',cl:'.0231',mt:'0'}))amplifierXml.setAttribute(name,value);
    withAmplifier.documentElement.appendChild(amplifierXml);
    api.importCircuit(new XMLSerializer().serializeToString(withAmplifier),false);
    const block=api.getElements().find(element=>element.getType()==='CustomCompositeElm')!;
    const amplifier=api.getElements().find(element=>element.getType()==='OpAmpRealElm')!;
    if(!amplifier||amplifier.getPostCount()!==5)throw Error('Native five-terminal amplifier missing');
    if(block.getPostCount()!==2)throw Error('The native block must expose vin and vout');
    const document=new DOMParser().parseFromString(api.exportCircuit(),'application/xml');
    const rail=document.createElement('R'); rail.setAttribute('x',`${block.getPostX(0)} ${block.getPostY(0)} ${block.getPostX(0)-64} ${block.getPostY(0)}`); rail.setAttribute('f','0'); rail.setAttribute('wf','0'); rail.setAttribute('maxv','5'); document.documentElement.appendChild(rail);
    const label=document.createElement('ln'); label.setAttribute('x',`${block.getPostX(1)} ${block.getPostY(1)} ${block.getPostX(1)+64} ${block.getPostY(1)}`); label.setAttribute('f','0'); label.setAttribute('te','vout'); document.documentElement.appendChild(label);
    const add=(tag:string,coordinates:number[],attrs:Record<string,string>={})=>{const node=document.createElement(tag);node.setAttribute('x',coordinates.join(' '));node.setAttribute('f','0');for(const [key,value]of Object.entries(attrs))node.setAttribute(key,value);document.documentElement.appendChild(node);};
    add('R',[amplifier.getPostX(3),amplifier.getPostY(3),amplifier.getPostX(3),amplifier.getPostY(3)-64],{wf:'0',maxv:'15'});
    add('R',[amplifier.getPostX(4),amplifier.getPostY(4),amplifier.getPostX(4),amplifier.getPostY(4)+64],{wf:'0',maxv:'-15'});
    add('w',[amplifier.getPostX(0),amplifier.getPostY(0),amplifier.getPostX(2),amplifier.getPostY(2)]);
    add('w',[block.getPostX(1),block.getPostY(1),amplifier.getPostX(1),amplifier.getPostY(1)]);
    add('ln',[amplifier.getPostX(2),amplifier.getPostY(2),amplifier.getPostX(2)+64,amplifier.getPostY(2)],{te:'buffered'});
    api.importCircuit(new XMLSerializer().serializeToString(document),false); api.setMaxTimeStep(1e-6);
    const stopTime=api.getTime()+1e-4;
    await new Promise<void>((resolve,reject)=>{
      const timeout=setTimeout(()=>reject(Error(api.getStopMessage()??'Block simulation stalled')),5000);
      api.ontimestep=()=>{if(api.getTime()>=stopTime){api.ontimestep=undefined;api.setSimRunning(false);clearTimeout(timeout);resolve();}};
      api.setSimRunning(true);
    });
    const top=api.getElements();
    const serialize=(element:CircuitJsElement)=>({index:top.indexOf(element),type:element.getType(),xml:element.exportElement(),nodes:Array.from({length:element.getPostCount()},(_,index)=>element.getNodeId(index)),label:element.getType()==='LabeledNodeElm'?element.getLabelName():''});
    return {voltage:api.getNodeVoltage('vout'),buffered:api.getNodeVoltage('buffered'),top:top.map(serialize),flattened:api.getAnalysisElements().map(serialize),stop:api.getStopMessage()};
  });
  expect(snapshot.stop).toBeNull(); expect(snapshot.voltage).toBeCloseTo(2.5,2);
  expect(snapshot.buffered).toBeCloseTo(snapshot.voltage,2);
  expect(snapshot.flattened.filter(element=>element.type==='OpAmpRealElm')).toHaveLength(1);
  expect(snapshot.flattened.filter(element=>element.type.includes('TransistorElm'))).toHaveLength(0);
  const element=(value:typeof snapshot.top[number])=>({getType:()=>value.type,exportElement:()=>value.xml,getNodeId:(index:number)=>value.nodes[index],getPostCount:()=>value.nodes.length,getPostX:()=>0,getPostY:()=>0,getLabelName:()=>value.label}) as unknown as CircuitJsElement;
  const top=snapshot.top.map(element);
  const api={getElements:()=>top,getStopMessage:()=>null,getAnalysisElements:()=>snapshot.flattened.map(value=>value.index>=0?top[value.index]:element(value))} as unknown as AdvancedCircuitJsApi;
  const generated=circuitJsAnalysis(api,{type:'operating-point',duration:.01,samples:1000,startHz:10,stopHz:1e5,dcStart:0,dcStop:5,dcStep:.1});
  expect(generated.document.components.filter(component=>component.kind==='resistor')).toHaveLength(2);
  expect(generated.document.components.filter(component=>component.kind==='op-amp-model')).toHaveLength(1);
  expect(generated.probes).toContain('V(vout)'); expect(generated.deck).toContain('1e3');
});

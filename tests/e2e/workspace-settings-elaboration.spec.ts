import { expect,test } from '@playwright/test';
import type {CircuitJsApi} from '../../lib/circuitjs';

test('Settings persist and plotted limits, X zoom and click reset agree',async({page})=>{
  await page.goto('/settings');await page.getByLabel('Fit key',{exact:true}).selectOption('q');await expect(page.getByRole('status')).toContainText('Saved');
  await page.reload();await expect(page.getByLabel('Fit key',{exact:true})).toHaveValue('q');
  await page.goto('/problems/rc-high-pass');
  await expect(page.getByRole('button',{name:'Run AC sweep',exact:true})).toBeEnabled({timeout:45000});
  await page.getByRole('button',{name:'Run AC sweep',exact:true}).click();
  const plot=page.getByRole('region',{name:'Bode magnitude',exact:true});await expect(plot).toBeVisible({timeout:45000});
  await plot.getByRole('textbox',{name:'X start',exact:true}).fill('100');await plot.getByRole('textbox',{name:'X end',exact:true}).fill('10k');
  await plot.getByRole('textbox',{name:'Y start',exact:true}).fill('-40');await plot.getByRole('textbox',{name:'Y end',exact:true}).fill('5');
  await plot.getByRole('button',{name:'Apply limits',exact:true}).click();
  await expect(plot).toHaveAttribute('data-x-min','100');await expect(plot).toHaveAttribute('data-x-max','10000');
  await expect(plot).toHaveAttribute('data-y-min','-40');await expect(plot).toHaveAttribute('data-y-max','5');
  const canvas=plot.locator('canvas');await canvas.click({position:{x:160,y:100}});
  await expect(plot).toHaveAttribute('data-x-min','10');await expect.poll(async()=>Number(await plot.getAttribute('data-x-max'))).toBeCloseTo(100000,5);
  const box=(await canvas.boundingBox())!;await page.mouse.move(box.x+100,box.y+80);await page.mouse.down();await page.mouse.move(box.x+box.width*.7,box.y+210,{steps:8});await page.mouse.up();
  expect(Number(await plot.getAttribute('data-x-max'))).toBeLessThan(100000);await canvas.press('q');await expect.poll(async()=>Number(await plot.getAttribute('data-x-max'))).toBeCloseTo(100000,5);
  await page.screenshot({path:test.info().outputPath('axis-controls.png')});
});

test('HDL generates real elaborated RTL and exposes cells and hierarchy',async({page})=>{
  await page.goto('/hdl/pwm-dac');
  await expect(page.getByRole('button',{name:'Run',exact:true})).toBeEnabled({timeout:45000});
  const editor=page.getByRole('textbox',{name:'Design source',exact:true});
  await editor.fill('module top_module(input [3:0] phase,duty,output pwm); assign pwm = phase < duty; endmodule');
  await page.getByRole('tab',{name:'Schematic',exact:true}).click();
  const schematic=page.getByRole('region',{name:'Elaborated schematic',exact:true});
  await schematic.getByRole('button',{name:'Elaborate design',exact:true}).click();
  await expect(schematic.getByRole('status')).toContainText('Elaborated with Yosys',{timeout:60000});
  await expect(schematic.locator('.react-flow__node')).toHaveCount(4);await expect(schematic.locator('.react-flow__edge')).toHaveCount(3);
  await expect(schematic).toContainText('$lt');await expect(schematic.getByLabel('Schematic hierarchy')).toHaveValue('top_module');
  await page.screenshot({path:test.info().outputPath('elaborated-pwm.png')});
});

test('every high-pass output wire resolves to the same canonical SPICE net',async({page})=>{
  await page.goto('/problems/rc-high-pass');await expect(page.getByRole('button',{name:'Run AC sweep',exact:true})).toBeEnabled({timeout:45000});
  const frame=page.frameLocator('iframe[title="CircuitJS schematic editor"]');
  const result=await frame.locator('canvas').first().evaluate(async()=>{
    const api=(window as unknown as {CircuitJS1:CircuitJsApi}).CircuitJS1;api.ensureAnalyzed?.();
    const modulePath='/lib/circuitjs-analysis.ts';const {circuitJsAnalysis}=await import(modulePath);
    const compiled=circuitJsAnalysis(api,{type:'ac-sweep',startHz:10,stopHz:100000});
    const out=api.getElements().find(e=>e.getType()==='LabeledNodeElm'&&e.getLabelName()==='out')!.getNodeId(0);
    return compiled.voltageBindings.filter((b:{element:ReturnType<CircuitJsApi['getElements']>[number];post:number})=>b.element.getNodeId(b.post)===out).map((b:{expression:string})=>b.expression);
  });
  expect(result.length).toBeGreaterThan(2);expect(new Set(result)).toEqual(new Set(['V(out)']));
});


test('HDL defaults to area zoom, a plain click fits and the top ruler moves the cursor',async({page})=>{
  await page.goto('/hdl/viewer/index.html');
  await page.evaluate(()=>window.postMessage({type:'anacode-vcd',vcd:'$timescale 1 ns $end\n$scope module tb $end\n$var wire 1 ! a $end\n$upscope $end\n$enddefinitions $end\n#0\n0!\n#50\n1!\n#100\n'},location.origin));
  const timeline=page.getByLabel('Digital waveform timeline'); await expect(timeline).toHaveAttribute('data-viewer-ready','true');
  const box=(await timeline.boundingBox())!,side=await timeline.evaluate(node=>parseFloat(getComputedStyle(node).getPropertyValue('--signal-width'))),width=box.width-side;
  const span=async()=>Number(await timeline.getAttribute('data-view-end-seconds'))-Number(await timeline.getAttribute('data-view-start-seconds'));
  await page.mouse.move(box.x+side+width*.2,box.y+55);await page.mouse.down();await page.mouse.move(box.x+side+width*.6,box.y+55,{steps:8});await page.mouse.up();
  expect(await span()).toBeLessThan(60e-9);
  await timeline.click({position:{x:side+width*.8,y:55}});await expect.poll(span).toBeCloseTo(100e-9,14);
  await page.mouse.move(box.x+side+width*.7,box.y+12);
  await expect.poll(async()=>Number(await page.getByLabel('Waveform cursor time',{exact:true}).getAttribute('data-time-seconds'))).toBeCloseTo(70e-9,9);
});

import { expect, test } from '@playwright/test';
import type { CircuitJsApi } from '../../lib/circuitjs';

test('Lab fills the viewport and places a real current probe on a wire with one click', async ({ page }) => {
  await page.goto('/lab');
  const work = page.getByRole('region', { name: 'CircuitJS schematic and simulation workspace', exact: true });
  await expect(work.getByRole('button', {name:'Capture all probes',exact:true})).toBeEnabled({timeout:45000});
  const bounds = await work.boundingBox();
  expect(bounds!.x).toBeLessThan(2);
  expect(bounds!.width).toBeGreaterThan(page.viewportSize()!.width-20);
  expect(bounds!.y+bounds!.height).toBeLessThanOrEqual(page.viewportSize()!.height+1);
  await expect(page.locator('footer')).toHaveCount(0);
  const native = page.frameLocator('iframe[title="CircuitJS schematic editor"]');
  const canvas = native.locator('canvas').first();
  const branch = await native.locator('body').evaluate(() => {
    const api=(window as unknown as {CircuitJS1:CircuitJsApi}).CircuitJS1;
    const resistor=api.getElements().find(el=>el.getType()==='ResistorElm')!;
    const wire=api.getElements().find(el=>el.getType()==='WireElm' && [0,1].some(i=>el.getPostX(i)===resistor.getPostX(0) && el.getPostY(i)===resistor.getPostY(0)))!;
    return {x:api.screenX((wire.getPostX(0)+wire.getPostX(1))/2),y:api.screenY((wire.getPostY(0)+wire.getPostY(1))/2),index:api.getElements().indexOf(wire),circuit:api.exportCircuit()};
  });
  await work.getByRole('button',{name:'Current probe',exact:true}).click();
  await canvas.hover({position:branch});
  await expect(canvas).toHaveCSS('cursor',/data:image\/svg\+xml/);
  await canvas.click({position:branch});
  const grip=work.getByRole('button',{name:/Move probe 3 I\(Wire/});
  await expect(grip).toBeVisible();
  await work.getByRole('button',{name:'Edit',exact:true}).click();
  await grip.press('r');
  await work.getByRole('button',{name:'Capture all probes',exact:true}).click();
  await expect(work.locator('p[role="status"]')).toContainText('across 3 probes',{timeout:45000});
  await expect(work.getByRole('button',{name:/Select I\(Wire/})).toBeVisible();
  await work.getByRole('button',{name:'Save',exact:true}).click();
  const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('anacode:circuitjs:lab')!));
  expect(saved.probes[2].elementIndex).toBe(branch.index);
  expect(saved.probes[2].anchorFraction).toBeCloseTo(.5,1);
  expect(saved.probes[2].markerOffset).toBeDefined();
  const actual=await native.locator('body').evaluate((_body,{index})=>{
    const api=(window as unknown as {CircuitJS1:CircuitJsApi}).CircuitJS1;
    return {wire:api.getElements()[index].getCurrent(),resistor:api.getElements().find(el=>el.getType()==='ResistorElm')!.getCurrent(),circuit:api.exportCircuit()};
  },branch);
  expect(Math.abs(actual.wire)).toBeCloseTo(Math.abs(actual.resistor),8);
  expect(actual.circuit).toBe(branch.circuit);
  const labelPoint=await native.locator('body').evaluate(()=>new Promise<{x:number;y:number}>((resolve,reject)=>{
    const api=(window as unknown as {CircuitJS1:CircuitJsApi}).CircuitJS1;
    const label=api.getElements().find(el=>el.getType()==='LabeledNodeElm')!;
    // Pick the caption where the native collision-aware renderer actually drew it.
    const canvas=document.querySelector('canvas')!,ctx=canvas.getContext('2d')!,original=ctx.fillText;
    const timer=setTimeout(()=>{ctx.fillText=original;reject(new Error('Net label was not rendered'));},5000);
    ctx.fillText=function(text,x,y,maxWidth){
      if(text===label.getLabelName()){
        const metrics=ctx.measureText(text),point=new DOMPoint(x+(metrics.actualBoundingBoxRight-metrics.actualBoundingBoxLeft)/2,y+(metrics.actualBoundingBoxDescent-metrics.actualBoundingBoxAscent)/2).matrixTransform(ctx.getTransform());
        const ratio=canvas.width/canvas.getBoundingClientRect().width;
        clearTimeout(timer);ctx.fillText=original;resolve({x:point.x/ratio,y:point.y/ratio});
      }
      if(maxWidth===undefined)original.call(ctx,text,x,y);else original.call(ctx,text,x,y,maxWidth);
    };
    api.setTheme(api.getTheme()); // Request a redraw even when capture paused the solver.
  }));
  await canvas.hover({position:labelPoint});
  await expect.poll(()=>native.locator('body').evaluate(()=>(window as unknown as {CircuitJS1:CircuitJsApi}).CircuitJS1.getHoveredElement()?.getType())).toBe('LabeledNodeElm');
  await canvas.press('r');
  await expect(work.locator('p[role="status"]')).toContainText('Net label rotated');
  await expect.poll(()=>native.locator('body').evaluate(()=>(window as unknown as {CircuitJS1:CircuitJsApi}).CircuitJS1.getElements().find(el=>el.getType()==='LabeledNodeElm')!.getLabelAngle!())).toBe(90);
  await work.getByLabel('Workspace layout',{exact:true}).selectOption('tabs');
  await work.getByRole('button',{name:'Schematic',exact:true}).click();
  await expect(canvas).toBeVisible();
  await work.getByLabel('Workspace layout',{exact:true}).selectOption('stacked');
  await expect(work.getByRole('button',{name:'Capture all probes',exact:true})).toBeEnabled();
});

test('one-click probes and independent grips preserve the native circuit', async ({ page }) => {
  await page.goto('/lab');
  const work = page.getByRole('region', { name: 'CircuitJS schematic and simulation workspace', exact: true });
  await expect(work.getByRole('button', {name:'Capture all probes',exact:true})).toBeEnabled({timeout:45000});
  const native = page.frameLocator('iframe[title="CircuitJS schematic editor"]');
  const canvas = native.locator('canvas').first();
  const ground = await native.locator('body').evaluate(() => {
    const api = (window as unknown as {CircuitJS1:CircuitJsApi}).CircuitJS1;
    const element = api.getElements().find(el => el.getType() === 'GroundElm')!;
    return {x:api.screenX(element.getPostX(0)),y:api.screenY(element.getPostY(0))};
  });
  await work.getByRole('button',{name:'Voltage probe',exact:true}).click();
  await canvas.click({position:ground});
  await expect(work.getByRole('button',{name:'Move probe 3 V(0)',exact:true})).toBeVisible();
  await work.getByRole('button',{name:'Edit',exact:true}).click();
  const before = await native.locator('body').evaluate(() => (window as unknown as {CircuitJS1:CircuitJsApi}).CircuitJS1.exportCircuit());
  const grip = work.getByRole('button',{name:'Move probe 3 V(0)',exact:true});
  const box = await grip.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.move(box!.x + box!.width/2,box!.y + box!.height/2);
  await page.mouse.down();
  await page.mouse.move(box!.x + box!.width/2 + 70,box!.y + box!.height/2 - 45,{steps:8});
  await page.mouse.up();
  await expect(work.locator('p[role="status"]')).toContainText('Probe moved');
  await grip.press('ArrowRight');
  const after = await native.locator('body').evaluate(() => (window as unknown as {CircuitJS1:CircuitJsApi}).CircuitJS1.exportCircuit());
  expect(after).toBe(before);
  await work.getByRole('button',{name:'Save',exact:true}).click();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('anacode:circuitjs:lab')!));
  expect(saved.probes[2].markerOffset).toBeDefined();
  await page.reload();
  await expect(work.getByRole('button',{name:'Move probe 3 V(0)',exact:true})).toBeVisible({timeout:45000});
  // A save from a previous release is preserved until the learner accepts the updated starter.
  await page.evaluate(() => {
    const saved = JSON.parse(localStorage.getItem('anacode:circuitjs:lab')!);
    delete saved.starterRevision; saved.duration = .004; saved.samples = 128;
    localStorage.setItem('anacode:circuitjs:lab', JSON.stringify(saved));
  });
  await page.reload();
  await expect(work.getByRole('button',{name:'Move probe 3 V(0)',exact:true})).toBeVisible({timeout:45000});
  await work.getByRole('button',{name:'Load updated starter',exact:true}).click();
  await expect(work.getByLabel('Capture duration in seconds',{exact:true})).toHaveValue('0.01');
  await expect(work.getByLabel('Capture target samples',{exact:true})).toHaveValue('65536');
  await expect(work.getByRole('button',{name:'Load updated starter',exact:true})).toHaveCount(0);
});

test('finite live records start at zero and hold the entire ADC test vector', async ({ page }) => {
  await page.goto('/problems/flash-adc-threshold-calibration');
  const work=page.getByRole('region',{name:'CircuitJS schematic and simulation workspace',exact:true});
  await expect(work.getByRole('button',{name:'Start live measurements',exact:true})).toBeEnabled({timeout:45000});
  await expect(work.getByLabel('Capture start',{exact:true})).toHaveValue('restart');
  await expect(work.getByLabel('Live acquisition mode',{exact:true})).toHaveValue('record');
  await work.getByRole('button',{name:'Start live measurements',exact:true}).click();
  await expect(work.locator('p[role="status"]')).toContainText('Record complete',{timeout:45000});
  const scope=work.getByRole('region',{name:'Oscilloscope',exact:true});
  await expect(scope).toBeVisible();
  const requested = Number(await work.getByLabel('Capture duration in seconds', {exact:true}).inputValue());
  expect(Number(await scope.getAttribute('data-x-max'))).toBeGreaterThan(requested * .995);
  expect(Number(await scope.getAttribute('data-x-min'))).toBeLessThan(.00001);
  await expect(work.getByLabel('Schematic analysis type',{exact:true})).toBeVisible();
  await work.getByLabel('Schematic analysis type',{exact:true}).selectOption('ac-sweep');
  await expect(work.getByLabel('AC start frequency',{exact:true})).toBeVisible();
});

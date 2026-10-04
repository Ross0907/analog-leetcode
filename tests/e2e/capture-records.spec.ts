import { expect, test } from '@playwright/test';
import type { CircuitJsApi } from '../../lib/circuitjs';

test('paused edits analyze fresh nodes and run SPICE without cancelling the prepared result', async ({page}) => {
  await page.goto('/problems/precision-voltage-divider');
  const workspace=page.getByRole('region',{name:'CircuitJS schematic and simulation workspace',exact:true});
  await expect(workspace.getByRole('button',{name:'Capture all probes',exact:true})).toBeEnabled({timeout:45000});
  const native=page.frameLocator('iframe[title="CircuitJS schematic editor"]');
  const paused=await native.locator('body').evaluate(()=>{
    const api=(window as unknown as {CircuitJS1:CircuitJsApi}).CircuitJS1;
    api.setSimRunning(false);
    const resistors=api.getElements().filter(element=>element.getType()==='ResistorElm');
    const error=resistors[0].setEditableValue('20k');
    if(error) throw Error(error);
    return api.getTime();
  });
  await workspace.getByRole('button',{name:'Run simulation',exact:true}).click();
  await expect(workspace.locator('.result-footer')).toBeVisible({timeout:45000});
  await expect(workspace.getByText('Simulation stopped',{exact:true})).toHaveCount(0);
  expect(await native.locator('body').evaluate(()=>(window as unknown as {CircuitJS1:CircuitJsApi}).CircuitJS1.getTime())).toBe(paused);
  const advanced=workspace.locator('.advanced-netlist > summary');
  if(await advanced.locator('..').getAttribute('open')===null) await advanced.click();
  expect(await workspace.getByLabel('Advanced SPICE source editor').inputValue()).toMatch(/R1 vin vout 2e4/);
  const dc=workspace.getByRole('region',{name:'DC readings',exact:true});
  await expect(dc).toContainText('1.667 V');
  await dc.getByRole('button',{name:'Select V(vout)',exact:true}).click();
  await expect(workspace.getByRole('button',{name:/^Move probe \d+ V\(vout\)$/})).toHaveAttribute('aria-pressed','true');
});

test('flash ADC captures four real stimulus cycles and longer acquisition keeps eight',async({page})=>{
  test.setTimeout(120000);
  // Keep the whole workspace in the viewport: locator screenshots temporarily
  // resize shorter pages, which clears an iframe canvas for one paint frame.
  await page.setViewportSize({width:1440,height:1800});
  await page.goto('/problems/flash-adc-threshold-calibration');
  const workspace=page.getByRole('region',{name:'CircuitJS schematic and simulation workspace',exact:true});
  await expect(workspace.getByRole('button',{name:'Capture all probes',exact:true})).toBeEnabled({timeout:45000});
  await expect(workspace.getByLabel('Capture duration in seconds',{exact:true})).toHaveValue('0.008');
  await workspace.getByRole('button',{name:'Capture all probes',exact:true}).click();
  await expect(workspace.locator('p[role="status"]')).toContainText('Captured',{timeout:45000});
  await workspace.getByRole('button',{name:'Logic analyzer',exact:true}).click();
  const logic=workspace.getByRole('region',{name:'Logic analyzer',exact:true});
  await logic.getByLabel('Low ≤ V',{exact:true}).fill('1.995');
  await logic.getByLabel('High ≥ V',{exact:true}).fill('2.005');
  const path=logic.getByRole('img',{name:'V(vin) digital waveform',exact:true}).locator('path');
  await expect.poll(async()=>((await path.getAttribute('d'))?.match(/V9(?:\D|$)/g)??[]).length).toBeGreaterThanOrEqual(4);
  expect(Number(await logic.getAttribute('data-x-max'))).toBeCloseTo(.008,5);
  await workspace.getByRole('button',{name:'2× longer',exact:true}).click();
  await expect(workspace.getByLabel('Capture duration in seconds',{exact:true})).toHaveValue('0.016');
  await expect(workspace.locator('p[role="status"]')).toContainText('Captured',{timeout:45000});
  // Acquisition replaces the record; the logic view stays selected and its
  // thresholds describe the input's actual 1.99 V / 2.01 V test levels.
  await logic.getByLabel('Low ≤ V',{exact:true}).fill('1.995');
  await logic.getByLabel('High ≥ V',{exact:true}).fill('2.005');
  await expect.poll(async()=>((await path.getAttribute('d'))?.match(/V9(?:\D|$)/g)??[]).length).toBeGreaterThanOrEqual(8);
  expect(Number(await logic.getAttribute('data-x-max'))).toBeCloseTo(.016,5);
  await workspace.screenshot({path:'artifacts/qa/flash-adc-repeat-capture.png'});
});

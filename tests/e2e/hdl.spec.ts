import { test, expect } from '@playwright/test';
import { HDL_CHALLENGES } from '../../lib/hdl-challenges';

test('HDL playground executes Icarus and renders actual VCD in the embedded viewer',async({page})=>{
  test.setTimeout(90_000);
  await page.goto('/hdl/playground');
  await expect(page.getByRole('textbox',{name:'Design source'})).toContainText('posedge clk');
  await page.getByRole('button',{name:'Run',exact:true}).click();
  await expect(page.getByRole('status')).toContainText('Finished',{timeout:30_000});
  const viewer=page.frameLocator('iframe[title="VCDrom logic waveform viewer"]');
  await expect(viewer.locator('canvas').first()).toBeVisible({timeout:25_000});
  await page.screenshot({path:'artifacts/qa/hdl-workspace.png',fullPage:true});
  await expect(viewer.getByRole('alert')).toBeHidden();
  await page.getByRole('combobox',{name:'Output layout'}).selectOption('split');
  await expect(page.getByLabel('Simulator console')).toContainText('ANACODE_RESULT checks=64 failures=0');
  await expect(page.locator('iframe[title="VCDrom logic waveform viewer"]')).toBeVisible();
  await page.getByRole('combobox',{name:'Output layout'}).selectOption('stacked');
  await expect(page.getByLabel('Simulator console')).toBeVisible();
  await page.getByRole('button',{name:'Run',exact:true}).click();
  await expect(page.getByRole('status')).toContainText('Finished',{timeout:30_000});
  await expect(viewer.locator('canvas').first()).toBeVisible({timeout:25_000});
});

test('HDL checks distinguish wrong logic, fixed logic, syntax errors, and persist a draft',async({page})=>{
  test.setTimeout(90_000);
  const challenge=HDL_CHALLENGES[0];
  await page.goto(`/hdl/${challenge.slug}`);
  const editor=page.getByRole('textbox',{name:'Design source'});
  await editor.fill(challenge.solution.replace('sel==0 ? a : sel==1 ? b : sel==2 ? c : d','a'));
  await page.getByRole('button',{name:'Check solution'}).click();
  await expect(page.getByRole('status')).toContainText('Some practice checks failed',{timeout:30_000});
  await expect(page.getByLabel('Simulator console')).toContainText('FAIL: Selected word');
  await editor.fill(challenge.solution);
  await page.getByRole('button',{name:'Check solution'}).click();
  await expect(page.getByRole('status')).toContainText('All 64 practice checks passed',{timeout:30_000});
  await editor.fill(`${challenge.solution}\n// revision`);
  await expect(page.getByRole('status')).toContainText('Draft changed');
  await expect(page.getByRole('button',{name:'VCD',exact:true})).toBeDisabled();
  await page.reload();
  await expect(editor).toContainText('sel==0 ? a');
  await editor.fill('module top_module(input a output y); endmodule');
  await page.getByRole('button',{name:'Run',exact:true}).click();
  await expect(page.getByRole('status')).toContainText('Compile or simulation error',{timeout:30_000});
  await expect(page.getByLabel('Simulator console')).toContainText('design.v');
});

test('HDL runaway execution can be stopped without freezing the editor',async({page})=>{
  await page.goto('/hdl/playground');
  await expect(page.getByRole('textbox',{name:'Design source'})).toBeVisible();
  await page.getByRole('tab',{name:'tb.sv'}).click();
  await page.getByRole('textbox',{name:'Testbench source'}).fill('module tb; integer i=0; initial forever i=i+1; endmodule');
  await page.getByRole('button',{name:'Run',exact:true}).click();
  await expect(page.getByRole('status')).toContainText('Simulating',{timeout:20_000});
  await page.getByRole('button',{name:'Stop',exact:true}).click();
  await expect(page.getByLabel('Simulator console')).toContainText('Simulation stopped');
  await expect(page.getByRole('button',{name:'Run',exact:true})).toBeEnabled();
});

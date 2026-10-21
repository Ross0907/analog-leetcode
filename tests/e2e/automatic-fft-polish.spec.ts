import { test,expect } from '@playwright/test';
import type {CircuitJsApi} from '../../lib/circuitjs';

for (const engine of ['native', 'ngspice']) test(`${engine} FFT automatically captures maximum depth once, labels peaks and supports a short preview`,async({page})=>{
 test.setTimeout(150000);const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
 await page.goto('/problems/rc-high-pass');const work=page.getByRole('region',{name:'CircuitJS schematic and simulation workspace',exact:true});
 await expect(work.getByRole('button',{name:'Capture all probes',exact:true})).toBeEnabled({timeout:60000});
 await work.getByRole('button',{name:'Circuit probes',exact:true}).click();await work.getByRole('button',{name:'Capture all probes',exact:true}).click();
 await expect(work.getByRole('region',{name:'Oscilloscope',exact:true})).toBeVisible({timeout:60000});
 if(engine==='ngspice'){await work.getByLabel('Schematic analysis type',{exact:true}).selectOption('transient');await work.getByRole('button',{name:'Run transient analysis',exact:true}).click();await expect(work.getByRole('button',{name:'SPICE response',exact:true})).toHaveAttribute('aria-pressed','true',{timeout:60000});}
 await work.getByRole('button',{name:'Spectrum',exact:true}).click();const fft=work.getByRole('region',{name:'Spectrum analyzer',exact:true});
 await expect(fft).toHaveAttribute('data-fft-used','131072',{timeout:60000});await expect(fft.getByLabel('FFT capture quality')).toBeEnabled({timeout:60000});
 expect(Number(await fft.getAttribute('data-bin-width'))).toBeLessThan(2);
 await fft.getByRole('combobox',{name:'Channel',exact:true}).selectOption({label:'V(out)'});
 await expect(fft.getByLabel('Detected FFT peaks')).toContainText('1 kHz');
 await fft.getByLabel('Detected FFT peaks').getByRole('button').first().click();
 const amplitude=Number((await fft.getByText(/^Marker:/).innerText()).match(/([-\d.]+) dB/)?.[1]);
 expect(Math.abs(amplitude-(-5.485))).toBeLessThan(.02);
 const plot=fft.getByRole('region',{name:'FFT spectrum',exact:true});
 await plot.getByRole('button',{name:'Maximize instrument',exact:true}).click();
 await plot.screenshot({path:test.info().outputPath('fft-automatic.png')});
 await plot.getByRole('button',{name:'Restore instrument',exact:true}).click();
 const end=await fft.getAttribute('data-record-end');await work.getByRole('button',{name:'Oscilloscope',exact:true}).click();await work.getByRole('button',{name:'Spectrum',exact:true}).click();
 await expect(fft).toHaveAttribute('data-record-end',end!);await expect(work.getByRole('button',{name:'Capture all probes',exact:true})).toBeEnabled();
 await fft.getByLabel('Detect and label peaks').uncheck();await expect(fft.getByLabel('Detected FFT peaks')).toHaveCount(0);await fft.getByLabel('Detect and label peaks').check();
 await fft.getByLabel('FFT capture quality').selectOption('short');await expect(fft).toHaveAttribute('data-fft-used','8192',{timeout:60000});await expect(fft.getByLabel('FFT capture quality')).toBeEnabled({timeout:60000});expect(Number(await fft.getAttribute('data-bin-width'))).toBeGreaterThan(190);
 await expect(fft.getByLabel('FFT capture quality')).toHaveValue('short');await fft.screenshot({path:test.info().outputPath('fft-short.png')});expect(errors).toEqual([]);
});

test('Ctrl-click selects multiple probes and Escape cancels probes and native placement',async({page})=>{
 await page.goto('/lab');const work=page.getByRole('region',{name:'CircuitJS schematic and simulation workspace',exact:true});
 await expect(work.getByRole('button',{name:'Capture all probes',exact:true})).toBeEnabled({timeout:60000});
 const grips=work.getByRole('button',{name:/^Move probe/});await expect(grips).toHaveCount(2);
 await grips.nth(0).click();await grips.nth(1).click({modifiers:['Control']});await expect(grips.nth(0)).toHaveAttribute('aria-pressed','true');await expect(grips.nth(1)).toHaveAttribute('aria-pressed','true');
 await grips.nth(0).click({modifiers:['Control']});await expect(grips.nth(0)).toHaveAttribute('aria-pressed','false');await expect(grips.nth(1)).toHaveAttribute('aria-pressed','true');
 await page.keyboard.press('Escape');await expect(grips.nth(1)).toHaveAttribute('aria-pressed','false');
 await work.getByRole('button',{name:'Voltage probe',exact:true}).click();await page.keyboard.press('Escape');await expect(work.getByRole('button',{name:'Edit',exact:true})).toHaveAttribute('aria-pressed','true');
 const frame=page.frameLocator('iframe[title="CircuitJS schematic editor"]'),canvas=frame.locator('canvas').first();
 const count=await canvas.evaluate(()=>{const api=(window as unknown as {CircuitJS1:CircuitJsApi}).CircuitJS1;api.addElement('ResistorElm');return api.getElements().length;});
 await canvas.focus();await canvas.press('Escape');await canvas.click({position:{x:60,y:60}});expect(await canvas.evaluate(()=>(window as unknown as {CircuitJS1:CircuitJsApi}).CircuitJS1.getElements().length)).toBe(count);
 await work.screenshot({path:test.info().outputPath('schematic-polish.png')});
});

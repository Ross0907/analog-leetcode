import {test,expect} from '@playwright/test';

test('HDL columns resize independently, persist, and lock protects the timeline',async({page})=>{
  await page.goto('/hdl/viewer/index.html');
  const vcd='$timescale 1 ns $end\n$scope module tb $end\n$var wire 8 ! count $end\n$upscope $end\n$enddefinitions $end\n#0\nb00000000 !\n#10\nb00000101 !\n#20\nb00000010 !\n#30\n';
  const load=async()=>{await page.evaluate(vcd=>window.postMessage({type:'anacode-vcd',vcd},location.origin),vcd);await expect(page.getByLabel('Digital waveform timeline')).toHaveAttribute('data-viewer-ready','true');};
  await load();
  const timeline=page.getByLabel('Digital waveform timeline'),pane=page.getByRole('separator',{name:'Resize signal table',exact:true}),columns=page.getByRole('separator',{name:'Resize signal and value columns',exact:true});
  const initial=Number(await pane.getAttribute('aria-valuenow'));
  const bounds=(await pane.boundingBox())!;await page.mouse.move(bounds.x+bounds.width/2,bounds.y+50);await page.mouse.down();await page.mouse.move(bounds.x+123,bounds.y+50,{steps:8});await page.mouse.up();
  await expect.poll(async()=>Number(await pane.getAttribute('aria-valuenow'))).toBeGreaterThan(initial+110);
  const resized=Number(await pane.getAttribute('aria-valuenow')),nameWidth=Number(await columns.getAttribute('aria-valuenow'));
  await columns.focus();await columns.press('Shift+ArrowRight');await expect.poll(async()=>Number(await columns.getAttribute('aria-valuenow'))).toBe(nameWidth+40);
  await expect(pane).toHaveAttribute('aria-valuenow',String(resized));
  await page.getByRole('button',{name:'Signal options: tb.count'}).click({button:'right'});await page.getByRole('menuitemradio',{name:'Unsigned decimal',exact:true}).click();
  await expect(page.getByLabel('Value of tb.count',{exact:true})).toHaveText('0');
  await expect(page.locator('.wd-values title').first()).toHaveText('0');
  const input=page.getByRole('textbox',{name:'Waveform cursor position'});await input.fill('12 ns');await input.press('Enter');await expect(page.getByLabel('Value of tb.count',{exact:true})).toHaveText('5');
  expect(await page.locator('.wd-values title').allTextContents()).toContain('5');
  const lock=page.getByRole('button',{name:'Lock waveform view'});await lock.click();await expect(lock).toHaveAttribute('aria-pressed','true');await expect(input).toBeDisabled();
  const cursorBefore=await page.getByLabel('Waveform cursor time',{exact:true}).getAttribute('data-time-seconds'),gridBefore=await page.locator('.wd-grid').innerHTML();
  await timeline.click({position:{x:resized+100,y:55}});await timeline.press('Alt+ArrowRight');await timeline.press('Alt+.');await timeline.hover({position:{x:resized+100,y:55}});await page.keyboard.down('Control');await page.mouse.wheel(0,-120);await page.keyboard.up('Control');
  await expect(page.getByLabel('Waveform cursor time',{exact:true})).toHaveAttribute('data-time-seconds',cursorBefore!);expect(await page.locator('.wd-grid').innerHTML()).toBe(gridBefore);
  await columns.focus();await columns.press('ArrowLeft');await expect.poll(async()=>Number(await columns.getAttribute('aria-valuenow'))).toBe(nameWidth+30);
  await lock.click();await expect(input).toBeEnabled();await timeline.click({position:{x:resized+100,y:55}});await expect(page.getByLabel('Waveform cursor time',{exact:true})).not.toHaveAttribute('data-time-seconds',cursorBefore!);
  await page.reload();await load();await expect(pane).toHaveAttribute('aria-valuenow',String(resized));
  await page.setViewportSize({width:390,height:844});await expect.poll(async()=>Number(await pane.getAttribute('aria-valuenow'))).toBeLessThan(220);
  expect(await timeline.evaluate(node=>{const side=node.querySelector('.signal-pane')!.getBoundingClientRect(),cursor=node.querySelector<HTMLElement>('.time-cursor')!;return cursor.hidden||cursor.getBoundingClientRect().left>=side.right;})).toBeTruthy();
});

test('HDL waveform values use the real cursor sample with radix, analog, themes and fixed columns',async({page})=>{
  test.setTimeout(90_000);
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto('/hdl/playground');
  await page.getByRole('textbox',{name:'Design source'}).fill('module top_module(input [7:0] d, output [7:0] q); assign q=d; endmodule');
  await page.getByRole('tab',{name:'tb.sv',exact:true}).click();
  await page.getByRole('textbox',{name:'Testbench source',exact:true}).fill('`timescale 1ns/1ps\nmodule tb; reg [7:0] d=0; wire [7:0] q; top_module dut(d,q); initial begin $dumpfile("dump.vcd"); $dumpvars(0,tb); #10 d=128; #10 d=255; #10 d=65; #10 d=8\'b10xz0110; #10 $finish; end endmodule');
  await page.getByRole('button',{name:'Run',exact:true}).click();
  await expect(page.getByRole('status')).toContainText('Finished',{timeout:30_000});
  await page.getByRole('combobox',{name:'Workspace layout'}).selectOption('tabs');
  const viewer=page.frameLocator('iframe[title="VCDrom logic waveform viewer"]');
  const timeline=viewer.getByLabel('Digital waveform timeline'),value=viewer.getByLabel('Value of tb.q',{exact:true});
  await expect(timeline).toHaveAttribute('data-viewer-ready','true',{timeout:25_000});
  await expect(value).toHaveText('00');
  const cursorInput=viewer.getByRole('textbox',{name:'Waveform cursor position',exact:true});
  await cursorInput.fill('12.3456789 ns');await cursorInput.press('Enter');
  await expect(value).toHaveText('80');
  expect(Number(await viewer.getByLabel('Waveform cursor time',{exact:true}).getAttribute('data-time-seconds'))).toBeCloseTo(12.3456789e-9,16);
  expect(await timeline.evaluate(node=>node.querySelector('.time-cursor')!.getBoundingClientRect().left>=node.querySelector('.signal-pane')!.getBoundingClientRect().right)).toBeTruthy();
  await cursorInput.fill('51ns');await cursorInput.press('Enter');await expect(cursorInput).toHaveAttribute('aria-invalid','true');
  await expect(value).toHaveText('80');await cursorInput.press('Escape');await expect(cursorInput).toHaveValue('12.3456789 ns');
  const moveCursor=async(fraction:number)=>{
    const geometry=await timeline.evaluate(node=>({width:node.clientWidth,side:parseFloat(getComputedStyle(node).getPropertyValue('--signal-width'))}));
    await timeline.click({position:{x:geometry.side+(geometry.width-geometry.side)*fraction,y:65}});
  };
  await moveCursor(11/50);await expect(value).toHaveText('80');
  const signal=viewer.getByRole('button',{name:'Signal options: tb.q',exact:true});
  for(const [label,expected]of [['Binary','10000000'],['Octal','200'],['Unsigned decimal','128'],['Signed decimal','-128'],['ASCII','"\\x80"'],['Hexadecimal','80']]){
    await signal.click({button:'right'});await viewer.getByRole('menuitemradio',{name:label,exact:true}).click();await expect(value).toHaveText(expected);
  }
  await moveCursor(31/50);await signal.click({button:'right'});await viewer.getByRole('menuitemradio',{name:'ASCII',exact:true}).click();await expect(value).toHaveText('"A"');
  await moveCursor(41/50);await signal.click({button:'right'});await viewer.getByRole('menuitemradio',{name:'Binary',exact:true}).click();await expect(value).toHaveText('10xz0110');
  await signal.click({button:'right'});await viewer.getByRole('menuitemradio',{name:'Analog · unsigned',exact:true}).click();
  const analog=viewer.locator('path.analog-trace[data-signal="tb.q"]');await expect(analog).toBeVisible();
  expect(await analog.getAttribute('d')).not.toMatch(/NaN|Infinity/);
  await expect(analog.locator('title')).toContainText('range 0 to 255');
  // Native WebGL still renders digital signals next to the analog presentation.
  await expect(viewer.locator('.wd-view canvas')).toBeVisible();
  expect(await timeline.evaluate(node=>{
    const side=node.querySelector('.signal-pane')!.getBoundingClientRect(),right=node.getBoundingClientRect().right;
    return [...node.querySelectorAll('text.wd-grid-time')].every(label=>{const box=label.getBoundingClientRect();return box.left>=side.right&&box.right<=right;});
  })).toBeTruthy();
  await page.screenshot({path:'artifacts/qa/hdl-viewer-light.png'});
  await page.getByRole('button',{name:'Switch to dark mode'}).click();
  await expect(viewer.locator('html')).toHaveAttribute('data-theme','dark');
  await page.screenshot({path:'artifacts/qa/hdl-viewer-dark.png'});
  await signal.focus();await signal.press('Shift+F10');
  await expect(viewer.getByRole('menu')).toBeVisible();
  await viewer.getByRole('menu').press('End');await expect(viewer.getByRole('menuitemradio',{name:'Analog · signed',exact:true})).toBeFocused();
  await page.screenshot({path:'artifacts/qa/hdl-viewer-radix-menu.png'});
  await viewer.getByRole('menu').press('Escape');
  const before=await value.innerText();await signal.click();await viewer.getByRole('menu').press('Escape');
  await expect(value).toHaveText(before);
  await timeline.focus();for(let i=0;i<8;i++)await timeline.press('Alt+,');
  expect(await timeline.evaluate(node=>{
    const side=node.querySelector('.signal-pane')!.getBoundingClientRect(),cursor=node.querySelector<HTMLElement>('.time-cursor')!;
    return cursor.hidden||cursor.getBoundingClientRect().left>=side.right;
  })).toBeTruthy();
  await expect(viewer.getByLabel('Waveform cursor time')).not.toContainText('-');
  expect(await viewer.locator('.wd-view').evaluate(node=>getComputedStyle(node).clipPath)).toContain('inset');
  await page.setViewportSize({width:390,height:844});
  expect(await timeline.evaluate(node=>{const side=node.querySelector('.signal-pane')!.getBoundingClientRect();return side.width<node.clientWidth*.6;})).toBeTruthy();
  await page.screenshot({path:'artifacts/qa/hdl-viewer-mobile.png'});
  await signal.click();
  expect(await viewer.getByRole('menu').evaluate(node=>{const box=node.getBoundingClientRect();return box.left>=0&&box.top>=0&&box.right<=innerWidth&&box.bottom<=innerHeight;})).toBeTruthy();
  await page.screenshot({path:'artifacts/qa/hdl-viewer-mobile-menu.png'});
  expect(errors).toEqual([]);
});

test('HDL viewer handles zero-time values and scrolls signal rows without moving their header',async({page})=>{
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto('/hdl/viewer/index.html');
  const constant='$timescale 1 ns $end\n$scope module tb $end\n$var wire 1 ! flag $end\n$var wire 1 " floating $end\n$upscope $end\n$enddefinitions $end\n#0\n1!\nz"\n';
  await page.evaluate(vcd=>window.postMessage({type:'anacode-vcd',vcd},location.origin),constant);
  await expect(page.getByLabel('Digital waveform timeline')).toHaveAttribute('data-viewer-ready','true',{timeout:25_000});
  await expect(page.getByLabel('Value of tb.flag',{exact:true})).toHaveText('1');await expect(page.getByLabel('Value of tb.floating',{exact:true})).toHaveText('z');
  await expect(page.getByLabel('Waveform cursor time')).toHaveText('Cursor 0 ns');
  await expect(page.getByRole('alert')).toBeHidden();
  const many='$timescale 1 ns $end\n$scope module tb $end\n'+Array.from({length:80},(_,i)=>`$var wire 1 signal${i} flag${i} $end`).join('\n')+'\n$upscope $end\n$enddefinitions $end\n#0\n'+Array.from({length:80},(_,i)=>`0signal${i}`).join('\n')+'\n#10\n'+Array.from({length:80},(_,i)=>`1signal${i}`).join('\n')+'\n#20\n';
  await page.evaluate(vcd=>window.postMessage({type:'anacode-vcd',vcd},location.origin),many);
  await expect(page.getByLabel('Value of tb.flag0',{exact:true})).toHaveText('0');
  const header=page.locator('.signal-header'),top=(await header.boundingBox())!.y;
  await page.locator('.signal-scroll').hover({position:{x:20,y:50}});await page.mouse.wheel(0,1500);
  await expect(page.getByLabel('Value of tb.flag79',{exact:true})).toHaveText('0');
  expect((await header.boundingBox())!.y).toBe(top);
  const markup='$timescale 1 ns $end\n$scope module tb $end\n$var wire 32 ! markup $end\n$upscope $end\n$enddefinitions $end\n#0\nb'+(0x3c672f3e).toString(2)+' !\n#10\n';
  await page.evaluate(vcd=>window.postMessage({type:'anacode-vcd',vcd},location.origin),markup);
  await expect(page.getByLabel('Value of tb.markup',{exact:true})).toHaveText('3c672f3e');
  await page.getByRole('button',{name:'Signal options: tb.markup',exact:true}).click();
  await page.getByRole('menuitemradio',{name:'ASCII',exact:true}).click();
  await expect(page.getByLabel('Value of tb.markup',{exact:true})).toHaveText('"<g/>"');
  await expect(page.locator('.wd-values title')).toHaveText('"<g/>"');
  await expect(page.locator('.wd-values title g')).toHaveCount(0);
  expect(errors).toEqual([]);
});

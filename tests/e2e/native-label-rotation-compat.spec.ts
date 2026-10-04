import { expect, test, type Page } from '@playwright/test';
import type { CircuitJsApi } from '../../lib/circuitjs';

const fixture='$ 4 .000001 10 50 5 50\nv 96 240 96 80 0 0 40 10 0 0 .5\nw 96 80 160 80 0\nr 160 80 320 80 0 1000\nr 320 80 320 240 0 1000\nw 320 240 96 240 0\ng 96 240 96 288 0\n207 320 80 320 32 12 legacy';
type NativeWindow = Window & { CircuitJS1: CircuitJsApi; AnaCodeKiCad?: {ready: boolean}; labelInk?: {x:number;y:number;angle:number} };
async function open(page: Page) {
  await page.goto(`/circuitjs/circuitjs.html?running=false&hideSidebar=true&hideInfoBox=true&cct=${encodeURIComponent('$ 4 .000001 10 50 5 50')}`);
  await page.waitForFunction(()=>Boolean((window as NativeWindow).CircuitJS1?.ensureAnalyzed && (window as NativeWindow).AnaCodeKiCad?.ready));
  await page.evaluate(text=>{
    const win=window as NativeWindow,canvas=document.querySelector('canvas')!,ctx=canvas.getContext('2d')!,original=ctx.fillText.bind(ctx);
    ctx.fillText=(text:string,x:number,y:number,maxWidth?:number)=>{
      if(text==='legacy'){
        const transform=ctx.getTransform(),point=new DOMPoint(x+ctx.measureText(text).width/2,y).matrixTransform(transform),rect=canvas.getBoundingClientRect();
        win.labelInk={x:rect.left+point.x/(canvas.width/rect.width),y:rect.top+point.y/(canvas.height/rect.height),angle:(Math.round(Math.atan2(transform.b,transform.a)*180/Math.PI)+360)%360};
      }
      if(maxWidth===undefined)original(text,x,y);else original(text,x,y,maxWidth);
    };
    win.CircuitJS1.importCircuit(text,false);win.CircuitJS1.ensureAnalyzed!();
  },fixture);
}
const angle=(page:Page)=>page.evaluate(()=>(window as NativeWindow).CircuitJS1.getElements().find(e=>e.getType()==='LabeledNodeElm')!.getLabelAngle!());

test('legacy vertical rotation migrates from text and XML while explicit XML angle wins',async({page})=>{
  await open(page);
  expect(await angle(page)).toBe(270);
  await expect.poll(()=>page.evaluate(()=>(window as NativeWindow).labelInk?.angle)).toBe(270);
  const saved=await page.evaluate(()=>(window as NativeWindow).CircuitJS1.exportCircuit());
  expect(saved).toContain('ata="270"');
  for(const explicit of [null,'0','90']){
    await page.evaluate(({saved,explicit})=>{
      const win=window as NativeWindow,doc=new DOMParser().parseFromString(saved,'application/xml'),label=doc.querySelector('ln')!;
      label.setAttribute('f','12');if(explicit===null)label.removeAttribute('ata');else label.setAttribute('ata',explicit);
      win.labelInk=undefined;win.CircuitJS1.importCircuit(new XMLSerializer().serializeToString(doc),false);win.CircuitJS1.ensureAnalyzed!();
    },{saved,explicit});
    const expected=explicit===null?270:Number(explicit);
    expect(await angle(page)).toBe(expected);
    await expect.poll(()=>page.evaluate(()=>(window as NativeWindow).labelInk?.angle)).toBe(expected);
    const state=await page.evaluate(()=>{const api=(window as NativeWindow).CircuitJS1,label=api.getElements().find(e=>e.getType()==='LabeledNodeElm')!,r=api.getElements().find(e=>e.getType()==='ResistorElm'&&e.getPostX(0)===320)!,flags=Number(new DOMParser().parseFromString(label.exportElement(),'application/xml').documentElement.getAttribute('f'));return{post:[label.getPostX(0),label.getPostY(0)],sameNet:label.getNodeId(0)===r.getNodeId(0),flags,xml:api.exportCircuit()};});
    expect(state.post).toEqual([320,80]);expect(state.sameNet).toBe(true);expect(state.flags&8).toBe(0);
    await page.evaluate(text=>{const a=(window as NativeWindow).CircuitJS1;a.importCircuit(text,false);a.ensureAnalyzed!();},state.xml);
    expect(await angle(page)).toBe(expected);
  }
  await page.evaluate(text=>{const a=(window as NativeWindow).CircuitJS1;a.importCircuit(text.replace('320 80 320 32 12 legacy','320 80 368 80 12 legacy'),false);a.ensureAnalyzed!();},fixture);
  expect(await angle(page)).toBe(0);
});

test('one native angle selector applies rotation without a stale checkbox overwriting it',async({page})=>{
  await open(page);await expect.poll(()=>page.evaluate(()=>(window as NativeWindow).labelInk?.angle)).toBe(270);
  const text=await page.evaluate(()=>(window as NativeWindow).labelInk!);await page.mouse.dblclick(text.x,text.y);
  const dialog=page.locator('.gwt-DialogBox');await expect(dialog).toBeVisible();
  await expect(dialog.getByText('Label angle',{exact:true})).toBeVisible();
  await expect(dialog.getByText('Rotate Text When Vertical',{exact:true})).toHaveCount(0);
  const control=dialog.getByRole('combobox').first();await expect(control.locator('option:checked')).toHaveText('270°');
  await control.selectOption({label:'90°'});await dialog.getByRole('button',{name:'Apply',exact:true}).click();
  expect(await angle(page)).toBe(90);await expect.poll(()=>page.evaluate(()=>(window as NativeWindow).labelInk?.angle)).toBe(90);
  await dialog.getByRole('button',{name:'OK',exact:true}).click();expect(await angle(page)).toBe(90);
  await page.keyboard.press('Control+z');await expect.poll(()=>angle(page)).toBe(270);
  await page.keyboard.press('Control+y');await expect.poll(()=>angle(page)).toBe(90);
  await expect.poll(()=>page.evaluate(()=>(window as NativeWindow).labelInk?.angle)).toBe(90);
  const rotated=await page.evaluate(()=>(window as NativeWindow).labelInk!);await page.mouse.dblclick(rotated.x,rotated.y);
  await expect(dialog).toBeVisible();await control.selectOption({label:'180°'});await dialog.getByRole('button',{name:'OK',exact:true}).click();
  expect(await angle(page)).toBe(180);await expect.poll(()=>page.evaluate(()=>(window as NativeWindow).labelInk?.angle)).toBe(180);
  const saved=await page.evaluate(()=>(window as NativeWindow).CircuitJS1.exportCircuit());expect(saved).toContain('ata="180"');
  await page.evaluate(text=>{const a=(window as NativeWindow).CircuitJS1;a.importCircuit(text,false);a.ensureAnalyzed!();},saved);expect(await angle(page)).toBe(180);
});

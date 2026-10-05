import { expect, test } from '@playwright/test';
import type { CircuitJsApi } from '../../lib/circuitjs';
import { CIRCUITJS_STARTERS } from '../../lib/circuitjs-starters';
import { neutralCircuitJsPresentation } from '../../lib/circuitjs';

type Ink = { text: string; left: number; top: number; right: number; bottom: number };
type NativeWindow = Window & { CircuitJS1: CircuitJsApi & { getCircuitAsSVG(): void; onsvgrendered?: (api: unknown, svg: string) => void }; AnaCodeKiCad?: { ready: boolean }; ink: Ink[]; segments: number[][]; junctions: { x: number; y: number; radius: number }[] };
test('automatic labels clear wires and other captions; source captions fit on first import', async ({ page }) => {
  await page.setViewportSize({ width: 800, height: 660 });
  await page.goto(`/circuitjs/circuitjs.html?running=false&hideSidebar=true&hideInfoBox=true&cct=${encodeURIComponent('$ 4 .000001 10 50 5 50')}`);
  await page.waitForFunction(() => Boolean((window as unknown as NativeWindow).CircuitJS1?.ensureAnalyzed && (window as unknown as NativeWindow).AnaCodeKiCad?.ready));
  await page.evaluate(() => {
    const win = window as unknown as NativeWindow, canvas = document.querySelector('canvas')!, ctx = canvas.getContext('2d')!;
    win.ink = []; win.segments = []; const original = ctx.fillText.bind(ctx), fill = ctx.fillRect.bind(ctx);
    ctx.fillRect = (x, y, w, h) => { if (w > 400 && h > 400) { win.ink = []; win.segments = []; } fill(x, y, w, h); };
    const begin = ctx.beginPath.bind(ctx), move = ctx.moveTo.bind(ctx), line = ctx.lineTo.bind(ctx), stroke = ctx.stroke.bind(ctx);
    let previous: DOMPoint | null = null, path: number[][] = [];
    ctx.beginPath = () => { previous = null; path = []; begin(); };
    ctx.moveTo = (x, y) => { previous = new DOMPoint(x, y).matrixTransform(ctx.getTransform()); move(x, y); };
    ctx.lineTo = (x, y) => { const point = new DOMPoint(x, y).matrixTransform(ctx.getTransform()); if (previous) path.push([previous.x, previous.y, point.x, point.y]); previous = point; line(x, y); };
    ctx.stroke = (object?: Path2D) => { if (object) stroke(object); else { if (ctx.globalAlpha > .5) { const scale = canvas.width / canvas.getBoundingClientRect().width; win.segments.push(...path.map(segment => segment.map(p => p / scale))); } stroke(); } };
    ctx.fillText = (text, x, y, maxWidth) => {
      if (ctx.globalAlpha > .5) {
        const metrics = ctx.measureText(text), t = ctx.getTransform(), rectangle = canvas.getBoundingClientRect(), scale = canvas.width / rectangle.width;
        const corners = [[x - metrics.actualBoundingBoxLeft, y - metrics.actualBoundingBoxAscent], [x + metrics.actualBoundingBoxRight, y + metrics.actualBoundingBoxDescent]].map(([x, y]) => new DOMPoint(x, y).matrixTransform(t));
        win.ink.push({ text, left: Math.min(...corners.map(p => p.x)) / scale, right: Math.max(...corners.map(p => p.x)) / scale, top: Math.min(...corners.map(p => p.y)) / scale, bottom: Math.max(...corners.map(p => p.y)) / scale });
      }
      if (maxWidth === undefined) original(text, x, y); else original(text, x, y, maxWidth);
    };
  });
  for (const slug of ['rc-cutoff-1khz', 'sallen-key-q', 'cmos-inverter-trip-point']) {
    await page.evaluate(text => { const w = window as unknown as NativeWindow, a = w.CircuitJS1; w.ink = []; w.segments = []; a.importCircuit(text, false); a.compactComponentLeads!(); a.setTheme('light'); a.ensureAnalyzed!(); }, neutralCircuitJsPresentation(CIRCUITJS_STARTERS[slug]));
    await expect.poll(() => page.evaluate(() => (window as unknown as NativeWindow).ink.length)).toBeGreaterThan(3);
    const state = await page.evaluate(() => {
      const w = window as unknown as NativeWindow, a = w.CircuitJS1;
      return { ink: w.ink, width: document.querySelector('canvas')!.getBoundingClientRect().width,
        wires: [...w.segments, ...a.getElements().filter(e => e.getType() === 'WireElm').map(e => [a.screenX(e.getPostX(0)), a.screenY(e.getPostY(0)), a.screenX(e.getPostX(1)), a.screenY(e.getPostY(1))])] };
    });
    const captions = state.ink.filter(t => !['+', '-', '−'].includes(t.text));
    for (const [index, ink] of captions.entries()) {
      expect(ink.left, `${slug}: ${ink.text} clipped left`).toBeGreaterThanOrEqual(1);
      expect(ink.right, `${slug}: ${ink.text} clipped right`).toBeLessThan(state.width - 1);
      for (const other of captions.slice(index + 1)) expect(ink.left < other.right - 1 && ink.right > other.left + 1 && ink.top < other.bottom - 1 && ink.bottom > other.top + 1, `${slug}: ${ink.text} overlaps ${other.text}`).toBe(false);
      for (const [x1, y1, x2, y2] of state.wires) {
        const crosses = y1 === y2 ? y1 > ink.top + 1 && y1 < ink.bottom - 1 && Math.max(x1, x2) > ink.left + 1 && Math.min(x1, x2) < ink.right - 1
          : x1 === x2 && x1 > ink.left + 1 && x1 < ink.right - 1 && Math.max(y1, y2) > ink.top + 1 && Math.min(y1, y2) < ink.bottom - 1;
        expect(crosses, `${slug}: ${ink.text} crossed by wire`).toBe(false);
      }
    }
    await page.screenshot({ path: `.tmp/anacod3-clearance-${slug}.png` });
  }
  const exported = await page.evaluate(() => new Promise<string>(resolve => {
    const a = (window as unknown as NativeWindow).CircuitJS1;
    a.onsvgrendered = (_api, svg) => { a.onsvgrendered = undefined; resolve(svg); }; a.getCircuitAsSVG();
  }));
  expect(exported).toContain('1.8V'); expect(exported).toContain('>in<'); expect(exported).toContain('>out<');
});

test('junction dots use a larger radius only at three physical connected branches, excluding net labels', async ({ page }) => {
  await page.goto(`/circuitjs/circuitjs.html?running=false&hideSidebar=true&hideInfoBox=true&cct=${encodeURIComponent('$ 4 .000001 10 50 5 50')}`);
  await page.waitForFunction(() => Boolean((window as unknown as NativeWindow).CircuitJS1?.ensureAnalyzed && (window as unknown as NativeWindow).AnaCodeKiCad?.ready));
  await page.evaluate(() => {
    const w = window as unknown as NativeWindow, ctx = document.querySelector('canvas')!.getContext('2d')!, arc = ctx.arc.bind(ctx);
    w.junctions = []; ctx.arc = (x, y, radius, start, end, counterclockwise) => { if (radius === 3 && ctx.globalAlpha > .5) w.junctions.push({ x, y, radius }); arc(x, y, radius, start, end, counterclockwise); };
    w.CircuitJS1.importCircuit('$ 4 .000001 10 50 5 50\nw 96 80 192 80 0\nw 192 80 288 80 0\n207 192 80 192 32 4 alias\nw 288 80 384 80 0\nw 288 80 288 160 0', false);
    w.CircuitJS1.setTheme('light'); w.CircuitJS1.ensureAnalyzed!();
  });
  await expect.poll(() => page.evaluate(() => (window as unknown as NativeWindow).junctions.some(p => p.x === 288 && p.y === 80 && p.radius === 3))).toBe(true);
  expect(await page.evaluate(() => (window as unknown as NativeWindow).junctions.some(p => p.x === 192 && p.y === 80))).toBe(false);
  await page.screenshot({ path: '.tmp/anacod3-physical-junctions.png' });
});

test('BJT base, collector and emitter show junction dots where two wires meet the device post', async ({ page }) => {
  await page.goto(`/circuitjs/circuitjs.html?running=false&hideSidebar=true&hideInfoBox=true&cct=${encodeURIComponent('$ 4 .000001 10 50 5 50')}`);
  await page.waitForFunction(() => Boolean((window as unknown as NativeWindow).CircuitJS1?.ensureAnalyzed && (window as unknown as NativeWindow).AnaCodeKiCad?.ready));
  await page.evaluate(() => {
    const w = window as unknown as NativeWindow, ctx = document.querySelector('canvas')!.getContext('2d')!, arc = ctx.arc.bind(ctx), fill = ctx.fillRect.bind(ctx);
    w.junctions = [];
    ctx.fillRect = (x,y,width,height) => { if(width > 400 && height > 400) w.junctions = []; fill(x,y,width,height); };
    ctx.arc = (x,y,radius,start,end,counterclockwise) => { if(radius === 3 && ctx.globalAlpha > .5) w.junctions.push({x,y,radius}); arc(x,y,radius,start,end,counterclockwise); };
  });
  for(const polarity of [1,-1]) {
    const posts = await page.evaluate(polarity => {
      const a = (window as unknown as NativeWindow).CircuitJS1;
      const circuit = `$ 4 .000001 10 50 5 50\nt 160 160 224 160 0 ${polarity} 0 0 120 default`;
      a.importCircuit(circuit,false);
      const transistor = a.getElements()[0];
      const posts = Array.from({length:3},(_,p)=>({x:transistor.getPostX(p),y:transistor.getPostY(p)}));
      const wires = posts.flatMap((p,index) => [`w ${p.x} ${p.y} ${p.x+(index===0?-64:64)} ${p.y} 0`, `w ${p.x} ${p.y} ${p.x} ${p.y+(index===2?64:-64)} 0`]);
      a.importCircuit([circuit,...wires].join('\n'),false); a.setTheme('light'); a.ensureAnalyzed!();
      return posts;
    },polarity);
    await expect.poll(()=>page.evaluate(posts => posts.every(p => (window as unknown as NativeWindow).junctions.some(dot=>dot.x===p.x && dot.y===p.y)),posts)).toBe(true);
  }
});

import { expect, test, type Frame, type Page } from '@playwright/test';
import type { CircuitJsApi, CircuitJsElement } from '../../lib/circuitjs';

type KiCadWindow = Window & {
  CircuitJS1: CircuitJsApi;
  AnaCodeKiCad?: { ready: boolean; source: string; canDraw(element: CircuitJsElement): boolean };
  AnaCodeKiCadError?: string;
};

async function nativeKiCadEditor(page: Page): Promise<Frame> {
  await expect(page.getByRole('button', { name: 'Capture all probes' })).toBeEnabled({ timeout: 30_000 });
  const frame = await (await page.locator('iframe[title="CircuitJS schematic editor"]').elementHandle())?.contentFrame();
  if (!frame) throw new Error('The native schematic frame is missing.');
  await expect.poll(() => frame.evaluate(() => {
    const native = window as unknown as KiCadWindow;
    return { ready: native.AnaCodeKiCad?.ready ?? false, source: native.AnaCodeKiCad?.source, error: native.AnaCodeKiCadError ?? null };
  }), { message: 'The real KiCad SVG library must load in the native editor', timeout: 30_000 }).toEqual({
    ready: true, source: 'KiCad official symbol library', error: null,
  });
  return frame;
}

test('the KiCad resistor palette creates a real editable native component', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/problems/precision-voltage-divider');
  const frame = await nativeKiCadEditor(page);
  const before = await frame.evaluate(() => {
    const elements = (window as unknown as KiCadWindow).CircuitJS1.getElements();
    return { total: elements.length, resistors: elements.filter((element) => element.getType() === 'ResistorElm').length };
  });

  await page.getByRole('button', { name: 'Add resistor', exact: true }).click();
  const canvas = frame.locator('canvas');
  await canvas.scrollIntoViewIfNeeded();
  const blank = await frame.evaluate(() => {
    const api = (window as unknown as KiCadWindow).CircuitJS1;
    const rect = document.querySelector('canvas')!.getBoundingClientRect();
    const occupied = api.getElements().filter((element) => element.getPostCount() > 0).map((element) => {
      const posts = Array.from({ length: element.getPostCount() }, (_, post) => ({ x: api.screenX(element.getPostX(post)), y: api.screenY(element.getPostY(post)) }));
      return { left: Math.min(...posts.map((point) => point.x)) - 30, right: Math.max(...posts.map((point) => point.x)) + 30,
        top: Math.min(...posts.map((point) => point.y)) - 30, bottom: Math.max(...posts.map((point) => point.y)) + 30 };
    });
    // Choose a visible empty canvas region, regardless of native auto-fit zoom.
    for (const yFraction of [0.7, 0.5, 0.3]) for (const xFraction of [0.7, 0.5, 0.3]) {
      const x = rect.width * xFraction, y = rect.height * yFraction;
      if (x + 100 >= rect.width - 10 || y >= rect.height - 70) continue;
      if (occupied.some((box) => x <= box.right && x + 100 >= box.left && y >= box.top && y <= box.bottom)) continue;
      return { x, y };
    }
    throw new Error('No empty native canvas region was available for component placement.');
  });
  const bounds = await canvas.boundingBox();
  if (!bounds) throw new Error('The native canvas is not visible.');
  await page.mouse.move(bounds.x + blank.x, bounds.y + blank.y);
  await page.mouse.down();
  await page.mouse.move(bounds.x + blank.x + 100, bounds.y + blank.y, { steps: 8 });
  await page.mouse.up();

  await expect.poll(() => frame.evaluate(() => {
    const elements = (window as unknown as KiCadWindow).CircuitJS1.getElements();
    return { total: elements.length, resistors: elements.filter((element) => element.getType() === 'ResistorElm').length };
  })).toEqual({ total: before.total + 1, resistors: before.resistors + 1 });
  const added = await frame.evaluate(() => {
    const native = window as unknown as KiCadWindow;
    const element = native.CircuitJS1.getElements().at(-1)!;
    return { type: element.getType(), posts: element.getPostCount(), drawable: native.AnaCodeKiCad!.canDraw(element),
      length: Math.hypot(element.getPostX(1) - element.getPostX(0), element.getPostY(1) - element.getPostY(0)), xml: element.exportElement() };
  });
  expect(added).toMatchObject({ type: 'ResistorElm', posts: 2, drawable: true });
  expect(added.length).toBeGreaterThan(0);
  expect(added.xml).toMatch(/<component\b/);
  expect(added.xml).toMatch(/\br="1000"/);

  // Choosing Edit must leave native component-placement mode without relying
  // on Escape. A drag may move/select this resistor, but must never add another.
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Edit', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await canvas.scrollIntoViewIfNeeded();
  const editBounds = await canvas.boundingBox();
  if (!editBounds) throw new Error('The native canvas is not visible after choosing Edit.');
  await page.mouse.move(editBounds.x + blank.x, editBounds.y + blank.y);
  await page.mouse.down();
  await page.mouse.move(editBounds.x + blank.x + 100, editBounds.y + blank.y, { steps: 8 });
  await page.mouse.up();
  await expect.poll(() => frame.evaluate(() => {
    const elements = (window as unknown as KiCadWindow).CircuitJS1.getElements();
    return { total: elements.length, resistors: elements.filter((element) => element.getType() === 'ResistorElm').length };
  })).toEqual({ total: before.total + 1, resistors: before.resistors + 1 });
  expect(errors).toEqual([]);
});

test('connected DC, CMOS and op-amp projects use official symbols while the native solver stays live', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  for (const project of [
    { slug: 'precision-voltage-divider', types: ['VoltageElm', 'ResistorElm'], count: 3 },
    { slug: 'cmos-inverter-trip-point', types: ['MosfetElm'], count: 2 },
    { slug: 'sallen-key-q', types: ['OpAmpElm', 'CapacitorElm'], count: 3 },
  ]) {
    await page.goto(`/problems/${project.slug}`);
    const frame = await nativeKiCadEditor(page);
    await expect.poll(() => frame.evaluate((types) => {
      const native = window as unknown as KiCadWindow;
      const elements = native.CircuitJS1.getElements();
      const targets = elements.filter((element) => types.includes(element.getType()));
      return { stop: native.CircuitJS1.getStopMessage(), count: targets.length,
        drawable: targets.every((element) => native.AnaCodeKiCad!.canDraw(element)),
        finiteReadings: targets.every((element) => Array.from({ length: element.getPostCount() }, (_, post) => element.getVoltage(post)).every(Number.isFinite)),
        energized: elements.some((element) => Array.from({ length: element.getPostCount() }, (_, post) => Math.abs(element.getVoltage(post))).some((voltage) => voltage > 0.01)),
      };
    }, project.types), { message: `${project.slug} must display real symbols and solved voltages` }).toEqual({ stop: null, count: project.count, drawable: true, finiteReadings: true, energized: true });
    if (project.slug === 'sallen-key-q') {
      const acSourceDrawable = await frame.evaluate(() => {
        const native = window as unknown as KiCadWindow;
        const source = native.CircuitJS1.getElements().find((element) => element.getType() === 'VoltageElm')!;
        return native.AnaCodeKiCad!.canDraw(source);
      });
      expect(acSourceDrawable, 'The AC source must retain its native waveform symbol instead of a DC mark').toBe(false);
    }
  }
  expect(errors).toEqual([]);
});

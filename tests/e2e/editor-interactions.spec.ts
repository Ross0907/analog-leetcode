import { expect, test, type Page } from "@playwright/test";
import type { CircuitDocument } from "../../app/components/textbook-schematic-editor";

async function savedDocument(page: Page): Promise<CircuitDocument> {
  const pending = page.waitForEvent("download");
  await page.getByTitle("Save AnaCode schematic", { exact: true }).click();
  const download = await pending;
  const stream = await download.createReadStream();
  if (!stream) throw new Error("The schematic download is missing.");
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  return JSON.parse(Buffer.concat(chunks).toString("utf8")).document;
}

function wireConnections(document: CircuitDocument) {
  return document.wires.map(({ id, from, to }) => ({ id, from, to }));
}

test("schematic shortcuts, routed movement, click wiring, and automatic junctions are real editor operations", async ({ page }) => {
  await page.goto("/problems/sallen-key-q");
  const surface = page.getByRole("application", { name: "Interactive schematic editor" });
  await expect(surface).toBeVisible();
  await expect(page.locator(".textbook-editor")).toHaveAttribute("data-editor-ready", "true", { timeout: 30_000 });
  await expect(page.locator(".react-flow__node").first()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("button", { name: /Junction/i })).toHaveCount(0);

  const selectTool = page.getByRole("button", { name: /Select V/i });
  const wireTool = page.getByRole("button", { name: /Wire W/i });
  await surface.focus();
  await page.keyboard.press("w");
  await expect(wireTool).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("v");
  await expect(selectTool).toHaveAttribute("aria-pressed", "true");

  const search = page.getByRole("textbox", { name: "Search components" });
  await search.press("w");
  await expect(search).toHaveValue("w");
  await expect(selectTool).toHaveAttribute("aria-pressed", "true");
  await search.fill("");

  const viewport = page.locator(".react-flow__viewport");
  const surfaceBox = await surface.boundingBox();
  expect(surfaceBox).not.toBeNull();
  const zoomBefore = await viewport.getAttribute("style");
  await page.mouse.move(surfaceBox!.x + surfaceBox!.width * 0.66, surfaceBox!.y + surfaceBox!.height * 0.42);
  await page.keyboard.down("Control");
  await page.mouse.wheel(0, -240);
  await page.keyboard.up("Control");
  await expect.poll(() => viewport.getAttribute("style")).not.toBe(zoomBefore);

  const panBefore = await viewport.getAttribute("style");
  await page.mouse.wheel(70, 130);
  await expect.poll(() => viewport.getAttribute("style")).not.toBe(panBefore);
  await page.getByRole("button", { name: "Fit View" }).click();

  const resistorNode = page.locator('.react-flow__node[data-id="R1"]');
  const resistorBox = await resistorNode.boundingBox();
  expect(resistorBox).not.toBeNull();
  const positionBefore = await resistorNode.evaluate((node) => (node as HTMLElement).style.transform);
  const routesBefore = await page.locator(".react-flow__edge-path").evaluateAll((paths) => paths.map((path) => path.getAttribute("d")));
  await page.mouse.move(resistorBox!.x + resistorBox!.width / 2, resistorBox!.y + resistorBox!.height / 2);
  await page.mouse.down();
  await page.mouse.move(resistorBox!.x + resistorBox!.width / 2 + 55, resistorBox!.y + resistorBox!.height / 2 + 35, { steps: 10 });
  await page.mouse.up();
  await expect.poll(() => resistorNode.evaluate((node) => (node as HTMLElement).style.transform)).not.toBe(positionBefore);
  await expect.poll(() => page.locator(".react-flow__edge-path").evaluateAll((paths) => paths.map((path) => path.getAttribute("d")))).not.toEqual(routesBefore);

  await surface.focus();
  await page.keyboard.press("Control+z");
  await expect.poll(() => resistorNode.evaluate((node) => (node as HTMLElement).style.transform)).toBe(positionBefore);

  const interaction = page.locator('.react-flow__edge[data-id="W10"] .react-flow__edge-interaction');
  await interaction.dispatchEvent("click");
  const selectedPath = page.locator(".react-flow__edge.selected .react-flow__edge-path");
  await expect(selectedPath).toBeAttached();
  const wireBefore = await selectedPath.getAttribute("d");
  const documentBeforeStretch = await savedDocument(page);
  await expect(page.getByTestId("smart-edge-control-point")).toHaveCount(0);
  const wireGrip = page.locator(".react-flow__edge.selected .schematic-wire-segment-grip").first();
  await expect(wireGrip).toBeAttached();
  const gripPoint = await wireGrip.evaluate((line: SVGLineElement) => {
    const x = (line.x1.baseVal.value + line.x2.baseVal.value) / 2;
    const y = (line.y1.baseVal.value + line.y2.baseVal.value) / 2;
    const screen = new DOMPoint(x, y).matrixTransform(line.getScreenCTM()!);
    return {
      x: screen.x,
      y: screen.y,
      horizontal: Math.abs(line.x2.baseVal.value - line.x1.baseVal.value) >= Math.abs(line.y2.baseVal.value - line.y1.baseVal.value),
    };
  });
  await page.mouse.move(gripPoint.x, gripPoint.y);
  await page.mouse.down();
  await page.mouse.move(gripPoint.x + (gripPoint.horizontal ? 0 : 35), gripPoint.y + (gripPoint.horizontal ? 35 : 0), { steps: 8 });
  await page.mouse.up();
  await expect.poll(() => selectedPath.getAttribute("d")).not.toBe(wireBefore);
  await expect(page.locator(".editor-status")).toContainText("Wire segment moved");
  const documentAfterStretch = await savedDocument(page);
  expect(documentAfterStretch.parts).toEqual(documentBeforeStretch.parts);
  expect(documentAfterStretch.junctions).toEqual(documentBeforeStretch.junctions);
  expect(wireConnections(documentAfterStretch)).toEqual(wireConnections(documentBeforeStretch));
  expect(documentAfterStretch.wires.filter((wire) => wire.id !== "W10")).toEqual(documentBeforeStretch.wires.filter((wire) => wire.id !== "W10"));
  expect(documentAfterStretch.wires.find((wire) => wire.id === "W10")!.waypoints).not.toEqual(documentBeforeStretch.wires.find((wire) => wire.id === "W10")!.waypoints);
  const stretchedPath = await selectedPath.getAttribute("d");
  const targetWirePath = page.locator('.react-flow__edge[data-id="W10"] .react-flow__edge-path');
  await surface.focus();
  await page.keyboard.press("Control+z");
  await expect.poll(() => targetWirePath.getAttribute("d")).toBe(wireBefore);
  await page.keyboard.press("Control+y");
  await expect.poll(() => targetWirePath.getAttribute("d")).toBe(stretchedPath);

  const libraryResistor = page.getByRole("button", { name: /^Resistor/ });
  await libraryResistor.click();
  await page.mouse.click(surfaceBox!.x + surfaceBox!.width * 0.3, surfaceBox!.y + 115);
  await expect(page.locator('.react-flow__node[data-id="R3"]')).toBeVisible();
  await libraryResistor.click();
  await page.mouse.click(surfaceBox!.x + surfaceBox!.width * 0.68, surfaceBox!.y + 115);
  await expect(page.locator('.react-flow__node[data-id="R4"]')).toBeVisible();

  const edgeCount = await page.locator(".react-flow__edge").count();
  const r3Position = await page.locator('.react-flow__node[data-id="R3"]').evaluate((node) => (node as HTMLElement).style.transform);
  const sourceHandle = page.locator('[data-nodeid="R3"][data-handleid="pin:1"]');
  const sourceHandleBox = await sourceHandle.boundingBox();
  expect(sourceHandleBox).not.toBeNull();
  await page.mouse.move(sourceHandleBox!.x + sourceHandleBox!.width / 2, sourceHandleBox!.y + sourceHandleBox!.height / 2);
  await page.mouse.down();
  await page.mouse.move(surfaceBox!.x + surfaceBox!.width / 2, surfaceBox!.y + surfaceBox!.height / 2, { steps: 6 });
  const draftPath = page.locator(".react-flow__connection-path");
  await expect(draftPath).toBeAttached();
  expect(await draftPath.evaluate((path) => getComputedStyle(path).fill)).toBe("none");
  await expect(page.locator(".react-flow polygon")).toHaveCount(0);
  await page.mouse.up();
  await expect(draftPath).toHaveCount(0);
  await sourceHandle.click({ force: true });
  await page.locator('[data-nodeid="R4"][data-handleid="pin:0"]').click({ force: true });
  await expect(page.locator(".react-flow__edge")).toHaveCount(edgeCount + 1);
  expect(await page.locator('.react-flow__node[data-id="R3"]').evaluate((node) => (node as HTMLElement).style.transform)).toBe(r3Position);
  await page.mouse.move(5, 5);
  await expect.poll(() => page.locator('[data-nodeid="R3"][data-handleid="pin:1"] > span').evaluate((pin) => getComputedStyle(pin).opacity)).toBe("0");

  const junctionCount = await page.locator(".react-flow__node-schematic-junction").count();
  const branchEdgeCount = await page.locator(".react-flow__edge").count();
  await page.locator('[data-nodeid="R3"][data-handleid="pin:0"]').click({ force: true });
  const branchTarget = page.locator(".react-flow__edge-interaction").first();
  const branchPoint = await branchTarget.evaluate((path: SVGPathElement) => {
    for (let step = 2; step < 19; step += 1) {
      const point = path.getPointAtLength(path.getTotalLength() * (step / 20));
      const screen = new DOMPoint(point.x, point.y).matrixTransform(path.getScreenCTM()!);
      if (document.elementFromPoint(screen.x, screen.y) === path) return { x: screen.x, y: screen.y };
    }
    throw new Error("No unobstructed branch target was clickable.");
  });
  await page.mouse.click(branchPoint.x, branchPoint.y);
  await expect(page.locator(".react-flow__node-schematic-junction")).toHaveCount(junctionCount + 1);
  await expect(page.locator(".react-flow__edge")).toHaveCount(branchEdgeCount + 2);
  await expect(page.locator(".editor-status")).toContainText("junction created automatically");

  // Removing the branch must collapse its now-degree-two automatic junction
  // back into one wire. No selectable/floating junction artifact may remain.
  await expect(page.locator(".react-flow__edge.selected")).toHaveCount(1);
  await surface.focus();
  await page.keyboard.press("Delete");
  await expect(page.locator(".react-flow__node-schematic-junction")).toHaveCount(junctionCount);
  await expect(page.locator(".react-flow__edge")).toHaveCount(branchEdgeCount);
  await expect(page.locator(".editor-status")).toContainText("automatic junctions cleaned");

  const renderedPaths = page.locator(".react-flow__edge-path, .react-flow__connection-path");
  expect(await renderedPaths.evaluateAll((paths) => paths.every((path) => getComputedStyle(path).fill === "none"))).toBe(true);
  await page.screenshot({ path: "artifacts/qa/editor-interactions-desktop.png", fullPage: true });
});

test("marquee selection moves a schematic block as one connected unit", async ({ page }) => {
  await page.goto("/problems/precision-voltage-divider");
  const surface = page.getByRole("application", { name: "Interactive schematic editor" });
  await expect(page.locator(".textbook-editor")).toHaveAttribute("data-editor-ready", "true", { timeout: 30_000 });
  await expect(page.locator('.react-flow__node[data-id="R1"]')).toBeVisible({ timeout: 30_000 });

  const r1 = page.locator('.react-flow__node[data-id="R1"]');
  const r2 = page.locator('.react-flow__node[data-id="R2"]');
  const firstBox = await r1.boundingBox();
  const secondBox = await r2.boundingBox();
  expect(firstBox).not.toBeNull();
  expect(secondBox).not.toBeNull();
  const left = Math.min(firstBox!.x, secondBox!.x) - 8;
  const top = Math.min(firstBox!.y, secondBox!.y) - 8;
  const right = Math.max(firstBox!.x + firstBox!.width, secondBox!.x + secondBox!.width) + 8;
  const bottom = Math.max(firstBox!.y + firstBox!.height, secondBox!.y + secondBox!.height) + 8;

  await page.mouse.move(left, top);
  await page.mouse.down();
  await page.mouse.move(right, bottom, { steps: 12 });
  await expect(page.locator(".react-flow__selection")).toBeVisible();
  await page.mouse.up();
  await expect(r1).toHaveClass(/selected/);
  await expect(r2).toHaveClass(/selected/);
  const selectedCount = await page.locator(".react-flow__node-schematic-part.selected").count();
  expect(selectedCount).toBeGreaterThanOrEqual(2);
  const selectedIds = await page.locator(".react-flow__node-schematic-part.selected").evaluateAll((nodes) => nodes.map((node) => node.getAttribute("data-id")));
  const documentBeforeMove = await savedDocument(page);

  const beforeR1 = await r1.boundingBox();
  const beforeR2 = await r2.boundingBox();
  const attachedRoutes = page.locator('.react-flow__edge[data-id="W2"] .react-flow__edge-path, .react-flow__edge[data-id="W3"] .react-flow__edge-path');
  const routesBefore = await attachedRoutes.evaluateAll((paths) => paths.map((path) => path.getAttribute("d")));
  await page.mouse.move(beforeR1!.x + beforeR1!.width / 2, beforeR1!.y + beforeR1!.height / 2);
  await page.mouse.down();
  await page.mouse.move(beforeR1!.x + beforeR1!.width / 2 + 40, beforeR1!.y + beforeR1!.height / 2 + 30, { steps: 10 });
  await page.mouse.up();

  const afterR1 = await r1.boundingBox();
  const afterR2 = await r2.boundingBox();
  const firstDelta = { x: afterR1!.x - beforeR1!.x, y: afterR1!.y - beforeR1!.y };
  const secondDelta = { x: afterR2!.x - beforeR2!.x, y: afterR2!.y - beforeR2!.y };
  expect(Math.abs(firstDelta.x)).toBeGreaterThan(10);
  expect(Math.abs(firstDelta.y)).toBeGreaterThan(10);
  expect(secondDelta.x).toBeCloseTo(firstDelta.x, 1);
  expect(secondDelta.y).toBeCloseTo(firstDelta.y, 1);
  await expect.poll(() => attachedRoutes.evaluateAll((paths) => paths.map((path) => path.getAttribute("d")))).not.toEqual(routesBefore);
  await expect(page.locator(".editor-status")).toContainText(`${selectedCount} components moved`);
  const documentAfterMove = await savedDocument(page);
  expect(wireConnections(documentAfterMove)).toEqual(wireConnections(documentBeforeMove));
  expect(documentAfterMove.parts.filter((part) => !selectedIds.includes(part.id))).toEqual(documentBeforeMove.parts.filter((part) => !selectedIds.includes(part.id)));

  // Every rendered leg remains a strict horizontal or vertical SVG line.
  expect(await attachedRoutes.evaluateAll((paths) => paths.every((path) => {
    const values = (path.getAttribute("d")?.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);
    const points = Array.from({ length: Math.floor(values.length / 2) }, (_, index) => ({ x: values[index * 2], y: values[index * 2 + 1] }));
    return points.slice(1).every((point, index) => Math.abs(point.x - points[index].x) < 0.01 || Math.abs(point.y - points[index].y) < 0.01);
  }))).toBe(true);

  const beforeKeyR1 = await r1.boundingBox();
  const beforeKeyR2 = await r2.boundingBox();
  await surface.focus();
  await page.keyboard.press("ArrowRight");
  const afterKeyR1 = await r1.boundingBox();
  const afterKeyR2 = await r2.boundingBox();
  expect(afterKeyR1!.x - beforeKeyR1!.x).toBeCloseTo(afterKeyR2!.x - beforeKeyR2!.x, 1);
  await expect(page.locator(".editor-status")).toContainText("connected wires preserved");

  // Adding the probe selects every terminal of JOUT. The automatic junction
  // must now travel with the block, without becoming a selectable component.
  await page.keyboard.down("Shift");
  await page.locator('.react-flow__node[data-id="CH1"]').click();
  await page.keyboard.up("Shift");
  await expect(r1).toHaveClass(/selected/);
  await expect(r2).toHaveClass(/selected/);
  await expect(page.locator('.react-flow__node[data-id="CH1"]')).toHaveClass(/selected/);
  const beforeOwnedMove = await savedDocument(page);
  await surface.focus();
  await page.keyboard.press("ArrowDown");
  const afterOwnedMove = await savedDocument(page);
  const beforeJunction = beforeOwnedMove.junctions.find((junction) => junction.id === "JOUT")!;
  expect(afterOwnedMove.junctions.find((junction) => junction.id === "JOUT")).toEqual({ ...beforeJunction, y: beforeJunction.y + 10 });
  expect(wireConnections(afterOwnedMove)).toEqual(wireConnections(beforeOwnedMove));
  expect(afterOwnedMove.parts.find((part) => part.id === "V1")).toEqual(beforeOwnedMove.parts.find((part) => part.id === "V1"));
});

test("every starter schematic renders only exact 90-degree wire segments", async ({ page }) => {
  const slugs = [
    "precision-voltage-divider",
    "rc-cutoff-1khz",
    "inverting-gain-stage",
    "bjt-bias-across-beta",
    "diode-rectifier-ripple",
    "mosfet-gate-drive",
    "sallen-key-q",
    "cmos-inverter-trip-point",
    "transimpedance-stability",
  ];

  for (const slug of slugs) {
    await page.goto(`/problems/${slug}`);
    const paths = page.locator(".react-flow__edge-path");
    await expect(paths.first(), `${slug} should render wires`).toBeAttached({ timeout: 30_000 });
    await expect.poll(() => paths.evaluateAll((elements) => elements.every((path) => {
      const data = path.getAttribute("d") ?? "";
      const commands = data.match(/[A-Za-z]/g) ?? [];
      if (!commands.length || commands.some((command) => command !== "M" && command !== "L")) return false;
      const values = (data.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);
      const points = Array.from({ length: Math.floor(values.length / 2) }, (_, index) => ({
        x: values[index * 2],
        y: values[index * 2 + 1],
      }));
      return points.length >= 2 && points.slice(1).every((point, index) => (
        Math.abs(point.x - points[index].x) < 0.01 || Math.abs(point.y - points[index].y) < 0.01
      ));
    })), `${slug} contains a diagonal or curved wire`).toBe(true);
    await expect(page.getByTestId("smart-edge-control-point")).toHaveCount(0);
  }
});

test("project import rejects duplicate wire identifiers", async ({ page }) => {
  await page.goto("/problems/precision-voltage-divider");
  await expect(page.locator(".textbook-editor")).toHaveAttribute("data-editor-ready", "true", { timeout: 30_000 });
  const project = {
    schema: "anacode.schematic",
    version: 1,
    document: {
      parts: [
        { id: "R1", kind: "resistor", x: 300, y: 200, rotation: 0, value: "1k" },
        { id: "R2", kind: "resistor", x: 600, y: 200, rotation: 0, value: "1k" },
      ],
      junctions: [],
      wires: [
        { id: "W1", from: { type: "pin", partId: "R1", pin: 1 }, to: { type: "pin", partId: "R2", pin: 0 }, waypoints: [] },
        { id: "W1", from: { type: "pin", partId: "R1", pin: 0 }, to: { type: "pin", partId: "R2", pin: 1 }, waypoints: [] },
      ],
    },
  };
  await page.locator('input[type="file"]').setInputFiles({
    name: "duplicate-wire-ids.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(project)),
  });
  await expect(page.locator(".editor-status")).toContainText("Wire identifiers must be unique.");
});

test("desktop challenge workspace is fixed, resizable, spacious, and theme-aware", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1024 });
  await page.goto("/problems/precision-voltage-divider");
  await expect(page.locator(".react-flow__node").first()).toBeVisible({ timeout: 30_000 });

  const documentSize = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    clientHeight: document.documentElement.clientHeight,
    scrollWidth: document.documentElement.scrollWidth,
    scrollHeight: document.documentElement.scrollHeight,
  }));
  expect(documentSize.scrollWidth).toBeLessThanOrEqual(documentSize.clientWidth + 1);
  expect(documentSize.scrollHeight).toBeLessThanOrEqual(documentSize.clientHeight + 1);

  const canvas = page.locator(".schematic-flow-canvas");
  const canvasBox = await canvas.boundingBox();
  expect(canvasBox).not.toBeNull();
  expect(canvasBox!.width).toBeGreaterThan(570);

  const problemPane = page.locator(".brief-pane");
  const splitter = page.getByRole("separator", { name: "Resize problem and schematic panes" });
  const problemBefore = await problemPane.boundingBox();
  const splitterBox = await splitter.boundingBox();
  expect(problemBefore).not.toBeNull();
  expect(splitterBox).not.toBeNull();
  await page.mouse.move(splitterBox!.x + splitterBox!.width / 2, splitterBox!.y + 100);
  await page.mouse.down();
  await page.mouse.move(splitterBox!.x + 90, splitterBox!.y + 100, { steps: 8 });
  await page.mouse.up();
  await expect.poll(async () => (await problemPane.boundingBox())!.width).toBeGreaterThan(problemBefore!.width + 60);
  await splitter.focus();
  const resizedWidth = (await problemPane.boundingBox())!.width;
  await page.keyboard.press("ArrowLeft");
  await expect.poll(async () => (await problemPane.boundingBox())!.width).toBeLessThan(resizedWidth);

  await page.getByRole("button", { name: "Switch to dark mode" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  expect(await canvas.evaluate((element) => getComputedStyle(element).backgroundColor)).toBe("rgb(27, 27, 27)");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.locator(".textbook-editor")).toHaveAttribute("data-editor-ready", "true", { timeout: 30_000 });
  await expect(page.getByRole("button", { name: "Switch to light mode" })).toBeVisible();
  await expect.poll(() => page.locator(".schematic-flow-canvas").evaluate((canvas) => {
    const bounds = canvas.getBoundingClientRect();
    return [...canvas.querySelectorAll(".react-flow__node-schematic-part")].every((part) => {
      const box = part.getBoundingClientRect();
      return box.left >= bounds.left - 1 && box.right <= bounds.right + 1 && box.top >= bounds.top - 1 && box.bottom <= bounds.bottom + 1;
    });
  }), "Reloading a saved pane width must keep the entire starter in view").toBe(true);
  await page.screenshot({ path: "artifacts/qa/challenge-dark-resized.png", fullPage: true });
});

test("the generated Sallen-Key circuit produces real Bode instruments", async ({ page }) => {
  await page.goto("/problems/sallen-key-q");
  await expect(page.locator(".textbook-editor")).toHaveAttribute("data-editor-ready", "true", { timeout: 30_000 });
  await page.getByRole("button", { name: "Simulate circuit" }).click();
  await expect(page.getByRole("tab", { name: "Instruments" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("region", { name: "Bode magnitude" })).toBeVisible({ timeout: 45_000 });
  await expect(page.getByRole("region", { name: "Bode phase" })).toBeVisible();
  await expect(page.getByText("Simulation stopped")).toHaveCount(0);
  await expect(page.locator(".anacode-scope__canvas")).toHaveCount(2);
  const documentHeight = await page.evaluate(() => ({ client: document.documentElement.clientHeight, scroll: document.documentElement.scrollHeight }));
  expect(documentHeight.scroll).toBeLessThanOrEqual(documentHeight.client + 1);
  await page.screenshot({ path: "artifacts/qa/sallen-instruments.png", fullPage: true });
});

test("challenge authoring template is visible, typed, and downloadable", async ({ page }) => {
  await page.goto("/problems/new");
  await expect(page.getByRole("heading", { name: "Start from a real challenge contract." })).toBeVisible();
  await expect(page.locator('[data-authoring-ready="true"]')).toBeVisible();
  await expect(page.getByRole("link", { name: /Download template v1/i })).toBeVisible();
  const response = await page.request.get("/api/challenge-template");
  expect(response.ok()).toBeTruthy();
  expect(response.headers()["content-type"]).toContain("application/json");
  expect(response.headers()["content-disposition"]).toContain("anacode-challenge-template.v1.json");
  const template = await response.json();
  expect(template.schema).toBe("anacode.challenge-template");
  expect(template.schemaVersion).toBe(1);
  expect(template.grading.serverAuthoritative).toBe(true);

  const title = page.getByLabel("Title", { exact: true });
  const slug = page.getByLabel("URL slug", { exact: true });
  await title.fill("Low-noise sensor divider");
  await expect(slug).toHaveValue("low-noise-sensor-divider");

  const summary = page.getByLabel("Summary", { exact: true });
  const exportButton = page.getByRole("button", { name: /Download validated JSON/i });
  await summary.fill("");
  await expect(exportButton).toBeDisabled();
  await expect(page.getByLabel("Validation findings")).toBeVisible();
  await summary.fill("Design a divider that meets the specified sensor-bias target.");
  await expect(exportButton).toBeEnabled();

  const downloadEvent = page.waitForEvent("download");
  await exportButton.click();
  const download = await downloadEvent;
  expect(download.suggestedFilename()).toBe("anacode-low-noise-sensor-divider.challenge.v1.json");
});

test("the challenge editor remains contained on a narrow viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/problems/precision-voltage-divider");
  await expect(page.locator(".textbook-editor")).toHaveAttribute("data-editor-ready", "true", { timeout: 30_000 });
  await expect(page.getByRole("application", { name: "Interactive schematic editor" })).toBeVisible();
  const pageOverflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(pageOverflow).toBeLessThanOrEqual(1);
  await page.screenshot({ path: "artifacts/qa/editor-mobile.png", fullPage: true });
});

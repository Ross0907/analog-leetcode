// SPDX-License-Identifier: AGPL-3.0-only
// Render actual pinned Analog Canvas catalog primitives onto native CircuitJS posts.
const definitions = {
  ResistorElm: ['resistor', '1', '2'], CapacitorElm: ['capacitor', '1', '2'], InductorElm: ['inductor-compact', '1', '2'],
  DiodeElm: ['diode', 'A', 'K'], ZenerElm: ['zener-diode', 'A', 'K'], CurrentElm: ['current-source', '+', '-'],
  GroundElm: ['ground', '0'], OpAmpElm: ['opamp-wide', 'IN-', 'IN+', 'OUT'],
  NTransistorElm: ['npn', 'B', 'C', 'E'], PTransistorElm: ['pnp', 'B', 'C', 'E'],
  NMosfetElm: ['nmos', 'G', 'S', 'D'], PMosfetElm: ['pmos', 'G', 'D', 'S'],
};
export function analogSymbolDefinition(element) {
  const type = element.getType();
  if (type === 'BatteryElm') return ['battery', '-', '+'];
  if (['VoltageElm', 'DCVoltageElm', 'ACVoltageElm'].includes(type)) return [[0, 7].includes(element.getWaveform?.()) ? 'battery' : [2, 5].includes(element.getWaveform?.()) ? 'pulse-voltage-source' : 'voltage-source', '-', '+'];
  if (type === 'MosfetElm') return definitions[(element.getFlags() & 1) ? 'PMosfetElm' : 'NMosfetElm'];
  if (type === 'TransistorElm') return definitions[/\(pnp\)$/i.test(element.getInfo()[0] ?? '') ? 'PTransistorElm' : 'NTransistorElm'];
  return definitions[type];
}
export function analogPrimitives(symbol) {
  const variant = symbol.variants?.find((item) => item.id === symbol.defaultVariantId);
  return [...symbol.primitives.filter((primitive) => !variant?.hiddenPrimitiveParts?.includes(primitive.part)), ...(variant?.additionalPrimitives ?? [])];
}
export function analogPlacement(symbol, definition, element) {
  const pins = definition.slice(1).map((name) => symbol.pins.find((pin) => pin.name === name)?.at);
  if (pins.some((pin) => !pin) || pins.length !== element.getPostCount()) return null;
  const posts = pins.map((_, index) => ({ x: element.getPostX(index), y: element.getPostY(index) }));
  const amplifier = symbol.id === 'opamp-wide';
  const [a, b] = pins.length === 3 && !amplifier ? [1, 2] : [0, 1];
  if (pins.length === 1) {
    // Ground is an absolute reference, so its bars always face down the page.
    const c = 1, s = 0;
    return { matrix: [c, s, -s, c, posts[0].x - c * pins[0].x + s * pins[0].y, posts[0].y - s * pins[0].x - c * pins[0].y], pins, posts };
  }
  const length = (p, q) => Math.hypot(q.x - p.x, q.y - p.y);
  const sourceLength = length(pins[a], pins[b]), targetLength = length(posts[a], posts[b]);
  if (sourceLength < 1e-6 || targetLength < 2) return null;
  // Terminal span changes only the straight extensions, never enlarges a body.
  // Very short authored components shrink uniformly to stay inside their posts.
  let scale = Math.min(targetLength / sourceLength, 1);
  let reflection = 1;
  if (pins.length === 3) {
    const other = a === 0 ? 2 : 0;
    const cross = (p, q, r) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
    const sc = cross(pins[a], pins[b], pins[other]), tc = cross(posts[a], posts[b], posts[other]);
    reflection = sc * tc < 0 ? -1 : 1;
    scale = Math.min(scale, Math.abs(tc / targetLength) / Math.abs(sc / sourceLength));
    if (symbol.id === 'npn' || symbol.id === 'pnp') scale *= 0.7;
    if (amplifier) {
      // The upstream wide variant has 40-unit input pitch. Match the real signed
      // posts exactly (normal native pitch 32 => uniform scale .8), avoiding any
      // fan-out bends. A too-short authored amplifier uses the native fallback.
      scale = targetLength / sourceLength;
      if (scale * Math.abs(sc / sourceLength) > Math.abs(tc / targetLength) + 1e-6) return null;
    }
    // The upstream transistor geometry is unchanged; fitting reserves visible
    // clearance between its collector/emitter elbow and the actual native post.
  }
  const angle = Math.atan2(posts[b].y - posts[a].y, posts[b].x - posts[a].x) - Math.atan2((pins[b].y - pins[a].y) * reflection, pins[b].x - pins[a].x);
  const c = Math.cos(angle) * scale, s = Math.sin(angle) * scale;
  const center = { x: (pins[a].x + pins[b].x) / 2, y: (pins[a].y + pins[b].y) / 2 };
  const target = { x: (posts[a].x + posts[b].x) / 2, y: (posts[a].y + posts[b].y) / 2 };
  const matrix = [c, s, -s * reflection, c * reflection, target.x - c * center.x + s * center.y * reflection, target.y - s * center.x - c * center.y * reflection];
  if (amplifier) {
    // Center its three-pin envelope between the real input and output posts.
    // Both input extensions remain straight along the symbol's horizontal axis.
    matrix[4] += (posts[2].x - (matrix[0] * pins[2].x + matrix[2] * pins[2].y + matrix[4])) / 2;
    matrix[5] += (posts[2].y - (matrix[1] * pins[2].x + matrix[3] * pins[2].y + matrix[5])) / 2;
  }
  return { matrix, pins, posts };
}
export function drawAnalogPrimitive(context, primitive, symbolScale = 1) {
  // Compensate for the symbol fit, retaining the same world-space pen weight
  // as native wires. Viewport zoom still scales the entire drawing normally.
  context.lineWidth = 2 / symbolScale;
  context.lineCap = primitive.style?.lineCap ?? 'butt'; context.lineJoin = primitive.style?.lineJoin ?? 'miter';
  context.miterLimit = primitive.style?.miterLimit ?? 10;
  const path = primitive.kind === 'path' ? new Path2D(primitive.data) : new Path2D();
  if (primitive.kind === 'line') { path.moveTo(primitive.from.x, primitive.from.y); path.lineTo(primitive.to.x, primitive.to.y); }
  if (['polyline', 'polygon'].includes(primitive.kind)) { primitive.points.forEach((point, index) => index ? path.lineTo(point.x, point.y) : path.moveTo(point.x, point.y)); if (primitive.kind === 'polygon') path.closePath(); }
  if (primitive.kind === 'circle') path.arc(primitive.center.x, primitive.center.y, primitive.radius, 0, Math.PI * 2);
  if (primitive.fill === 'foreground') context.fill(path);
  if (primitive.stroke !== 'none') context.stroke(path);
}
/** Native source waveform annotation inside the unchanged upstream source body.
 * The generic upstream voltage symbol deliberately has no sine mark. These
 * indicators follow CircuitJS waveform types; PWL stays explicitly arbitrary.
 */
export function drawSourceWaveform(context, waveform, center, scale = 1) {
  if (![1, 3, 4, 6, -2].includes(waveform)) return;
  context.save();
  try {
    context.translate(center.x, center.y);
    context.lineWidth = 2;
    context.lineCap = 'round'; context.lineJoin = 'round';
    if (waveform === -2 || waveform === 6) {
      context.font = `${5.8 * scale}px system-ui,sans-serif`;
      context.textAlign = 'center'; context.textBaseline = 'middle';
      context.fillText(waveform === -2 ? 'PWL' : 'N', 0, 0);
      return;
    }
    const points = waveform === 1
      ? Array.from({ length: 25 }, (_, index) => { const x = index / 24; return { x: (x * 14 - 7) * scale, y: -Math.sin(x * Math.PI * 2) * 4.5 * scale }; })
      : (waveform === 3 ? [[-7,0],[-3.5,-4.5],[3.5,4.5],[7,0]] : [[-7,4.5],[0,-4.5],[0,4.5],[7,-4.5]]).map(([x,y])=>({x:x*scale,y:y*scale}));
    context.beginPath(); points.forEach((point,index) => index ? context.lineTo(point.x,point.y) : context.moveTo(point.x,point.y)); context.stroke();
  } finally { context.restore(); }
}
/** Palette exports use the same untouched primitive coordinates and default variant. */
export function analogSvg(symbol) {
  const point = (p) => `${p.x},${p.y}`;
  const elements = analogPrimitives(symbol).map((p) => {
    const style = `fill="${p.fill === 'foreground' ? '#252b32' : 'none'}" stroke="${p.stroke === 'none' ? 'none' : '#252b32'}" stroke-width="${p.style?.strokeRole === 'emphasis' ? 2.2 : p.style?.strokeRole === 'ground' ? 2 : 1.5}" stroke-linecap="${p.style?.lineCap ?? 'butt'}" stroke-linejoin="${p.style?.lineJoin ?? 'miter'}"`;
    if (p.kind === 'line') return `<line x1="${p.from.x}" y1="${p.from.y}" x2="${p.to.x}" y2="${p.to.y}" ${style}/>`;
    if (p.kind === 'path') return `<path d="${p.data}" ${style}/>`;
    if (p.kind === 'circle') return `<circle cx="${p.center.x}" cy="${p.center.y}" r="${p.radius}" ${style}/>`;
    if (p.kind === 'polygon' || p.kind === 'polyline') return `<${p.kind} points="${p.points.map(point).join(' ')}" ${style}/>`;
    throw new Error(`Unsupported pinned primitive: ${p.kind}`);
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${symbol.viewBox.x} ${symbol.viewBox.y} ${symbol.viewBox.width} ${symbol.viewBox.height}"><title>Analog Canvas ${symbol.name}</title>${elements.join('')}</svg>\n`;
}
export async function createAnalogCanvasRenderer() {
  const response = await fetch('/analog-canvas/symbols.json');
  if (!response.ok) throw new Error('Analog Canvas symbol catalog unavailable.');
  const manifest = await response.json();
  if (manifest.revision !== '85e6be67420a2395d5094325123b6debc1eb0286') throw new Error('Unexpected Analog Canvas revision.');
  let theme = globalThis.document?.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
  const select = (element) => { const definition = analogSymbolDefinition(element); const symbol = definition && manifest.symbols[definition[0]]; const placement = symbol && analogPlacement(symbol, definition, element); return placement ? { symbol, placement } : null; };
  return { setTheme(value) { theme = value; }, canDraw(element) { return Boolean(select(element)); }, draw(context, element, selected) {
    const entry = select(element); if (!entry) return false;
    const { symbol, placement: { matrix, pins, posts } } = entry;
    context.save();
    try {
      context.strokeStyle = context.fillStyle = theme === 'light' ? selected ? '#a96809' : '#252b32' : selected ? '#e4b568' : '#d2d8df';
      context.lineWidth = 2; context.beginPath();
      pins.forEach((pin, index) => {
        const x = matrix[0] * pin.x + matrix[2] * pin.y + matrix[4], y = matrix[1] * pin.x + matrix[3] * pin.y + matrix[5], post = posts[index];
        context.moveTo(post.x, post.y);
        if (!symbol.id.startsWith('opamp') && Math.abs(x - post.x) > 0.1 && Math.abs(y - post.y) > 0.1) context.lineTo(x, post.y);
        context.lineTo(x, y);
      }); context.stroke();
      context.save();
      try {
        context.transform(...matrix);
        analogPrimitives(symbol).forEach((primitive) => drawAnalogPrimitive(context, primitive, Math.hypot(matrix[0], matrix[1])));
      } finally { context.restore(); }
      // Keep the time-axis indicator upright regardless of source rotation.
      if (symbol.id === 'voltage-source') {
        drawSourceWaveform(context, element.getWaveform?.(), {x:matrix[4],y:matrix[5]}, Math.hypot(matrix[0],matrix[1]));
      }
      return true;
    } finally { context.restore(); }
  } };
}

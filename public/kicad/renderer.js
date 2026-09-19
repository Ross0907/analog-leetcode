// SPDX-License-Identifier: GPL-2.0-or-later
// Presentation adapter for CircuitJS. Symbol geometry is exported by KiCad;
// CircuitJS alone owns terminals, hit testing, editing, connectivity and solving.
const definitions = {
  ResistorElm: { source: 'Device:R_US', pins: ['1', '2'], scale: 5 },
  CapacitorElm: { source: 'Device:C', pins: ['1', '2'], scale: 5 },
  PolarCapacitorElm: { source: 'Device:C_Polarized', pins: ['1', '2'] },
  InductorElm: { source: 'Device:L', pins: ['1', '2'], scale: 6 },
  DiodeElm: { source: 'Device:D', pins: ['2', '1'] },
  ZenerElm: { source: 'Device:D_Zener', pins: ['2', '1'] },
  LEDElm: { source: 'Device:LED', pins: ['2', '1'] },
  // CircuitJS voltage sources have their positive terminal at native post 1.
  VoltageElm: { source: 'Simulation_SPICE:VDC', pins: ['2', '1'] },
  DCVoltageElm: { source: 'Simulation_SPICE:VDC', pins: ['2', '1'] },
  CurrentElm: { source: 'Simulation_SPICE:IDC', pins: ['1', '2'] },
  GroundElm: { source: 'power:GNDREF', pins: ['1'] },
  OpAmpElm: { source: 'Amplifier_Operational:LM2904', pins: ['2', '3', '1'], anchors: [0, 1], center: true },
  MosfetElm: { source: 'Device:Q_NMOS', pins: ['G', 'S', 'D'], anchors: [1, 2], bodyAnchors: true },
  NMosfetElm: { source: 'Device:Q_NMOS', pins: ['G', 'S', 'D'], anchors: [1, 2], bodyAnchors: true },
  PMosfetElm: { source: 'Device:Q_PMOS', pins: ['G', 'D', 'S'], anchors: [1, 2], bodyAnchors: true },
  NTransistorElm: { source: 'Device:Q_NPN', pins: ['B', 'C', 'E'], anchors: [1, 2] },
  PTransistorElm: { source: 'Device:Q_PNP', pins: ['B', 'C', 'E'], anchors: [1, 2] },
};

export function symbolDefinition(element) {
  const type = element.getType();
  let definition = definitions[type];
  if ((type === 'VoltageElm' || type === 'DCVoltageElm') && element.getWaveform?.() !== 0) return undefined;
  if (type === 'MosfetElm' && (element.getFlags() & 1)) definition = definitions.PMosfetElm;
  if (type === 'TransistorElm') {
    const name = element.getInfo()[0]?.toLowerCase() ?? '';
    definition = /\(pnp\)$/.test(name) ? definitions.PTransistorElm : /\(npn\)$/.test(name) ? definitions.NTransistorElm : undefined;
  }
  // Four-terminal MOSFETs and other variants keep their upstream rendering.
  return definition?.pins.length === element.getPostCount() ? definition : undefined;
}

const at = (matrix, point) => ({
  x: matrix[0] * point.x + matrix[2] * point.y + matrix[4],
  y: matrix[1] * point.x + matrix[3] * point.y + matrix[5],
});

function align(sourceA, sourceB, targetA, targetB, scale, reflection = 1) {
  const angle = Math.atan2(targetB.y - targetA.y, targetB.x - targetA.x) - Math.atan2((sourceB.y - sourceA.y) * reflection, sourceB.x - sourceA.x);
  const cosine = Math.cos(angle) * scale, sine = Math.sin(angle) * scale;
  return [cosine, sine, -sine * reflection, cosine * reflection, targetA.x - cosine * sourceA.x + sine * sourceA.y * reflection, targetA.y - sine * sourceA.x - cosine * sourceA.y * reflection];
}

/** Fit the official symbol without distorting it, then extend its existing pins. */
export function symbolPlacement(symbol, definition, element) {
  const pins = definition.pins.map((number) => {
    const pin = symbol.pins.find((pin) => pin.number === number);
    // Shorten only the display leads: the native terminals remain the anchors.
    return pin && definition.bodyAnchors ? { ...pin, x: pin.bodyX, y: pin.bodyY } : pin;
  });
  if (pins.some((pin) => !pin)) return null;
  const posts = pins.map((_, index) => ({ x: element.getPostX(index), y: element.getPostY(index) }));
  if (posts.some((point) => !Number.isFinite(point.x) || !Number.isFinite(point.y))) return null;
  let matrix;
  if (pins.length === 1) {
    const tip = { x: element.getEndpointX(1), y: element.getEndpointY(1) };
    if (Math.hypot(tip.x - posts[0].x, tip.y - posts[0].y) < 1) return null;
    matrix = align(pins[0], { x: pins[0].x, y: pins[0].y + 1 }, tip,
      { x: tip.x + tip.x - posts[0].x, y: tip.y + tip.y - posts[0].y }, 5 / symbol.unitsPerMm);
  } else if (pins.length === 2) {
    const sourceLength = Math.hypot(pins[1].x - pins[0].x, pins[1].y - pins[0].y);
    const targetLength = Math.hypot(posts[1].x - posts[0].x, posts[1].y - posts[0].y);
    if (sourceLength < 1e-6 || targetLength < 2) return null;
    matrix = align(pins[0], pins[1], posts[0], posts[1], Math.min((definition.scale ?? 4) / symbol.unitsPerMm, targetLength / sourceLength));
    const end = at(matrix, pins[1]);
    matrix[4] += (posts[1].x - end.x) / 2;
    matrix[5] += (posts[1].y - end.y) / 2;
  } else {
    const [a, b] = definition.anchors;
    const sourceLength = Math.hypot(pins[b].x - pins[a].x, pins[b].y - pins[a].y);
    const targetLength = Math.hypot(posts[b].x - posts[a].x, posts[b].y - posts[a].y);
    if (sourceLength < 1e-6 || targetLength < 2) return null;
    const other = [0, 1, 2].find((index) => index !== a && index !== b);
    const cross = (p, q, r) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
    // Native flip/rotation can reverse handedness. Preserve terminal identity
    // by reflecting the drawing, instead of putting an op-amp output backwards.
    const sourceCross = cross(pins[a], pins[b], pins[other]), targetCross = cross(posts[a], posts[b], posts[other]);
    const reflection = sourceCross * targetCross < 0 ? -1 : 1;
    let scale = targetLength / sourceLength;
    if (definition.center || definition.bodyAnchors) {
      const sourceDepth = Math.abs(sourceCross) / sourceLength, targetDepth = Math.abs(targetCross) / targetLength;
      if (sourceDepth < 1e-6 || targetDepth < 2) return null;
      scale = Math.min(scale, targetDepth / sourceDepth);
    }
    matrix = align(pins[a], pins[b], posts[a], posts[b], scale, reflection);
    if (definition.center || definition.bodyAnchors) {
      const center = at(matrix, { x: (pins[a].x + pins[b].x) / 2, y: (pins[a].y + pins[b].y) / 2 });
      matrix[4] += (posts[a].x + posts[b].x) / 2 - center.x;
      matrix[5] += (posts[a].y + posts[b].y) / 2 - center.y;
      if (definition.center) {
        const actual = posts[2], drawn = at(matrix, pins[2]);
        matrix[4] += (actual.x - drawn.x) / 2;
        matrix[5] += (actual.y - drawn.y) / 2;
      }
    }
  }
  return { matrix, pins: pins.map((pin) => at(matrix, pin)), posts };
}

/** Display adaptations of audited KiCad exports; never circuit data or new glyphs. */
export function presentationSvg(source, symbol, color = '#d2d8df') {
  // Only pinned, local KiCad output is accepted. No uploaded SVG is interpreted.
  if (/<script\b|<foreignObject\b|(?:href|src)\s*=|<!ENTITY/i.test(source)) throw new Error('Unexpected content in pinned KiCad SVG.');
  if (/^Device:Q_(?:[NP]MOS|NPN|PNP)$/.test(symbol.sourceId)) {
    // Omit the optional enclosure only. Keep junction dots and polarity arrows.
    let enclosures = 0;
    source = source.replace(/<circle\b[^>]*\br="([^"]+)"[^>]*\/>/g, (circle, radius) => {
      if (Number(radius) / symbol.unitsPerMm < 2) return circle;
      enclosures++;
      return '';
    });
    if (enclosures !== 1) throw new Error(`Unexpected KiCad transistor enclosure: ${symbol.sourceId}`);
  }
  if (/^Device:Q_[NP]MOS$/.test(symbol.sourceId)) {
    // Remove exactly the three exported external pin leads, then extend from
    // their body endpoints to the real CircuitJS posts in draw(). This gives
    // the transistor a readable body without expanding its terminal spacing.
    const removed = new Set();
    source = source.replace(/<path\b[^>]*\bd="([^"<>]+)"[^>]*\/>/g, (path, d) => {
      const match = /^M\s*([-\d.]+)[\s,]+([-\d.]+)\s*L\s*([-\d.]+)[\s,]+([-\d.]+)\s*$/.exec(d);
      if (!match) return path;
      const [, x1, y1, x2, y2] = match.map(Number);
      const same = (x, y, px, py) => Math.hypot(x - px, y - py) < 0.0002 * symbol.unitsPerMm;
      const pin = symbol.pins.find((pin) => same(x1, y1, pin.bodyX, pin.bodyY) && same(x2, y2, pin.x, pin.y));
      if (!pin) return path;
      removed.add(pin.number);
      return '';
    });
    if (removed.size !== 3) throw new Error(`Unexpected KiCad MOS lead geometry: ${symbol.sourceId}`);
  }
  return source.replace(/rgb\(\s*0\s*,\s*0\s*,\s*0\s*\)/gi, color)
    .replace(/#000000\b/gi, color)
    .replace(/rgb\(\s*255\s*,\s*255\s*,\s*255\s*\)/gi, '#17191d')
    .replace(/#ffffff\b/gi, '#17191d')
    // Keep the heavier capacitor plates and transistor gates; lift hairlines
    // just enough to agree with the editor's neutral wire weight.
    .replace(/stroke-width:([\d.]+)/g, (_, width) => `stroke-width:${Math.max(Number(width), (symbol.sourceId === 'power:GNDREF' ? 0.32 : 0.23) * symbol.unitsPerMm).toFixed(4)}`);
}

async function loadImage(svg) {
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  try {
    const image = new Image(); image.src = url;
    await image.decode();
    return image;
  } finally { URL.revokeObjectURL(url); }
}

export async function createKiCadRenderer() {
  const response = await fetch('/kicad/symbols.json');
  if (!response.ok) throw new Error('The official KiCad symbol library is unavailable.');
  const manifest = await response.json();
  if (manifest.schemaVersion !== 1 || manifest.generator !== 'official kicad-cli sym export svg') throw new Error('Unexpected KiCad symbol manifest.');
  const assets = new Map();
  await Promise.all([...new Set(Object.values(definitions).map((definition) => definition.source))].map(async (id) => {
    const symbol = manifest.symbols[id];
    if (!symbol || !symbol.svg.startsWith('/kicad/svg/')) throw new Error(`Missing official KiCad symbol: ${id}`);
    const svgResponse = await fetch(symbol.svg);
    if (!svgResponse.ok) throw new Error(`Unable to load KiCad symbol: ${id}`);
    const svg = await svgResponse.text();
    const [normal, selected] = await Promise.all([loadImage(presentationSvg(svg, symbol)), loadImage(presentationSvg(svg, symbol, '#e4b568'))]);
    assets.set(id, { symbol, normal, selected });
  }));
  const select = (element) => {
    const definition = symbolDefinition(element);
    const asset = definition && assets.get(definition.source);
    const placement = asset && symbolPlacement(asset.symbol, definition, element);
    return placement ? { asset, placement } : null;
  };
  return {
    ready: true,
    source: 'KiCad official symbol library',
    canDraw(element) {
      try { return Boolean(select(element)); }
      catch { return false; }
    },
    draw(context, element, selected) {
      let entry;
      try { entry = select(element); }
      catch { return false; }
      if (!entry) return false;
      const { asset, placement } = entry;
      context.save();
      try {
        context.strokeStyle = selected ? '#e4b568' : '#d2d8df';
        context.lineWidth = 1.5;
        context.lineCap = 'round';
        context.beginPath();
        placement.posts.forEach((post, index) => {
          const pin = placement.pins[index];
          context.moveTo(post.x, post.y);
          // Pin extensions are drawing only. They terminate at the exact native
          // terminals and never create a node or change a wire's connectivity.
          if (Math.abs(post.x - pin.x) > 0.1 && Math.abs(post.y - pin.y) > 0.1) context.lineTo(pin.x, post.y);
          context.lineTo(pin.x, pin.y);
        });
        context.stroke();
        context.transform(...placement.matrix);
        context.drawImage(selected ? asset.selected : asset.normal, ...asset.symbol.viewBox);
      } catch { return false; }
      finally { context.restore(); }
      return true;
    },
  };
}

if (typeof window !== 'undefined') {
  createKiCadRenderer().then((renderer) => { window.AnaCodeKiCad = renderer; }).catch((error) => {
    // Keep the complete upstream editor usable if a display asset fails to load.
    window.AnaCodeKiCadError = error.message;
    console.error('KiCad symbol presentation could not load:', error.message);
  });
}

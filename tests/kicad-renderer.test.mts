import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { symbolDefinition, symbolPlacement, presentationSvg } from "../public/kicad/renderer.js";

type Point = { x: number; y: number };
type Pin = Point & { number: string; name: string; bodyX: number; bodyY: number };
type SymbolAsset = { sourceId: string; svg: string; pins: Pin[]; unitsPerMm: number };
const manifest = JSON.parse(readFileSync(new URL("../public/kicad/symbols.json", import.meta.url), "utf8")) as {
  libraryRevision: string;
  symbols: Record<string, SymbolAsset>;
};
assert.equal(manifest.libraryRevision, "ad36cd14bcd1b1cd0484f629ccdd3481366f74f3");

// Fixtures follow CircuitJS revision 5bdb1296ce6a82f79515f4f1dd1b9a86e03236f7:
// OpAmpElm.setPoints/getPost: post 0 is minus, 1 plus, 2 output; FLAG_SWAP=1.
// MosfetElm.setPoints/getPost: N has G,S,D; P has G,D,S; FLAG_PNP=1, FLAG_FLIP=8.
// TransistorElm.setPoints/getPost/getInfo: B,C,E, with "transistor (NPN/PNP)".
// These are native terminal positions, independent of the display adapter.
function element(type: string, coordinates: readonly (readonly [number, number])[], options: {
  flags?: number; description?: string; waveform?: number;
} = {}) {
  const posts = coordinates.map(([x, y]) => Object.freeze({ x, y }));
  return {
    getType: () => type,
    getPostCount: () => posts.length,
    getPostX: (index: number) => posts[index].x,
    getPostY: (index: number) => posts[index].y,
    getFlags: () => options.flags ?? 0,
    getInfo: () => [options.description ?? type],
    getWaveform: () => options.waveform ?? 0,
  };
}

function placement(native: ReturnType<typeof element>) {
  const definition = symbolDefinition(native);
  assert(definition, `${native.getType()} should have an official symbol`);
  const symbol = manifest.symbols[definition.source];
  assert(symbol, `${definition.source} must exist in the pinned KiCad export`);
  const result = symbolPlacement(symbol, definition, native);
  assert(result, "native terminals must admit a usable symbol placement");
  assert(result.matrix.every(Number.isFinite), "display transform must remain finite");
  return { definition, symbol, result };
}

const tolerance = 1e-6;
function close(actual: number, expected: number, message: string) {
  assert(Math.abs(actual - expected) < tolerance, `${message}: expected ${expected}, received ${actual}`);
}
function transform(matrix: number[], point: Point): Point {
  return { x: matrix[0] * point.x + matrix[2] * point.y + matrix[4], y: matrix[1] * point.x + matrix[3] * point.y + matrix[5] };
}
function rotation(quarterTurns: number) {
  const [cosine, sine] = [[1, 0], [0, 1], [-1, 0], [0, -1]][quarterTurns];
  return {
    toWorld: ([x, y]: readonly [number, number]): readonly [number, number] => [200 + cosine * x - sine * y, 200 + sine * x + cosine * y],
    toLocal: (point: Point): Point => ({ x: cosine * (point.x - 200) + sine * (point.y - 200), y: -sine * (point.x - 200) + cosine * (point.y - 200) }),
  };
}

for (const swapped of [false, true]) {
  test(`op-amp ${swapped ? "swapped" : "normal"} inputs retain their signs and output side through rotation`, () => {
    for (let quarterTurns = 0; quarterTurns < 4; quarterTurns++) {
      const { toWorld, toLocal } = rotation(quarterTurns);
      const minusY = swapped ? 16 : -16;
      const native = element("OpAmpElm", ([[0, minusY], [0, -minusY], [96, 0]] as const).map(toWorld), { flags: swapped ? 1 : 0 });
      const { definition, symbol, result } = placement(native);
      assert.deepEqual(definition.pins.map((number: string) => symbol.pins.find((pin) => pin.number === number)?.name), ["-", "+", "~"]);
      const [minus, plus, output] = result.pins.map(toLocal);
      close(minus.y, minusY, "inverting input must meet its native terminal");
      close(plus.y, -minusY, "non-inverting input must meet its native terminal");
      close(output.x, 96, "output must face the native output");
      close(output.y, 0, "output must stay on the signal axis");
      assert(output.x > minus.x && output.x > plus.x, "triangle output must face away from the inputs");
    }
  });
}

for (const length of [32, 64]) {
  test(`compact ${length}px op-amp keeps every lead outside the symbol body`, () => {
    for (const swapped of [false, true]) {
      for (let quarterTurns = 0; quarterTurns < 4; quarterTurns++) {
        const { toWorld, toLocal } = rotation(quarterTurns);
        const minusY = swapped ? 16 : -16;
        const native = element("OpAmpElm", ([[0, minusY], [0, -minusY], [length, 0]] as const).map(toWorld), { flags: swapped ? 1 : 0 });
        const { definition, symbol, result } = placement(native);
        const pins = result.pins.map(toLocal);
        const bodies = definition.pins.map((number: string) => {
          const source = symbol.pins.find((pin) => pin.number === number)!;
          return toLocal(transform(result.matrix, { x: source.bodyX, y: source.bodyY }));
        });
        for (const index of [0, 1]) {
          assert(pins[index].x >= -tolerance, "input extension must not run backward beyond its native post");
          assert(bodies[index].x > pins[index].x, "input lead must enter the front of the triangle");
          assert(bodies[index].x < bodies[2].x, "input body must precede the output body");
          assert(Math.abs(pins[index].y) <= 16 + tolerance, "input artwork must fit within native terminal separation");
          assert(Math.sign(pins[index].y) === Math.sign(index === 0 ? minusY : -minusY), "shrinking must not swap + and -");
        }
        assert(pins[2].x <= length + tolerance, "output extension must not pass backward through the triangle");
        assert(pins[2].x > bodies[2].x, "output lead must exit the back of the triangle");
        close((pins[0].y + pins[1].y) / 2, 0, "inputs must remain centered on the signal axis");
        close(pins[2].y, 0, "compact output must remain on the signal axis");
      }
    }
  });
}

for (const pChannel of [false, true]) {
  for (const flipped of [false, true]) {
    test(`${pChannel ? "P" : "N"}-MOS ${flipped ? "flipped" : "normal"} retains G/S/D identity and gate side`, () => {
      for (let quarterTurns = 0; quarterTurns < 4; quarterTurns++) {
        const { toWorld, toLocal } = rotation(quarterTurns);
        const post1Y = flipped ? -16 : 16;
        const native = element("MosfetElm", ([[0, 0], [64, post1Y], [64, -post1Y]] as const).map(toWorld), { flags: (pChannel ? 1 : 0) | (flipped ? 8 : 0) });
        const { definition, result } = placement(native);
        assert.equal(definition.source, pChannel ? "Device:Q_PMOS" : "Device:Q_NMOS");
        assert.deepEqual(definition.pins, pChannel ? ["G", "D", "S"] : ["G", "S", "D"]);
        const [gate, post1, post2] = result.pins.map(toLocal);
        close(post1.x, 64, "first channel terminal x");
        close(post1.y, post1Y, "first channel terminal y");
        close(post2.x, 64, "second channel terminal x");
        close(post2.y, -post1Y, "second channel terminal y");
        close(gate.y, 0, "gate stays on its native axis");
        assert(gate.x >= 0 && gate.x < post1.x, "gate must stay on the input side, without crossing the channel");
      }
    });
  }
}

test("serialized BJT descriptions select the correct polarity and collector/emitter pins", () => {
  for (const pnp of [false, true]) {
    for (const flipped of [false, true]) {
      const collectorY = (pnp ? 16 : -16) * (flipped ? -1 : 1);
      const native = element("TransistorElm", [[0, 0], [64, collectorY], [64, -collectorY]], {
        // Upstream localizes the word before the parenthesized polarity.
        description: `${flipped ? "Transistor" : "transistor"} (${pnp ? "PNP" : "NPN"})`,
      });
      const { definition, result } = placement(native);
      assert.equal(definition.source, pnp ? "Device:Q_PNP" : "Device:Q_NPN");
      assert.deepEqual(definition.pins, ["B", "C", "E"]);
      close(result.pins[1].y, collectorY, "collector must keep its native post");
      close(result.pins[2].y, -collectorY, "emitter must keep its native post");
      assert(result.pins[0].x < result.pins[1].x, "base must not move across the collector/emitter channel");
    }
  }
});

test("DC voltage uses the positive native terminal and every other waveform keeps native artwork", () => {
  const posts = [[0, 0], [0, 96]] as const;
  const { definition, result } = placement(element("VoltageElm", posts, { waveform: 0 }));
  assert.equal(definition.source, "Simulation_SPICE:VDC");
  assert.deepEqual(definition.pins, ["2", "1"], "KiCad positive pin 1 must map to native positive post 1");
  assert(result.pins[1].y > result.pins[0].y);
  // VoltageElm.WF_AC/SQUARE/TRIANGLE/SAWTOOTH/PULSE/NOISE/VAR are 1..7.
  for (const type of ["VoltageElm", "DCVoltageElm"]) {
    for (let waveform = 1; waveform <= 7; waveform++) {
      assert.equal(symbolDefinition(element(type, posts, { waveform })), undefined, `${type} waveform ${waveform} must not display a DC mark`);
    }
  }
  const olderNativeApi = { ...element("VoltageElm", posts), getWaveform: undefined };
  assert.equal(symbolDefinition(olderNativeApi), undefined, "unknown source waveform must retain native rendering");
});

test("polarized capacitor, diode and current source retain native polarity", () => {
  for (const [type, expectedPins] of [
    ["PolarCapacitorElm", ["1", "2"]], // Native capacitor positive terminal is post 0.
    ["DiodeElm", ["2", "1"]], // Native diode post 0 is anode; KiCad pin 1 is cathode.
    ["CurrentElm", ["1", "2"]], // Native positive current and KiCad arrow run post 0 -> 1.
  ] as const) {
    const { definition, result } = placement(element(type, [[0, 0], [96, 0]]));
    assert.deepEqual(definition.pins, expectedPins);
    assert(result.pins[0].x < result.pins[1].x, "terminal identities must follow native source direction");
  }
});

test("unsupported and four-terminal devices retain complete native rendering", () => {
  assert.equal(symbolDefinition(element("CustomCompositeElm", [[0, 0], [64, 0]])), undefined);
  assert.equal(symbolDefinition(element("MosfetElm", [[0, 0], [64, 16], [64, -16], [80, 0]])), undefined);
  assert.equal(symbolDefinition(element("MosfetElm", [[0, 0], [64, 16], [64, -16], [80, 0]], { flags: 1 })), undefined);
  assert.equal(symbolDefinition(element("TransistorElm", [[0, 0], [64, 16], [64, -16]], { description: "unknown transistor variant" })), undefined);
});

test("open transistor presentation preserves all polarity artwork and junction dots", () => {
  for (const id of ['Device:Q_NMOS', 'Device:Q_PMOS', 'Device:Q_NPN', 'Device:Q_PNP']) {
    const symbol = manifest.symbols[id];
    const original = readFileSync(new URL(`../public${symbol.svg}`, import.meta.url), 'utf8');
    const snapshot = JSON.stringify(symbol);
    const preview = presentationSvg(original, symbol);
    const circles = (svg: string) => [...svg.matchAll(/<circle\b[^>]*\br="([^"]+)"/g)].map((match) => Number(match[1]));
    assert.deepEqual(circles(preview), circles(original).filter((radius) => radius / symbol.unitsPerMm < 2));
    const paths = (svg: string) => [...svg.matchAll(/<path\b[^>]*\bd="([^"]+)"/g)].map((match) => match[1]);
    const before = paths(original), after = paths(preview);
    assert.equal(before.length - after.length, id.endsWith('MOS') ? 3 : 0, 'only MOS external leads may be shortened');
    assert(after.every((path) => before.includes(path)), 'no replacement glyph geometry may be invented');
    assert.deepEqual(after.filter((path) => /Z/i.test(path)), before.filter((path) => /Z/i.test(path)), 'polarity arrows must remain unchanged');
    assert.equal(JSON.stringify(symbol), snapshot, 'display styling must not mutate electrical pin metadata');
  }
});

test("MOS presentation enlarges the channel safely within the native terminals", () => {
  for (const type of ['NMosfetElm', 'PMosfetElm']) {
    const native = element(type, [[0, 0], [64, 16], [64, -16]]);
    const { symbol, definition, result } = placement(native);
    for (const index of [1, 2]) {
      const pin = symbol.pins.find((pin) => pin.number === definition.pins[index])!;
      const body = transform(result.matrix, { x: pin.bodyX, y: pin.bodyY });
      close(body.x, native.getPostX(index), 'channel body x');
      close(body.y, native.getPostY(index), 'channel body y');
    }
    assert(Math.abs(result.matrix[0]) > 5, 'channel details must be readable at native scale');
  }
});

test("palette and circuit select KiCad zigzag resistor and reference-ground geometry", () => {
  assert.equal(symbolDefinition(element('ResistorElm', [[0, 0], [96, 0]]))?.source, 'Device:R_US');
  const native = { ...element('GroundElm', [[0, 0]]), getEndpointX: () => 0, getEndpointY: () => 32 };
  const { result, definition } = placement(native);
  assert.equal(definition.source, 'power:GNDREF');
  close(result.posts[0].x, 0, 'ground native x');
  close(result.posts[0].y, 0, 'ground native y');
  close(result.pins[0].y, 32, 'ground icon begins at native stem tip');
});

test("compact MOS artwork keeps its gate inside native bounds at every orientation", () => {
  for (const length of [16, 32, 64]) for (const flags of [0, 1, 8, 9]) for (let turn = 0; turn < 4; turn++) {
    const { toWorld, toLocal } = rotation(turn);
    const y = flags & 8 ? -16 : 16;
    const native = element('MosfetElm', ([[0, 0], [length, y], [length, -y]] as const).map(toWorld), { flags });
    const { result } = placement(native);
    const [gate, channel1, channel2] = result.pins.map(toLocal);
    assert(gate.x >= -tolerance && gate.x < length, 'gate artwork must never cross behind its native post');
    close(gate.y, 0, 'gate must remain on native wire axis');
    for (const channel of [channel1, channel2]) {
      close(channel.x, length, 'channel lead axis must match native posts');
      assert(Math.abs(channel.y) <= 16 + tolerance, 'channel artwork must stay between the native posts');
    }
    assert(Math.sign(channel1.y) === Math.sign(y), 'shrinking must preserve source/drain orientation');
  }
});

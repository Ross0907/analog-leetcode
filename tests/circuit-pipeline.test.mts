import assert from "node:assert/strict";
import test from "node:test";
import { parse } from "@spice-ts/core";
import { Simulation } from "eecircuit-engine";
import {
  analysisForChallenge,
  compileEditorCircuitDocument,
  createStarterSchematic,
} from "../app/components/textbook-schematic-editor";
import { circuitPresets } from "../lib/circuit-presets";
import { compileCircuitDocument, validateCircuitDocument } from "../lib/circuit-document";
import { generateSpiceDeckFromCircuitDocument } from "../lib/circuit-spice";
import { splitWireRoute } from "../lib/schematic-wire-geometry";
import {
  SIMULATOR_RUN_TIMEOUT_MS,
  SIMULATOR_WORKER_INITIALIZATION_TIMEOUT_MS,
  SIMULATOR_WORKER_PROTOCOL_VERSION,
  type SimulatorWorkerReady,
  type SimulatorWorkerRequest,
} from "../lib/simulator-contract";

const TRUSTED_CMOS90_INCLUDE = ".include modelcard.CMOS90";
let startedSimulator: Promise<Simulation> | undefined;

function getStartedSimulator() {
  startedSimulator ??= (async () => {
    const simulator = new Simulation();
    await simulator.start();
    return simulator;
  })();
  return startedSimulator;
}

function parseGeneratedDeck(deck: string, slug: string) {
  const lines = deck.split(/\r?\n/);
  const trustedIncludeCount = lines.filter((line) => line === TRUSTED_CMOS90_INCLUDE).length;
  assert.ok(trustedIncludeCount <= 1, `${slug}: duplicate trusted CMOS90 includes`);

  const structurallyParseableDeck = lines
    .filter((line) => line !== TRUSTED_CMOS90_INCLUDE)
    .join("\n");
  const parsed = parse(structurallyParseableDeck);
  assert.ok(parsed.toIR().components.length >= 1, `${slug}: structural parser found no components`);
  assert.equal(parsed.analyses.length, 1, `${slug}: generated deck must contain exactly one analysis`);
}

async function runGeneratedDeck(deck: string, slug: string) {
  const simulator = await getStartedSimulator();
  simulator.setNetList(deck);
  const result = await simulator.runSim();
  assert.ok(result.numPoints >= 1, `${slug}: ngspice returned no points`);
  assert.ok(result.numPoints <= 5_000, `${slug}: ngspice result exceeded browser limit`);
  assert.ok(result.data.length >= 1, `${slug}: ngspice returned no variables`);
}

test("every launch schematic validates, compiles, and runs in ngspice WASM", { timeout: 30_000 }, async () => {
  for (const [slug, document] of Object.entries(circuitPresets)) {
    const validation = validateCircuitDocument(document, "simulation");
    assert.equal(validation.ok, true, `${slug}: ${validation.diagnostics.map((item) => item.message).join("; ")}`);

    const generated = generateSpiceDeckFromCircuitDocument(document, { target: "browser-preview" });
    assert.match(generated.deck, /^\* AnaCode generated circuit/m);
    assert.doesNotMatch(generated.deck, /\.(?:control|shell|exec|hdl|verilog)\b/i);
    assert.ok(Object.keys(generated.probeExpressions).length >= 1, `${slug}: missing probes`);
    parseGeneratedDeck(generated.deck, slug);
    await runGeneratedDeck(generated.deck, slug);
  }
});

test("all nine visual-editor challenge presets compile and run in ngspice WASM", { timeout: 30_000 }, async () => {
  const slugs = Object.keys(circuitPresets);
  assert.equal(slugs.length, 9, "the challenge suite must contain exactly nine launch presets");

  for (const slug of slugs) {
    const editorDocument = createStarterSchematic(slug);
    const analysis = analysisForChallenge(slug);
    const electricalDocument = compileEditorCircuitDocument(editorDocument, analysis);
    const validation = validateCircuitDocument(electricalDocument, "simulation");
    assert.equal(validation.ok, true, `${slug}: ${validation.diagnostics.map((item) => item.message).join("; ")}`);

    const generated = generateSpiceDeckFromCircuitDocument(electricalDocument, { target: "browser-preview" });
    assert.doesNotMatch(generated.deck, /\.(?:control|shell|exec|hdl|verilog)\b/i);
    assert.ok(Object.keys(generated.probeExpressions).length >= 1, `${slug}: missing probes`);
    parseGeneratedDeck(generated.deck, `visual ${slug}`);
    await runGeneratedDeck(generated.deck, `visual ${slug}`);
  }
});

test("local grounds and VCC power ports compile to one clean global reference and rail", () => {
  const editorDocument = createStarterSchematic("bjt-bias-across-beta");
  assert.ok(editorDocument.parts.filter((part) => part.kind === "ground").length >= 3);
  assert.equal(editorDocument.parts.filter((part) => part.kind === "power" && part.label === "VCC").length, 2);

  const electricalDocument = compileEditorCircuitDocument(editorDocument, analysisForChallenge("bjt-bias-across-beta"));
  assert.deepEqual(electricalDocument.components.filter((component) => component.kind === "ground").map((component) => component.reference), ["GND1"]);

  const circuit = compileCircuitDocument(electricalDocument, "simulation");
  const ground = circuit.components.find((component) => component.reference === "GND1" && component.kind === "ground");
  const source = circuit.components.find((component) => component.reference === "VCC" && component.kind === "voltage-source");
  const r1 = circuit.components.find((component) => component.reference === "R1" && component.kind === "resistor");
  const rc = circuit.components.find((component) => component.reference === "RC" && component.kind === "resistor");
  assert.ok(ground && source && r1 && rc);
  assert.equal(source.nodes.negative, ground.nodes.gnd);
  assert.ok([r1.nodes.a, r1.nodes.b].includes(source.nodes.positive));
  assert.ok([rc.nodes.a, rc.nodes.b].includes(source.nodes.positive));
});

test("a voltage probe connects directly to a global power port", () => {
  const document = createStarterSchematic("bjt-bias-across-beta");
  const port = document.parts.find((part) => part.kind === "power")!;
  const probe = document.parts.find((part) => part.kind === "probe")!;
  document.wires = document.wires.filter((wire) => ![wire.from, wire.to].some((endpoint) => endpoint.type === "pin" && endpoint.partId === probe.id));
  document.wires.push({ id: "WPOWERPROBE", from: { type: "pin", partId: port.id, pin: 0 }, to: { type: "pin", partId: probe.id, pin: 0 }, waypoints: [] });
  const circuit = compileCircuitDocument(compileEditorCircuitDocument(document, analysisForChallenge("bjt-bias-across-beta")), "simulation");
  const source = circuit.components.find((component) => component.reference === "VCC" && component.kind === "voltage-source");
  const measured = circuit.probes.find((item) => item.quantity === "voltage");
  assert.ok(source && measured && measured.quantity === "voltage");
  assert.equal(measured.node, source.nodes.positive);
});

test("branching a stretched wire preserves its bends and exact off-grid pin axis", () => {
  const points = [{ x: 234, y: 145 }, { x: 234, y: 100 }, { x: 500, y: 100 }, { x: 500, y: 300 }, { x: 700, y: 300 }];
  const split = splitWireRoute(points, { x: 501, y: 184 });
  assert.ok(split);
  assert.deepEqual(split.point, { x: 500, y: 180 });
  assert.deepEqual(split.beforeWaypoints, [{ x: 234, y: 100 }, { x: 500, y: 100 }]);
  assert.deepEqual(split.afterWaypoints, [{ x: 500, y: 300 }]);
  assert.deepEqual(points[0], { x: 234, y: 145 }, "input must not be mutated");
  assert.deepEqual(splitWireRoute(points, { x: 235, y: 124 })?.point, { x: 234, y: 120 });
  assert.equal(splitWireRoute(points, { x: 700, y: 300 })?.atEnd, true);
  assert.equal(splitWireRoute([{ x: 0, y: 0 }, { x: 10, y: 10 }], { x: 5, y: 5 }), null);
});

test("the typed circuit schema rejects arbitrary simulator text", () => {
  const source = structuredClone(circuitPresets["precision-voltage-divider"]) as unknown as Record<string, unknown>;
  source.solverDirective = ".control\nshell calc.exe\n.endc";
  const validation = validateCircuitDocument(source, "simulation");
  assert.equal(validation.ok, false);
  assert.ok(validation.diagnostics.some((item) => item.code === "invalid-document-shape"));
});

test("drawn op-amp polarity matches the compiled non-inverting and inverting pins", () => {
  const expectedConnections = {
    "inverting-gain-stage": {
      nonInverting: ["c-gnd1", "c-v1"],
      inverting: ["c-rf", "c-rin"],
    },
    "sallen-key-q": {
      nonInverting: ["c-c2", "c-r2"],
      inverting: ["c-c1", "c-u1"],
    },
    "transimpedance-stability": {
      nonInverting: ["c-cd", "c-gnd1", "c-iin"],
      inverting: ["c-cd", "c-cf", "c-iin", "c-rf"],
    },
  } as const;

  for (const [slug, expected] of Object.entries(expectedConnections)) {
    const document = compileEditorCircuitDocument(createStarterSchematic(slug), analysisForChallenge(slug));
    const circuit = compileCircuitDocument(document, "simulation");
    const opamp = circuit.components.find((component) => component.id === "c-u1" && component.kind === "op-amp-ideal");
    assert.ok(opamp, `${slug}: compiled op-amp is missing`);
    const connectedComponentIds = (pinId: "nonInverting" | "inverting") => {
      const targetNode = opamp.nodes[pinId];
      return [...new Set(circuit.components.flatMap((component) => {
        const sharesAnotherPin = Object.entries(component.nodes).some(([candidatePin, node]) => (
          node === targetNode && !(component.id === opamp.id && candidatePin === pinId)
        ));
        return sharesAnotherPin ? [component.id] : [];
      }))].sort();
    };
    assert.deepEqual(connectedComponentIds("nonInverting"), [...expected.nonInverting].sort(), `${slug}: top + input`);
    assert.deepEqual(connectedComponentIds("inverting"), [...expected.inverting].sort(), `${slug}: bottom - input`);
  }
});

test("the simulator worker protocol separates cold initialization from a strict run budget", () => {
  const ready: SimulatorWorkerReady = { type: "ready", protocolVersion: SIMULATOR_WORKER_PROTOCOL_VERSION };
  const request: SimulatorWorkerRequest = { type: "run", id: "test-run", netlist: "R1 in 0 1k\n.op\n.end" };
  assert.deepEqual(ready, { type: "ready", protocolVersion: 1 });
  assert.equal(request.type, "run");
  assert.ok(SIMULATOR_WORKER_INITIALIZATION_TIMEOUT_MS >= 30_000);
  assert.ok(SIMULATOR_RUN_TIMEOUT_MS <= 4_000);
  assert.ok(SIMULATOR_WORKER_INITIALIZATION_TIMEOUT_MS > SIMULATOR_RUN_TIMEOUT_MS);
});

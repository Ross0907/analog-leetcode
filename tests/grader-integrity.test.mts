import assert from "node:assert/strict";
import test from "node:test";
import { createCircuitPreset } from "../lib/circuit-presets";
import type { CircuitDocument, ConnectionPoint } from "../lib/circuit-document";
import { gradeRequestSchema, gradeSolution, type GradeRequest } from "../lib/grader.server";
import {
  analysisForChallenge,
  compileEditorCircuitDocument,
  createStarterSchematic,
} from "../app/components/textbook-schematic-editor";

const judgedSlugs = [
  "precision-voltage-divider",
  "rc-cutoff-1khz",
  "inverting-gain-stage",
] as const;

function request(problemSlug: typeof judgedSlugs[number], circuitDocument: CircuitDocument): GradeRequest {
  return gradeRequestSchema.parse({
    problemSlug,
    problemVersion: 1,
    idempotencyKey: crypto.randomUUID(),
    circuitDocument,
  });
}

const pin = (componentId: string, pinId: string): ConnectionPoint => ({ type: "pin", componentId, pinId });

test("all three visual fixed-topology starter diagrams pass server verification", () => {
  for (const problemSlug of judgedSlugs) {
    const circuitDocument = compileEditorCircuitDocument(
      createStarterSchematic(problemSlug),
      analysisForChallenge(problemSlug),
    );
    const result = gradeSolution(request(problemSlug, circuitDocument));
    assert.equal(result.passed, true, `${problemSlug}: ${result.diagnostics[0]?.value}`);
    assert.match(result.summary, /Fixed-topology design check passed/i);
    assert.match(result.graderVersion, /fixed-topology-v2\.0\.0$/);
  }
});

test("a disconnected divider schematic is rejected before value grading", () => {
  const source = createCircuitPreset("precision-voltage-divider");
  const disconnected: CircuitDocument = {
    ...source,
    wires: source.wires.filter((wire) => wire.id !== "w2"),
  };
  const result = gradeSolution(request("precision-voltage-divider", disconnected));
  assert.equal(result.passed, false);
  assert.equal(result.score, 0);
  assert.match(result.summary, /rejected the schematic/i);
  assert.match(result.diagnostics[0]?.value ?? "", /not connected/i);
});

test("a connected but wrong RC topology is rejected", () => {
  const source = createCircuitPreset("rc-cutoff-1khz");
  const wrongTopology: CircuitDocument = {
    ...source,
    wires: [
      ...source.wires.filter((wire) => wire.id !== "w2"),
      { id: "w5", from: pin("r1", "b"), to: pin("gnd", "gnd"), waypoints: [] },
      { id: "w6", from: pin("v1", "positive"), to: pin("c1", "a"), waypoints: [] },
    ],
  };
  const result = gradeSolution(request("rc-cutoff-1khz", wrongTopology));
  assert.equal(result.passed, false);
  assert.equal(result.score, 0);
  assert.match(result.diagnostics[0]?.value ?? "", /fixed V1/i);
});

test("tampering with fixed stimulus or adding a component is rejected", () => {
  const source = createCircuitPreset("precision-voltage-divider");
  const tamperedSource: CircuitDocument = {
    ...source,
    components: source.components.map((component) => component.reference === "V1" && component.kind === "voltage-source"
      ? { ...component, parameters: { ...component.parameters, dcV: 12 } }
      : component),
  };
  assert.equal(gradeSolution(request("precision-voltage-divider", tamperedSource)).passed, false);

  const extraComponent: CircuitDocument = {
    ...source,
    components: [
      ...source.components,
      {
        id: "r3",
        reference: "R3",
        position: { x: 200, y: 200 },
        rotation: 0,
        kind: "resistor",
        parameters: { resistanceOhm: 10_000 },
      },
    ],
    wires: [
      ...source.wires,
      { id: "w5", from: pin("r3", "a"), to: pin("v1", "positive"), waypoints: [] },
      { id: "w6", from: pin("r3", "b"), to: pin("gnd", "gnd"), waypoints: [] },
    ],
  };
  const extraResult = gradeSolution(request("precision-voltage-divider", extraComponent));
  assert.equal(extraResult.passed, false);
  assert.match(extraResult.diagnostics[0]?.value ?? "", /exactly 4 electrical components/i);
});

test("correct numbers in raw solver text cannot influence acceptance", () => {
  const source = createCircuitPreset("precision-voltage-divider");
  const wrongValues: CircuitDocument = {
    ...source,
    components: source.components.map((component) => {
      if (component.reference === "R1" && component.kind === "resistor") {
        return { ...component, parameters: { ...component.parameters, resistanceOhm: 1_000 } };
      }
      if (component.reference === "R2" && component.kind === "resistor") {
        return { ...component, parameters: { ...component.parameters, resistanceOhm: 2_000 } };
      }
      return component;
    }),
  };

  const result = gradeSolution(request("precision-voltage-divider", wrongValues));
  assert.equal(result.passed, false);

  const withRawDeck = gradeRequestSchema.safeParse({
    problemSlug: "precision-voltage-divider",
    problemVersion: 1,
    idempotencyKey: crypto.randomUUID(),
    circuitDocument: wrongValues,
    netlist: "V1 vin 0 5\nR1 vin out 10k\nR2 out 0 10k\n.op\n.end",
  });
  assert.equal(withRawDeck.success, false, "the strict request must reject raw solver text");

  const legacyClientValues = gradeRequestSchema.safeParse({
    problemSlug: "precision-voltage-divider",
    problemVersion: 1,
    idempotencyKey: crypto.randomUUID(),
    solution: { r1: 10_000, r2: 10_000 },
  });
  assert.equal(legacyClientValues.success, false, "client-extracted values are no longer a grading input");
});

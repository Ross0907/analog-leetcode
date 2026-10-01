import assert from "node:assert/strict";
import test from "node:test";
import { createCircuitPreset } from "../lib/circuit-presets";
import { gradeRequestSchema, gradeSolution } from "../lib/grader.server";
import type { CircuitDocument, ConnectionPoint } from "../lib/circuit-document";

const pin = (componentId: string, pinId: string): ConnectionPoint => ({ type: "pin", componentId, pinId });
const cases = [
  ["wire-adc-reference", "precision-voltage-divider"],
  ["wire-antialias-filter", "rc-cutoff-1khz"],
] as const;
function grade(slug: string, circuitDocument: CircuitDocument) {
  return gradeSolution(gradeRequestSchema.parse({ problemSlug: slug, problemVersion: 1, idempotencyKey: crypto.randomUUID(), circuitDocument }));
}

test("parts-only tasks reject disconnected parts and accept actual correct wiring with multiple local grounds", () => {
  for (const [slug, blueprint] of cases) {
    const original = createCircuitPreset(blueprint);
    const disconnected = grade(slug, { ...original, wires: [] });
    assert.equal(disconnected.passed, false);
    assert.match(disconnected.diagnostics[0].value, /not connected/i);
    const localGrounds: CircuitDocument = {
      ...original,
      components: [...original.components, { id: "local-ground", reference: "GND2", kind: "ground", parameters: {}, position: { x: 340, y: 220 }, rotation: 0 }],
      wires: original.wires.map((wire) => wire.id === "w3" ? { ...wire, to: pin("local-ground", "gnd") } : wire),
    };
    assert.equal(grade(slug, localGrounds).passed, true, `${slug} must join local ground symbols electrically`);
    const shorted = { ...localGrounds, wires: [...localGrounds.wires, { id: "bad-ground", from: pin("r1", "b"), to: pin("local-ground", "gnd"), waypoints: [] }] };
    assert.equal(grade(slug, shorted).passed, false, "a ground placed on the output must still short the circuit");
  }
});

test("the divider judge follows connectivity when upper and lower resistor references are exchanged", () => {
  const document = createCircuitPreset("precision-voltage-divider");
  const exchanged: CircuitDocument = { ...document, components: document.components.map((component) => component.reference === "R1" ? { ...component, reference: "R2" } : component.reference === "R2" ? { ...component, reference: "R1" } : component) };
  assert.equal(grade("wire-adc-reference", exchanged).passed, true);
});

test("final checks require a voltage probe at the real output and reject a misplaced vout label", () => {
  for (const [slug, blueprint] of cases) {
    const document = createCircuitPreset(blueprint);
    assert.equal(grade(slug, { ...document, probes: [] }).passed, false);
    const wrongProbe: CircuitDocument = { ...document, probes: document.probes.map((probe) => probe.quantity === "voltage" ? { ...probe, target: pin("v1", "positive") } : probe) };
    const result = grade(slug, wrongProbe);
    assert.equal(result.passed, false);
    assert.match(result.diagnostics[0].value, /actual output junction/i);
    const wrongLabel: CircuitDocument = { ...document, netLabels: document.netLabels.filter((label) => label.name !== "vin").map((label) => ({ ...label, target: pin("v1", "positive") })) };
    assert.equal(grade(slug, wrongLabel).passed, false);
  }
});

test("wiring exercises cannot pass with a high-pass topology, altered stimulus, or a client reference deck", () => {
  const rc = createCircuitPreset("rc-cutoff-1khz");
  const wrong: CircuitDocument = { ...rc, wires: [
    { id: "w1", from: pin("v1", "positive"), to: pin("c1", "a"), waypoints: [] },
    { id: "w2", from: pin("c1", "b"), to: pin("r1", "a"), waypoints: [] },
    { id: "w3", from: pin("r1", "b"), to: pin("gnd", "gnd"), waypoints: [] },
    { id: "w4", from: pin("v1", "negative"), to: pin("gnd", "gnd"), waypoints: [] },
  ] };
  assert.equal(grade("wire-antialias-filter", wrong).passed, false);
  const divider = createCircuitPreset("precision-voltage-divider");
  const tampered: CircuitDocument = { ...divider, components: divider.components.map((component) => component.kind === "voltage-source" ? { ...component, parameters: { dcV: 2.5 } } : component) };
  assert.equal(grade("wire-adc-reference", tampered).passed, false);
  assert.equal(gradeRequestSchema.safeParse({ problemSlug: "wire-adc-reference", problemVersion: 1, idempotencyKey: crypto.randomUUID(), circuitDocument: { ...divider, wires: [] }, netlist: "V1 vin 0 5\nR1 vin vout 10k\nR2 vout 0 10k\n.op\n.end" }).success, false);
});

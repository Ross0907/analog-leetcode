import { z } from "zod";
import {
  CircuitDocumentError,
  circuitDocumentSchema,
  compileCircuitDocument,
  type CircuitIR,
  type CircuitIRComponent,
} from "./circuit-document";

const requestEnvelope = {
  problemVersion: z.literal(1),
  idempotencyKey: z.uuid(),
  circuitDocument: circuitDocumentSchema,
};

export const gradeRequestSchema = z.discriminatedUnion("problemSlug", [
  z.object({
    ...requestEnvelope,
    problemSlug: z.literal("precision-voltage-divider"),
  }).strict(),
  z.object({
    ...requestEnvelope,
    problemSlug: z.literal("rc-cutoff-1khz"),
  }).strict(),
  z.object({
    ...requestEnvelope,
    problemSlug: z.literal("inverting-gain-stage"),
  }).strict(),
]);

export type GradeRequest = z.infer<typeof gradeRequestSchema>;

export const gradeResultSchema = z.object({
  passed: z.boolean(),
  score: z.number().int().min(0).max(100),
  summary: z.string().min(1).max(500),
  diagnostics: z.array(z.object({
    label: z.string().min(1).max(120),
    value: z.string().min(1).max(500),
    passed: z.boolean(),
  }).strict()).max(32),
  graderVersion: z.string().min(1).max(120),
}).strict();

export type GradeResult = z.infer<typeof gradeResultSchema>;

type TrustedSolution =
  | { kind: "voltage-divider"; r1: number; r2: number }
  | { kind: "rc-low-pass"; r1: number; c1: number }
  | { kind: "inverting-amplifier"; rin: number; rf: number };

type Verification =
  | { ok: true; solution: TrustedSolution }
  | { ok: false; reason: string };

const percent = (value: number) => `${value.toFixed(2)}%`;

/**
 * Grades values extracted exclusively from the validated electrical schematic.
 * Solver decks and other client-authored text are deliberately not accepted by
 * the request schema and therefore cannot influence acceptance.
 */
export function gradeSolution(input: GradeRequest): GradeResult {
  const verification = verifyFixedTopology(input);
  if (!verification.ok) {
    return topologyFailure(input.problemSlug, verification.reason);
  }

  const solution = verification.solution;
  if (solution.kind === "voltage-divider") {
    const { r1, r2 } = solution;
    const toleranceScales = [0.999, 1.001];
    const supplyCorners = [4.5, 5, 5.5];
    const corners = supplyCorners.flatMap((supply) => toleranceScales.flatMap((r1Scale) => toleranceScales.map((r2Scale) => {
      const actualR1 = r1 * r1Scale;
      const actualR2 = r2 * r2Scale;
      const current = supply / (actualR1 + actualR2);
      return {
        ratioError: Math.abs(actualR2 / (actualR1 + actualR2) - 0.5) / 0.5 * 100,
        current,
        power: Math.max(current * current * actualR1, current * current * actualR2),
      };
    })));
    const ratioError = Math.max(...corners.map((corner) => corner.ratioError));
    const nominalRatioError = Math.abs(r2 / (r1 + r2) - 0.5) / 0.5 * 100;
    const worstCurrent = Math.max(...corners.map((corner) => corner.current));
    const worstPower = Math.max(...corners.map((corner) => corner.power));
    const rangeOk = r1 >= 1e3 && r1 <= 1e6 && r2 >= 1e3 && r2 <= 1e6;
    const e24Ok = isE24Value(r1) && isE24Value(r2);
    const ratioOk = ratioError <= 0.5;
    const currentOk = worstCurrent <= 1e-3;
    const powerOk = worstPower <= 0.25;
    const passed = rangeOk && e24Ok && ratioOk && currentOk && powerOk;
    return {
      passed,
      score: score([rangeOk, e24Ok, ratioOk, currentOk, powerOk], nominalRatioError / 0.5),
      summary: passed ? "Fixed-topology design check passed across all hidden supply corners." : "The fixed topology is valid, but at least one design constraint missed.",
      diagnostics: [
        { label: "Required topology", value: "Verified", passed: true },
        { label: "E24 value series", value: e24Ok ? "Both standard" : "Non-E24 value", passed: e24Ok },
        { label: "Worst-case ratio error", value: percent(ratioError), passed: ratioOk },
        { label: "Worst-case source current", value: `${(worstCurrent * 1e3).toFixed(3)} mA`, passed: currentOk },
        { label: "Worst resistor power", value: `${(worstPower * 1e3).toFixed(3)} mW`, passed: powerOk },
        { label: "Component range", value: rangeOk ? "Within range" : "Out of range", passed: rangeOk },
      ],
      graderVersion: "divider-fixed-topology-v2.0.0",
    };
  }

  if (solution.kind === "rc-low-pass") {
    const { r1, c1 } = solution;
    const cutoff = 1 / (2 * Math.PI * r1 * c1);
    const nominalError = Math.abs(cutoff - 1000) / 1000 * 100;
    const toleranceScales = [0.995, 1.005];
    const cornerCutoffs = toleranceScales.flatMap((rScale) => toleranceScales.map((cScale) => 1 / (2 * Math.PI * r1 * rScale * c1 * cScale)));
    const error = Math.max(...cornerCutoffs.map((corner) => Math.abs(corner - 1000) / 1000 * 100));
    const rangeOk = r1 >= 1e3 && r1 <= 100e3 && c1 >= 1e-9 && c1 <= 1e-6;
    const cutoffOk = error <= 2;
    const loadingOk = r1 >= 1e3;
    const passed = rangeOk && cutoffOk && loadingOk;
    return {
      passed,
      score: score([rangeOk, cutoffOk, loadingOk], nominalError / 2),
      summary: passed ? "Fixed-topology design check passed for cutoff and tolerance." : "The fixed topology is valid, but its trusted filter model misses at least one target.",
      diagnostics: [
        { label: "Required topology", value: "Verified", passed: true },
        { label: "Calculated cutoff", value: `${cutoff.toFixed(1)} Hz`, passed: cutoffOk },
        { label: "Worst tolerance error", value: percent(error), passed: cutoffOk },
        { label: "Component range", value: rangeOk ? "Within range" : "Out of range", passed: rangeOk },
      ],
      graderVersion: "rc-lowpass-fixed-topology-v2.0.0",
    };
  }

  const { rin, rf } = solution;
  const gain = -rf / rin;
  const nominalError = Math.abs(gain + 10) / 10 * 100;
  const toleranceScales = [0.999, 1.001];
  const cornerGains = toleranceScales.flatMap((rinScale) => toleranceScales.map((rfScale) => -rf * rfScale / (rin * rinScale)));
  const error = Math.max(...cornerGains.map((corner) => Math.abs(corner + 10) / 10 * 100));
  const inputOk = rin * Math.min(...toleranceScales) >= 8e3 && rin <= 100e3;
  const feedbackOk = rf * Math.max(...toleranceScales) <= 1e6;
  const gainOk = error <= 1;
  const passed = inputOk && feedbackOk && gainOk;
  return {
    passed,
    score: score([inputOk, feedbackOk, gainOk], nominalError),
    summary: passed ? "Fixed-topology design check passed for gain and impedance corners." : "The fixed topology is valid, but the resistor pair misses at least one design constraint.",
    diagnostics: [
      { label: "Required topology", value: "Verified", passed: true },
      { label: "Closed-loop gain", value: `${gain.toFixed(3)} V/V`, passed: gainOk },
      { label: "Worst tolerance error", value: percent(error), passed: gainOk },
      { label: "Nominal input impedance", value: `${(rin / 1e3).toFixed(2)} kΩ`, passed: inputOk },
    ],
    graderVersion: "inverting-gain-fixed-topology-v2.0.0",
  };
}

function verifyFixedTopology(input: GradeRequest): Verification {
  let circuit: CircuitIR;
  try {
    circuit = compileCircuitDocument(input.circuitDocument, "simulation");
  } catch (error) {
    if (error instanceof CircuitDocumentError) {
      const firstError = error.diagnostics.find((item) => item.severity === "error");
      return { ok: false, reason: firstError?.message ?? "The circuit document is not simulation-ready." };
    }
    return { ok: false, reason: "The circuit document could not be compiled." };
  }

  if (input.problemSlug === "precision-voltage-divider") {
    return verifyVoltageDivider(circuit);
  }
  if (input.problemSlug === "rc-cutoff-1khz") {
    return verifyRcLowPass(circuit);
  }
  return verifyInvertingAmplifier(circuit);
}

function verifyVoltageDivider(circuit: CircuitIR): Verification {
  const matched = exactComponents(circuit, {
    GND1: "ground",
    V1: "voltage-source",
    R1: "resistor",
    R2: "resistor",
  });
  if (!matched.ok) return matched;
  const ground = matched.components.GND1.nodes.gnd;
  const source = matched.components.V1;
  const r1 = matched.components.R1;
  const r2 = matched.components.R2;
  const input = source.nodes.positive;
  const output = otherNode(r1, input);
  if (
    !input || !output ||
    source.nodes.negative !== ground ||
    !connects(r1, input, output) ||
    !connects(r2, output, ground) ||
    !allDistinct(input, output, ground) ||
    !nearlyEqual(source.parameters.dcV, 5)
  ) {
    return { ok: false, reason: "Use the fixed V1 → R1 → R2 → ground divider topology with the 5 V source." };
  }
  return {
    ok: true,
    solution: {
      kind: "voltage-divider",
      r1: r1.parameters.resistanceOhm,
      r2: r2.parameters.resistanceOhm,
    },
  };
}

function verifyRcLowPass(circuit: CircuitIR): Verification {
  const matched = exactComponents(circuit, {
    GND1: "ground",
    V1: "voltage-source",
    R1: "resistor",
    C1: "capacitor",
  });
  if (!matched.ok) return matched;
  const ground = matched.components.GND1.nodes.gnd;
  const source = matched.components.V1;
  const resistor = matched.components.R1;
  const capacitor = matched.components.C1;
  const input = source.nodes.positive;
  const output = otherNode(resistor, input);
  if (
    !input || !output ||
    source.nodes.negative !== ground ||
    !connects(resistor, input, output) ||
    !connects(capacitor, output, ground) ||
    !allDistinct(input, output, ground) ||
    !source.parameters.ac ||
    !nearlyEqual(source.parameters.ac.magnitude, 1)
  ) {
    return { ok: false, reason: "Use the fixed V1 → R1 → output topology with C1 from output to ground and the 1 V AC source." };
  }
  return {
    ok: true,
    solution: {
      kind: "rc-low-pass",
      r1: resistor.parameters.resistanceOhm,
      c1: capacitor.parameters.capacitanceF,
    },
  };
}

function verifyInvertingAmplifier(circuit: CircuitIR): Verification {
  const matched = exactComponents(circuit, {
    GND1: "ground",
    V1: "voltage-source",
    RIN: "resistor",
    RF: "resistor",
    U1: "op-amp-ideal",
  });
  if (!matched.ok) return matched;
  const ground = matched.components.GND1.nodes.gnd;
  const source = matched.components.V1;
  const rin = matched.components.RIN;
  const rf = matched.components.RF;
  const opamp = matched.components.U1;
  const input = source.nodes.positive;
  const summing = opamp.nodes.inverting;
  const output = opamp.nodes.output;
  if (
    source.nodes.negative !== ground ||
    opamp.nodes.nonInverting !== ground ||
    !connects(rin, input, summing) ||
    !connects(rf, output, summing) ||
    !allDistinct(input, summing, output, ground) ||
    !nearlyEqual(source.parameters.dcV, 0.1) ||
    !nearlyEqual(opamp.parameters.openLoopGain, 1e6)
  ) {
    return { ok: false, reason: "Use the fixed grounded non-inverting op-amp topology, with RIN into the summing node and RF from output to that node." };
  }
  return {
    ok: true,
    solution: {
      kind: "inverting-amplifier",
      rin: rin.parameters.resistanceOhm,
      rf: rf.parameters.resistanceOhm,
    },
  };
}

type ComponentKind = CircuitIRComponent["kind"];
type ExpectedComponents = Readonly<Record<string, ComponentKind>>;
type MatchedComponents<T extends ExpectedComponents> = {
  [K in keyof T]: Extract<CircuitIRComponent, { kind: T[K] }>;
};
type ExactMatch<T extends ExpectedComponents> =
  | { ok: true; components: MatchedComponents<T> }
  | { ok: false; reason: string };

function exactComponents<T extends ExpectedComponents>(circuit: CircuitIR, expected: T): ExactMatch<T> {
  const entries = Object.entries(expected);
  if (circuit.components.length !== entries.length) {
    return { ok: false, reason: `This fixed-topology check requires exactly ${entries.length} electrical components.` };
  }
  const components = new Map(circuit.components.map((component) => [component.reference.toUpperCase(), component]));
  const matched: Partial<Record<keyof T, CircuitIRComponent>> = {};
  for (const [reference, kind] of entries) {
    const component = components.get(reference);
    if (!component || component.kind !== kind) {
      return { ok: false, reason: `Required ${reference} (${kind}) is missing or has the wrong component type.` };
    }
    matched[reference as keyof T] = component;
  }
  return { ok: true, components: matched as MatchedComponents<T> };
}

type TwoTerminalComponent = Extract<CircuitIRComponent, { kind: "resistor" | "capacitor" | "inductor" }>;

function connects(component: TwoTerminalComponent, first: string, second: string) {
  return (
    (component.nodes.a === first && component.nodes.b === second) ||
    (component.nodes.a === second && component.nodes.b === first)
  );
}

function otherNode(component: TwoTerminalComponent, node: string) {
  if (component.nodes.a === node) return component.nodes.b;
  if (component.nodes.b === node) return component.nodes.a;
  return null;
}

function allDistinct(...nodes: string[]) {
  return new Set(nodes).size === nodes.length;
}

function nearlyEqual(actual: number, expected: number) {
  return Math.abs(actual - expected) <= Math.max(1e-12, Math.abs(expected) * 1e-12);
}

function topologyFailure(problemSlug: GradeRequest["problemSlug"], reason: string): GradeResult {
  const versions: Record<GradeRequest["problemSlug"], string> = {
    "precision-voltage-divider": "divider-fixed-topology-v2.0.0",
    "rc-cutoff-1khz": "rc-lowpass-fixed-topology-v2.0.0",
    "inverting-gain-stage": "inverting-gain-fixed-topology-v2.0.0",
  };
  return {
    passed: false,
    score: 0,
    summary: "Fixed-topology design check rejected the schematic.",
    diagnostics: [{ label: "Required topology", value: reason, passed: false }],
    graderVersion: versions[problemSlug],
  };
}

function score(checks: boolean[], normalizedError: number) {
  const constraintScore = checks.filter(Boolean).length / checks.length * 75;
  const precisionScore = Math.max(0, 25 * (1 - Math.min(normalizedError, 1)));
  return Math.round(constraintScore + precisionScore);
}

const E24_NORMALIZED = [1, 1.1, 1.2, 1.3, 1.5, 1.6, 1.8, 2, 2.2, 2.4, 2.7, 3, 3.3, 3.6, 3.9, 4.3, 4.7, 5.1, 5.6, 6.2, 6.8, 7.5, 8.2, 9.1];

function isE24Value(value: number) {
  const decade = 10 ** Math.floor(Math.log10(value));
  const normalized = value / decade;
  return E24_NORMALIZED.some((candidate) => Math.abs(normalized - candidate) <= candidate * 1e-10);
}
